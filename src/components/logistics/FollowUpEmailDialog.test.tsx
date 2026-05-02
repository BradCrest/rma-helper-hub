import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FollowUpEmailDialog from "./FollowUpEmailDialog";

// ── Hoist mocks ────────────────────────────────────────────────────────────
const { mockInvoke, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mockInvoke },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

// ── Fixtures ───────────────────────────────────────────────────────────────
const RMA = {
  id: "rma-001",
  rma_number: "RMA-2024-001",
  customer_name: "王小明",
  customer_email: "wang@example.com",
  product_model: "CR-4",
};

// ── Helper ─────────────────────────────────────────────────────────────────
const renderDialog = (props?: Partial<Parameters<typeof FollowUpEmailDialog>[0]>) => {
  const onOpenChange = vi.fn();
  const onSent = vi.fn();
  const result = render(
    <FollowUpEmailDialog
      open={true}
      onOpenChange={onOpenChange}
      rma={RMA}
      onSent={onSent}
      {...props}
    />
  );
  return { ...result, onOpenChange, onSent };
};

// ── Setup ──────────────────────────────────────────────────────────────────
beforeEach(() => {
  mockToastSuccess.mockClear();
  mockToastError.mockClear();
  mockInvoke.mockClear();
});

// ══════════════════════════════════════════════════════════════════════════
// Dialog 基本呈現
// ══════════════════════════════════════════════════════════════════════════
describe("FollowUpEmailDialog - 基本呈現", () => {
  it("標題含 RMA 編號", () => {
    renderDialog();
    expect(screen.getByText(/寄送關懷信 — RMA-2024-001/)).toBeInTheDocument();
  });

  it("描述顯示客戶姓名和 Email", () => {
    renderDialog();
    expect(screen.getByText(/王小明/)).toBeInTheDocument();
    expect(screen.getByText(/wang@example.com/)).toBeInTheDocument();
  });

  it("「附上滿意度問卷連結」checkbox 預設為勾選", () => {
    renderDialog();
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });

  it("rma 為 null 時不 crash（Dialog 關閉狀態）", () => {
    render(
      <FollowUpEmailDialog open={false} onOpenChange={vi.fn()} rma={null} />
    );
    // 不應拋出錯誤
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AI 草稿
// ══════════════════════════════════════════════════════════════════════════
describe("FollowUpEmailDialog - AI 草稿", () => {
  it("點「AI 個人化草稿」→ 呼叫 draft-follow-up-email，成功後填入 body 並顯示 toast", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { draft: "這是 AI 草稿內容", model: "claude-3-5-haiku" },
      error: null,
    });
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: /AI 個人化草稿/ }));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith("AI 草稿已產生")
    );

    expect(mockInvoke).toHaveBeenCalledWith(
      "draft-follow-up-email",
      expect.objectContaining({ body: { rmaId: "rma-001" } })
    );

    const textarea = screen.getByPlaceholderText("關懷信內文（管理員可自由編輯）");
    expect((textarea as HTMLTextAreaElement).value).toBe("這是 AI 草稿內容");
    expect(screen.getByText(/claude-3-5-haiku/)).toBeInTheDocument();
  });

  it("AI 草稿回傳 error → 顯示 error toast", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { error: "AI 服務暫時無法使用" },
      error: null,
    });
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: /AI 個人化草稿/ }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("AI 服務暫時無法使用")
    );
  });

  it("invoke 本身丟出例外 → 顯示 error toast", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("網路錯誤"));
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: /AI 個人化草稿/ }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("網路錯誤")
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 寄送行為
// ══════════════════════════════════════════════════════════════════════════
describe("FollowUpEmailDialog - 寄送行為", () => {
  it("body 為空 → 顯示 error toast，不呼叫 send-follow-up-email", async () => {
    renderDialog();
    // body 初始為空字串
    fireEvent.click(screen.getByRole("button", { name: /寄送關懷信/ }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("請輸入信件內容")
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("填入 body → 送出 send-follow-up-email 並帶正確 payload（includeSurvey: true）", async () => {
    mockInvoke.mockResolvedValueOnce({ data: {}, error: null });
    renderDialog();

    fireEvent.change(
      screen.getByPlaceholderText("關懷信內文（管理員可自由編輯）"),
      { target: { value: "關懷信內容測試" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /寄送關懷信/ }));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith("關懷信已寄出")
    );

    expect(mockInvoke).toHaveBeenCalledWith(
      "send-follow-up-email",
      expect.objectContaining({
        body: expect.objectContaining({
          rmaId: "rma-001",
          messageBody: "關懷信內容測試",
          includeSurvey: true,
        }),
      })
    );
  });

  it("取消勾選 checkbox → 送出 includeSurvey: false", async () => {
    mockInvoke.mockResolvedValueOnce({ data: {}, error: null });
    renderDialog();

    // 取消勾選
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");

    fireEvent.change(
      screen.getByPlaceholderText("關懷信內文（管理員可自由編輯）"),
      { target: { value: "關懷信內容測試" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /寄送關懷信/ }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "send-follow-up-email",
        expect.objectContaining({
          body: expect.objectContaining({ includeSurvey: false }),
        })
      )
    );
  });

  it("送出成功 → 呼叫 onSent 並關閉 Dialog", async () => {
    mockInvoke.mockResolvedValueOnce({ data: {}, error: null });
    const { onOpenChange, onSent } = renderDialog();

    fireEvent.change(
      screen.getByPlaceholderText("關懷信內文（管理員可自由編輯）"),
      { target: { value: "關懷信內容測試" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /寄送關懷信/ }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith("關懷信已寄出"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSent).toHaveBeenCalled();
  });

  it("送出失敗（data.error）→ 顯示 error toast，不關閉", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { error: "寄送失敗，請稍後再試" },
      error: null,
    });
    const { onOpenChange } = renderDialog();

    fireEvent.change(
      screen.getByPlaceholderText("關懷信內文（管理員可自由編輯）"),
      { target: { value: "關懷信內容測試" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /寄送關懷信/ }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("寄送失敗，請稍後再試")
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("invoke 丟出例外 → 顯示 error toast", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("timeout"));
    renderDialog();

    fireEvent.change(
      screen.getByPlaceholderText("關懷信內文（管理員可自由編輯）"),
      { target: { value: "關懷信內容測試" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /寄送關懷信/ }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("timeout")
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 重設範本 & 取消
// ══════════════════════════════════════════════════════════════════════════
describe("FollowUpEmailDialog - 重設範本 & 取消", () => {
  it("點「重設範本」→ body 恢復含客戶姓名的預設範本文字", () => {
    renderDialog();

    // 先清空 body
    fireEvent.change(
      screen.getByPlaceholderText("關懷信內文（管理員可自由編輯）"),
      { target: { value: "" } }
    );
    expect(
      (screen.getByPlaceholderText("關懷信內文（管理員可自由編輯）") as HTMLTextAreaElement).value
    ).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /重設範本/ }));

    const body = (
      screen.getByPlaceholderText("關懷信內文（管理員可自由編輯）") as HTMLTextAreaElement
    ).value;
    expect(body).toContain("王小明");
    expect(body).toContain("CR-4");
    expect(body).toContain("RMA-2024-001");
  });

  it("點「取消」→ 呼叫 onOpenChange(false)", () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

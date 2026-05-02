import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ClosingTab from "./ClosingTab";
import { server } from "@/mocks/server";
import { http, HttpResponse } from "msw";

const SUPABASE_URL = "https://xrbvyfoewbwywrwocrpf.supabase.co";
const FOLLOW_UP_DAYS = 7;

// ── Hoist mocks ────────────────────────────────────────────────────────────
const { mockFrom, mockToastSuccess, mockToastError, mockGetSession } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockGetSession: vi.fn().mockResolvedValue({
    data: { session: { access_token: "mock-token" } },
    error: null,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
    auth: { getSession: mockGetSession },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

// ── Fixtures ───────────────────────────────────────────────────────────────
const SHIPPED_BACK_RMA = {
  id: "rma-001",
  rma_number: "RMA-2024-001",
  customer_name: "王小明",
  product_model: "CR-4",
  status: "shipped_back_refurbished",
  updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  follow_up_due_at: null,
};

const FOLLOW_UP_RMA = {
  ...SHIPPED_BACK_RMA,
  id: "rma-002",
  rma_number: "RMA-2024-002",
  status: "follow_up",
  follow_up_due_at: new Date(Date.now() + 3 * 86400000).toISOString(), // 3 天後
};

const FOLLOW_UP_OVERDUE_RMA = {
  ...SHIPPED_BACK_RMA,
  id: "rma-003",
  rma_number: "RMA-2024-003",
  status: "follow_up",
  follow_up_due_at: new Date(Date.now() - 2 * 86400000).toISOString(), // 逾期 2 天
};

const FOLLOW_UP_TODAY_RMA = {
  ...SHIPPED_BACK_RMA,
  id: "rma-004",
  rma_number: "RMA-2024-004",
  status: "follow_up",
  // 500ms 前到期 → remaining = Math.ceil(-0.000006) = 0 → 今日到期
  follow_up_due_at: new Date(Date.now() - 500).toISOString(),
};

const FOLLOW_UP_NULL_DUE_RMA = {
  ...SHIPPED_BACK_RMA,
  id: "rma-005",
  rma_number: "RMA-2024-005",
  status: "follow_up",
  follow_up_due_at: null, // 舊資料，沒有到期日
};

// ── Supabase mock helper ───────────────────────────────────────────────────
function setupMock(rmaList = [SHIPPED_BACK_RMA]) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "rma_requests") {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: rmaList, error: null }),
          }),
        }),
      };
    }
    return { select: vi.fn() };
  });
}

// ── Setup ──────────────────────────────────────────────────────────────────
beforeEach(() => {
  mockToastSuccess.mockClear();
  mockToastError.mockClear();
  setupMock();
  // fetch 預設成功（update-rma-status）
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })
  );
});

// ══════════════════════════════════════════════════════════════════════════
// 列表顯示
// ══════════════════════════════════════════════════════════════════════════
describe("ClosingTab - 列表顯示", () => {
  it("無待結案案件時顯示空狀態訊息", async () => {
    setupMock([]);
    render(<ClosingTab />);
    await waitFor(() =>
      expect(screen.getByText("目前沒有待結案追蹤的案件")).toBeInTheDocument()
    );
  });

  it("正確呈現 RMA 編號、狀態 badge、更新天數", async () => {
    render(<ClosingTab />);
    await waitFor(() => {
      expect(screen.getByText("RMA-2024-001")).toBeInTheDocument();
      expect(screen.getByText("已寄出整新機")).toBeInTheDocument();
      expect(screen.getByText(/5 天/)).toBeInTheDocument();
    });
  });

  it("shipped_back_* 顯示「追蹤中」和「結案」兩個按鈕", async () => {
    render(<ClosingTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));
    expect(screen.getByRole("button", { name: /追蹤中/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /結案/ })).toBeInTheDocument();
  });

  it("follow_up 狀態只顯示「結案」按鈕，不顯示「追蹤中」", async () => {
    setupMock([FOLLOW_UP_RMA]);
    render(<ClosingTab />);
    await waitFor(() => screen.getByText("RMA-2024-002"));
    expect(screen.queryByRole("button", { name: /追蹤中/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /結案/ })).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// follow_up 關懷倒數 badge
// ══════════════════════════════════════════════════════════════════════════
describe("ClosingTab - follow_up 關懷倒數 badge", () => {
  it("逾期 2 天：顯示「逾期 2 天」", async () => {
    setupMock([FOLLOW_UP_OVERDUE_RMA]);
    render(<ClosingTab />);
    await waitFor(() =>
      expect(screen.getByText(/逾期 2 天/)).toBeInTheDocument()
    );
  });

  it("今日到期：顯示「今日到期」", async () => {
    setupMock([FOLLOW_UP_TODAY_RMA]);
    render(<ClosingTab />);
    await waitFor(() =>
      expect(screen.getByText("今日到期")).toBeInTheDocument()
    );
  });

  it("3 天後：顯示「3 天後關懷」", async () => {
    setupMock([FOLLOW_UP_RMA]);
    render(<ClosingTab />);
    await waitFor(() =>
      expect(screen.getByText("3 天後關懷")).toBeInTheDocument()
    );
  });

  it("follow_up_due_at 為 null 時顯示更新天數而非關懷倒數", async () => {
    setupMock([FOLLOW_UP_NULL_DUE_RMA]);
    render(<ClosingTab />);
    await waitFor(() =>
      expect(screen.getByText(/5 天/)).toBeInTheDocument()
    );
    // 不應出現倒數類文字（表頭的「關懷倒數」除外，以下皆是資料列內容）
    expect(screen.queryByText(/天後關懷/)).not.toBeInTheDocument();
    expect(screen.queryByText("今日到期")).not.toBeInTheDocument();
    expect(screen.queryByText(/逾期/)).not.toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 結案 Dialog — checkbox 預設值
// ══════════════════════════════════════════════════════════════════════════
describe("ClosingTab - 結案 Dialog checkbox 預設值", () => {
  it("從 shipped_back_* 開啟結案 dialog → checkbox 預設勾選", async () => {
    render(<ClosingTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));
    fireEvent.click(screen.getByRole("button", { name: /結案/ }));
    await screen.findByText(/確認結案 — RMA-2024-001/);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });

  it("從 follow_up 開啟結案 dialog → checkbox 預設未勾選", async () => {
    setupMock([FOLLOW_UP_RMA]);
    render(<ClosingTab />);
    await waitFor(() => screen.getByText("RMA-2024-002"));
    fireEvent.click(screen.getByRole("button", { name: /結案/ }));
    await screen.findByText(/確認結案 — RMA-2024-002/);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 結案 Dialog — 提交行為
// ══════════════════════════════════════════════════════════════════════════
describe("ClosingTab - 結案 Dialog 提交", () => {
  it("checkbox 保持勾選 → 送出 follow_up + follow_up_due_at 約 7 天後", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(<ClosingTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));
    fireEvent.click(screen.getByRole("button", { name: /結案/ }));
    await screen.findByText(/確認結案 — RMA-2024-001/);

    // checkbox 已勾選，按鈕文字為「標記追蹤（7 天）」
    fireEvent.click(screen.getByRole("button", { name: /標記追蹤/ }));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("已標記為追蹤中")
      )
    );

    const call = fetchMock.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes("update-rma-status")
    );
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.new_status).toBe("follow_up");
    const daysUntilDue =
      (new Date(body.follow_up_due_at).getTime() - Date.now()) / 86400000;
    expect(daysUntilDue).toBeGreaterThan(FOLLOW_UP_DAYS - 1);
    expect(daysUntilDue).toBeLessThanOrEqual(FOLLOW_UP_DAYS);
  });

  it("取消勾選 → 送出 closed + follow_up_due_at null", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(<ClosingTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));
    fireEvent.click(screen.getByRole("button", { name: /結案/ }));
    await screen.findByText(/確認結案 — RMA-2024-001/);

    // 取消勾選
    fireEvent.click(screen.getByRole("checkbox"));

    fireEvent.click(screen.getByRole("button", { name: /確認結案/ }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith("案件已結案"));

    const body = JSON.parse(
      (fetchMock.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes("update-rma-status")
      )![1] as RequestInit).body as string
    );
    expect(body.new_status).toBe("closed");
    expect(body.follow_up_due_at).toBeNull();
  });

  it("從 follow_up 結案（checkbox 未勾選）→ 送出 closed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    setupMock([FOLLOW_UP_RMA]);
    render(<ClosingTab />);
    await waitFor(() => screen.getByText("RMA-2024-002"));
    fireEvent.click(screen.getByRole("button", { name: /結案/ }));
    await screen.findByText(/確認結案 — RMA-2024-002/);

    fireEvent.click(screen.getByRole("button", { name: /確認結案/ }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith("案件已結案"));

    const body = JSON.parse(
      (fetchMock.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes("update-rma-status")
      )![1] as RequestInit).body as string
    );
    expect(body.new_status).toBe("closed");
    expect(body.follow_up_due_at).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 「追蹤中」按鈕（shipped_back → follow_up 直接路徑）
// ══════════════════════════════════════════════════════════════════════════
describe("ClosingTab - 追蹤中按鈕", () => {
  it("點「追蹤中」→ dialog 標題含「標記追蹤中」，且不顯示 checkbox", async () => {
    render(<ClosingTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));
    fireEvent.click(screen.getByRole("button", { name: /追蹤中/ }));
    await screen.findByText(/標記追蹤中 — RMA-2024-001/);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("確認追蹤中 → 送出 follow_up + follow_up_due_at，toast 含「7 天後到期」", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(<ClosingTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));
    fireEvent.click(screen.getByRole("button", { name: /追蹤中/ }));
    await screen.findByText(/標記追蹤中 — RMA-2024-001/);
    fireEvent.click(screen.getByRole("button", { name: /確認追蹤中/ }));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("7 天後到期")
      )
    );

    const body = JSON.parse(
      (fetchMock.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes("update-rma-status")
      )![1] as RequestInit).body as string
    );
    expect(body.new_status).toBe("follow_up");
    expect(body.follow_up_due_at).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// API 失敗
// ══════════════════════════════════════════════════════════════════════════
describe("ClosingTab - API 失敗", () => {
  it("update-rma-status 回傳 500 → 顯示 error toast", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/functions/v1/update-rma-status`, () =>
        HttpResponse.json({ error: "伺服器錯誤" }, { status: 500 })
      )
    );
    vi.unstubAllGlobals(); // 讓 fetch 走 MSW

    render(<ClosingTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));
    fireEvent.click(screen.getByRole("button", { name: /結案/ }));
    await screen.findByText(/確認結案 — RMA-2024-001/);

    // 取消勾選讓按鈕出現「確認結案」
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /確認結案/ }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining("伺服器錯誤")
      )
    );
  });
});

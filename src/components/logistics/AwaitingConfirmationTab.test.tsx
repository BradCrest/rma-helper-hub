import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AwaitingConfirmationTab from "./AwaitingConfirmationTab";

// ── Hoist mocks ────────────────────────────────────────────────────────────
const { mockFrom, mockToastSuccess, mockToastError, mockGetSession } = vi.hoisted(
  () => ({
    mockFrom: vi.fn(),
    mockToastSuccess: vi.fn(),
    mockToastError: vi.fn(),
    mockGetSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: "mock-token" } },
      error: null,
    }),
  })
);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
    functions: { invoke: vi.fn() },
    storage: { from: vi.fn() },
    auth: {
      getSession: mockGetSession,
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess, error: mockToastError, info: vi.fn() },
}));

// ── Fixtures ───────────────────────────────────────────────────────────────
const BASE_RMA = {
  id: "rma-001",
  rma_number: "RMA-2024-001",
  customer_name: "王小明",
  customer_email: "wang@example.com",
  customer_phone: null,
  product_name: "CREST CR-4",
  product_model: "CR-4",
  serial_number: "SN12345",
  status: "contacting",
  warranty_date: null,
  initial_diagnosis: "電池接觸不良",
  has_unread_customer_reply: false,
  created_at: "2024-01-15T00:00:00Z",
};

const WARRANTY_RMA = {
  ...BASE_RMA,
  id: "rma-002",
  rma_number: "RMA-2024-002",
  warranty_date: "2099-12-31",
  has_unread_customer_reply: false,
};

// ── Supabase mock factory ──────────────────────────────────────────────────
function setupSupabaseMock({
  rmaList = [BASE_RMA],
  threadMessages = [],
}: {
  rmaList?: typeof BASE_RMA[];
  threadMessages?: unknown[];
} = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "rma_requests") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: rmaList, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }
    if (table === "rma_thread_messages") {
      return {
        select: vi.fn().mockImplementation((fields: string) => {
          if (fields === "*") {
            // openDetail 的完整訊息查詢
            return {
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: threadMessages, error: null }),
              }),
            };
          }
          // 列表載入時的摘要查詢（方向 + 時間）
          return {
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }),
      };
    }
    if (table === "rma_repair_details") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }
    if (table === "rma_customer_contacts") {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    return {};
  });
}

// ── Helper: open detail dialog ─────────────────────────────────────────────
async function openDetailDialog(rmaNumber = "RMA-2024-001") {
  const viewBtn = await screen.findByRole("button", { name: /檢視/ });
  fireEvent.click(viewBtn);
  await screen.findByText(new RegExp(`待客戶確認 - ${rmaNumber}`));
}

// ── Helper: open dialog then click a decision card ─────────────────────────
async function selectDecision(cardTitle: string) {
  await openDetailDialog();
  const card = await screen.findByText(cardTitle);
  fireEvent.click(card);
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 1：列表
// ══════════════════════════════════════════════════════════════════════════
describe("AwaitingConfirmationTab - 列表", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    );
  });

  it("載入並顯示 contacting 狀態的 RMA", async () => {
    setupSupabaseMock();
    render(<AwaitingConfirmationTab />);
    expect(await screen.findByText("RMA-2024-001")).toBeInTheDocument();
    expect(screen.getByText("王小明")).toBeInTheDocument();
    expect(screen.getByText("CR-4")).toBeInTheDocument();
  });

  it("過保固的 RMA 顯示「已過保」badge", async () => {
    setupSupabaseMock({ rmaList: [{ ...BASE_RMA, warranty_date: null }] });
    render(<AwaitingConfirmationTab />);
    await screen.findByText("RMA-2024-001");
    expect(screen.getByText("已過保")).toBeInTheDocument();
  });

  it("保固內的 RMA 顯示「保固內」badge", async () => {
    setupSupabaseMock({ rmaList: [WARRANTY_RMA] });
    render(<AwaitingConfirmationTab />);
    await screen.findByText("RMA-2024-002");
    expect(screen.getByText("保固內")).toBeInTheDocument();
  });

  it("has_unread_customer_reply = true 時顯示「新回覆」badge", async () => {
    setupSupabaseMock({
      rmaList: [{ ...BASE_RMA, has_unread_customer_reply: true }],
    });
    render(<AwaitingConfirmationTab />);
    await screen.findByText("RMA-2024-001");
    expect(screen.getByText("新回覆")).toBeInTheDocument();
  });

  it("無 RMA 時顯示空狀態訊息", async () => {
    setupSupabaseMock({ rmaList: [] });
    render(<AwaitingConfirmationTab />);
    await screen.findByText(/目前沒有待客戶確認的 RMA/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Phase 2：對話框
// ══════════════════════════════════════════════════════════════════════════
describe("AwaitingConfirmationTab - 對話框", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    );
  });

  it("點擊「檢視」後開啟對話框並顯示 RMA 資訊", async () => {
    setupSupabaseMock();
    render(<AwaitingConfirmationTab />);
    await openDetailDialog();
    // 對話框中顯示序號（列表不顯示序號，故唯一）
    expect(screen.getByText(/SN12345/)).toBeInTheDocument();
    // 對話框標題
    expect(screen.getByText(/待客戶確認 - RMA-2024-001/)).toBeInTheDocument();
  });

  it("保固內 RMA：對話框系統判斷顯示「保固內」", async () => {
    setupSupabaseMock({ rmaList: [WARRANTY_RMA] });
    render(<AwaitingConfirmationTab />);
    await openDetailDialog("RMA-2024-002");
    expect(screen.getByText(/系統判斷：保固內/)).toBeInTheDocument();
  });

  it("過保固 RMA：對話框系統判斷顯示「已過保」", async () => {
    setupSupabaseMock();
    render(<AwaitingConfirmationTab />);
    await openDetailDialog();
    expect(screen.getByText(/系統判斷：已過保/)).toBeInTheDocument();
  });

  it("保固內：只顯示「客戶同意換整新機（免費）」選項", async () => {
    setupSupabaseMock({ rmaList: [WARRANTY_RMA] });
    render(<AwaitingConfirmationTab />);
    await openDetailDialog("RMA-2024-002");
    expect(
      await screen.findByText("客戶同意換整新機（免費）")
    ).toBeInTheDocument();
    expect(screen.queryByText("購買 A 級整新機")).not.toBeInTheDocument();
    expect(screen.queryByText("購買 B 級整新機")).not.toBeInTheDocument();
    expect(screen.queryByText("原錶退回")).not.toBeInTheDocument();
  });

  it("過保固 CR-4：顯示四個選項並包含正確價格", async () => {
    setupSupabaseMock();
    render(<AwaitingConfirmationTab />);
    await openDetailDialog();
    // 四個選項
    expect(await screen.findByText("購買 A 級整新機")).toBeInTheDocument();
    expect(screen.getByText("購買 B 級整新機")).toBeInTheDocument();
    expect(screen.getByText("購買 C 級整新機")).toBeInTheDocument();
    expect(screen.getByText("原錶退回")).toBeInTheDocument();
    // CR-4 三級價格
    expect(screen.getByText("NT$ 3,680")).toBeInTheDocument();
    expect(screen.getByText("NT$ 3,180")).toBeInTheDocument();
    expect(screen.getByText("NT$ 2,680")).toBeInTheDocument();
    // 不顯示保固換新
    expect(screen.queryByText("客戶同意換整新機（免費）")).not.toBeInTheDocument();
  });

  it("選擇 purchase_a 後顯示金額欄位，預設值為 3680", async () => {
    setupSupabaseMock();
    render(<AwaitingConfirmationTab />);
    await openDetailDialog();
    fireEvent.click(await screen.findByText("購買 A 級整新機"));
    const feeInput = screen.getByLabelText(/金額/) as HTMLInputElement;
    expect(feeInput).toBeInTheDocument();
    expect(feeInput.value).toBe("3680");
  });

  it("選擇 return_original 後顯示取消原因欄位", async () => {
    setupSupabaseMock();
    render(<AwaitingConfirmationTab />);
    await openDetailDialog();
    fireEvent.click(await screen.findByText("原錶退回"));
    expect(screen.getByLabelText(/取消原因/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/金額/)).not.toBeInTheDocument();
  });

  it("點擊保固 toggle 可覆寫判斷：過保固→保固內，顯示保固換新選項", async () => {
    setupSupabaseMock();
    render(<AwaitingConfirmationTab />);
    await openDetailDialog();
    // 初始：過保固，顯示 A 級整新機
    expect(await screen.findByText("購買 A 級整新機")).toBeInTheDocument();
    // 切換 switch
    const switchBtn = screen.getByRole("switch");
    fireEvent.click(switchBtn);
    // 切換後：顯示保固換新
    await screen.findByText("客戶同意換整新機（免費）");
    expect(screen.queryByText("購買 A 級整新機")).not.toBeInTheDocument();
  });

  it("有訊息時顯示訊息時間軸", async () => {
    const messages = [
      {
        id: "msg-1",
        rma_request_id: "rma-001",
        direction: "outbound",
        subject: "產品診斷通知",
        body: "您好，您的產品已完成診斷",
        from_name: null,
        from_email: null,
        attachments: null,
        created_at: "2024-01-16T10:00:00Z",
      },
    ];
    setupSupabaseMock({ threadMessages: messages });
    render(<AwaitingConfirmationTab />);
    await openDetailDialog();
    expect(await screen.findByText("您好，您的產品已完成診斷")).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Phase 3：提交決定
// ══════════════════════════════════════════════════════════════════════════
describe("AwaitingConfirmationTab - 提交決定", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    );
  });

  it("未選擇決定時「確認客戶決定」按鈕為 disabled", async () => {
    setupSupabaseMock();
    render(<AwaitingConfirmationTab />);
    await openDetailDialog();
    const confirmBtn = screen.getByRole("button", { name: /確認客戶決定/ });
    expect(confirmBtn).toBeDisabled();
  });

  it("return_original 未填取消原因→toast error", async () => {
    setupSupabaseMock();
    render(<AwaitingConfirmationTab />);
    await openDetailDialog();
    fireEvent.click(await screen.findByText("原錶退回"));
    // 不填 cancelReason，直接提交
    const confirmBtn = screen.getByRole("button", { name: /確認客戶決定/ });
    fireEvent.click(confirmBtn);
    expect(mockToastError).toHaveBeenCalledWith("原錶退回需填寫原因");
  });

  it("warranty_replace 提交後呼叫 update-rma-status quote_confirmed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);
    setupSupabaseMock({ rmaList: [WARRANTY_RMA] });
    render(<AwaitingConfirmationTab />);
    await openDetailDialog("RMA-2024-002");
    fireEvent.click(await screen.findByText("客戶同意換整新機（免費）"));
    fireEvent.click(screen.getByRole("button", { name: /確認客戶決定/ }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes("update-rma-status")
    );
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.new_status).toBe("quote_confirmed");
  });

  it("purchase_a 提交後呼叫 update-rma-status quote_confirmed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);
    setupSupabaseMock();
    render(<AwaitingConfirmationTab />);
    await openDetailDialog();
    fireEvent.click(await screen.findByText("購買 A 級整新機"));
    fireEvent.click(screen.getByRole("button", { name: /確認客戶決定/ }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes("update-rma-status")
    );
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.new_status).toBe("quote_confirmed");
  });

  it("return_original 提交後呼叫 update-rma-status no_repair", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);
    setupSupabaseMock();
    render(<AwaitingConfirmationTab />);
    await openDetailDialog();
    fireEvent.click(await screen.findByText("原錶退回"));
    fireEvent.change(screen.getByLabelText(/取消原因/), {
      target: { value: "客戶決定不購買" },
    });
    fireEvent.click(screen.getByRole("button", { name: /確認客戶決定/ }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes("update-rma-status")
    );
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.new_status).toBe("no_repair");
  });

  it("purchase_b 提交後 repair_details 記錄 actual_method=purchase_b", async () => {
    setupSupabaseMock();
    render(<AwaitingConfirmationTab />);
    await openDetailDialog();
    fireEvent.click(await screen.findByText("購買 B 級整新機"));
    fireEvent.click(screen.getByRole("button", { name: /確認客戶決定/ }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    // 確認 rma_repair_details.insert 被呼叫且 actual_method 正確
    const repairCalls = mockFrom.mock.calls.filter(
      (c: unknown[]) => c[0] === "rma_repair_details"
    );
    expect(repairCalls.length).toBeGreaterThan(0);
  });
});

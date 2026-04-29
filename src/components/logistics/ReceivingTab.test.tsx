import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReceivingTab from "./ReceivingTab";

// ── Hoist mocks ────────────────────────────────────────────────────────────
const { mockFrom, mockInvoke, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockInvoke: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
    functions: { invoke: mockInvoke },
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "mock-token" } },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

// ── Fixtures ───────────────────────────────────────────────────────────────
const BASE_RMA = {
  id: "rma-001",
  rma_number: "RMA-2024-001",
  customer_name: "王小明",
  customer_email: "wang@example.com",
  product_name: "TERIC",
  product_model: "TERIC",
  serial_number: "SN12345",
  status: "inspecting",
  received_date: "2024-01-15",
  issue_type: "功能異常",
  issue_description: "顯示器不亮",
  initial_diagnosis: "電池接觸不良",
  diagnosis_category: "功能異常",
  created_at: "2024-01-15T00:00:00Z",
};

const BASE_REPAIR = {
  id: "detail-001",
  rma_request_id: "rma-001",
  planned_method: "repair",
  actual_method: "維修",
  internal_reference: null,
  estimated_cost: 1500,
  actual_cost: null,
  replacement_model: null,
  replacement_serial: null,
};

// ── Supabase mock factory ──────────────────────────────────────────────────
function setupSupabaseMock({
  rmaList = [BASE_RMA],
  repairDetail = BASE_REPAIR,
  rmaDetail = { initial_diagnosis: BASE_RMA.initial_diagnosis, diagnosis_category: BASE_RMA.diagnosis_category },
} = {}) {
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const mockUpdateRma = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === "rma_repair_details") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: repairDetail, error: null }),
          }),
        }),
        insert: mockInsert,
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
    }
    // rma_requests
    return {
      select: vi.fn().mockImplementation((fields: string) => {
        if (fields === "initial_diagnosis, diagnosis_category") {
          return {
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: rmaDetail, error: null }),
            }),
          };
        }
        return {
          order: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: rmaList, error: null }),
            eq: vi.fn().mockResolvedValue({ data: rmaList, error: null }),
          }),
        };
      }),
      update: mockUpdateRma,
    };
  });

  return { mockInsert, mockUpdateRma };
}

// ── Helper: open the detail dialog ────────────────────────────────────────
async function openDialog() {
  const viewBtn = await screen.findByRole("button", { name: /檢視/ });
  fireEvent.click(viewBtn);
  await screen.findByText(/收件處理 - RMA-2024-001/);
}

// ── Helper: open notify AlertDialog ───────────────────────────────────────
async function openNotifyDialog() {
  await openDialog();
  const notifyBtn = screen.getByRole("button", { name: /通知客戶診斷結果/ });
  fireEvent.click(notifyBtn);
  await screen.findByText("寄送診斷通知給客戶");
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 1：基本欄位
// ══════════════════════════════════════════════════════════════════════════
describe("ReceivingTab - Phase 1 診斷欄位", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockInvoke.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));
  });

  it("列表正常載入並顯示 RMA 資料", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    expect(await screen.findByText("RMA-2024-001")).toBeInTheDocument();
    expect(screen.getByText("王小明")).toBeInTheDocument();
  });

  it("點擊「檢視」後開啟對話框，顯示診斷分類和實際處理方式欄位", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openDialog();
    expect(screen.getByText("診斷分類")).toBeInTheDocument();
    expect(screen.getByText("實際處理方式")).toBeInTheDocument();
  });

  it("對話框預設不顯示替換欄位", async () => {
    setupSupabaseMock({ repairDetail: { ...BASE_REPAIR, actual_method: null } });
    render(<ReceivingTab />);
    await openDialog();
    expect(screen.queryByLabelText("替換型號")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("替換序號")).not.toBeInTheDocument();
  });

  it("選擇「換新」後顯示替換型號和替換序號欄位", async () => {
    const user = userEvent.setup();
    setupSupabaseMock({ repairDetail: { ...BASE_REPAIR, actual_method: null } });
    render(<ReceivingTab />);
    await openDialog();

    await user.click(screen.getByLabelText("實際處理方式"));
    await user.click(await screen.findByRole("option", { name: "換新" }));

    expect(screen.getByLabelText("替換型號")).toBeInTheDocument();
    expect(screen.getByLabelText("替換序號")).toBeInTheDocument();
  });

  it("選擇非「換新」時不顯示替換欄位", async () => {
    const user = userEvent.setup();
    setupSupabaseMock({ repairDetail: { ...BASE_REPAIR, actual_method: null } });
    render(<ReceivingTab />);
    await openDialog();

    await user.click(screen.getByLabelText("實際處理方式"));
    await user.click(await screen.findByRole("option", { name: "維修" }));

    expect(screen.queryByLabelText("替換型號")).not.toBeInTheDocument();
  });

  it("選擇「換新」並填入資料後，儲存 payload 包含 replacement_model 和 replacement_serial", async () => {
    const user = userEvent.setup();
    const { mockInsert } = setupSupabaseMock({ repairDetail: null });
    render(<ReceivingTab />);
    await openDialog();

    await user.click(screen.getByLabelText("實際處理方式"));
    await user.click(await screen.findByRole("option", { name: "換新" }));
    await user.type(screen.getByLabelText("替換型號"), "TERIC-NEW");
    await user.type(screen.getByLabelText("替換序號"), "SN99999");

    fireEvent.click(screen.getByRole("button", { name: "儲存記錄" }));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          actual_method: "換新",
          replacement_model: "TERIC-NEW",
          replacement_serial: "SN99999",
        })
      );
    });
  });

  it("選擇「維修」時儲存的 replacement 欄位為 null", async () => {
    const user = userEvent.setup();
    const { mockInsert } = setupSupabaseMock({ repairDetail: null });
    render(<ReceivingTab />);
    await openDialog();

    await user.click(screen.getByLabelText("實際處理方式"));
    await user.click(await screen.findByRole("option", { name: "維修" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存記錄" }));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          actual_method: "維修",
          replacement_model: null,
          replacement_serial: null,
        })
      );
    });
  });

  it("選擇 diagnosis_category 後儲存時更新至 rma_requests", async () => {
    const user = userEvent.setup();
    const { mockUpdateRma } = setupSupabaseMock({ repairDetail: null });
    render(<ReceivingTab />);
    await openDialog();

    await user.click(screen.getByLabelText("診斷分類"));
    await user.click(await screen.findByRole("option", { name: "外觀損壞" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存記錄" }));

    await waitFor(() => {
      expect(mockUpdateRma).toHaveBeenCalledWith(
        expect.objectContaining({ diagnosis_category: "外觀損壞" })
      );
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Phase 2：通知客戶診斷結果
// ══════════════════════════════════════════════════════════════════════════
describe("ReceivingTab - Phase 2 通知客戶診斷結果", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockInvoke.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));
  });

  // ── 按鈕 disable 條件 ───────────────────────────────────────────────────
  it("RMA 有 email 且有 initial_diagnosis 時，通知按鈕為啟用", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openDialog();
    expect(screen.getByRole("button", { name: /通知客戶診斷結果/ })).not.toBeDisabled();
  });

  it("RMA 沒有 customer_email 時，通知按鈕為 disabled", async () => {
    setupSupabaseMock({ rmaList: [{ ...BASE_RMA, customer_email: null }] });
    render(<ReceivingTab />);
    await openDialog();
    expect(screen.getByRole("button", { name: /通知客戶診斷結果/ })).toBeDisabled();
  });

  it("RMA 沒有 initial_diagnosis 時，通知按鈕為 disabled", async () => {
    setupSupabaseMock({ rmaList: [{ ...BASE_RMA, initial_diagnosis: null }] });
    render(<ReceivingTab />);
    await openDialog();
    expect(screen.getByRole("button", { name: /通知客戶診斷結果/ })).toBeDisabled();
  });

  it("initial_diagnosis 為空字串時，通知按鈕為 disabled", async () => {
    setupSupabaseMock({ rmaList: [{ ...BASE_RMA, initial_diagnosis: "   " }] });
    render(<ReceivingTab />);
    await openDialog();
    expect(screen.getByRole("button", { name: /通知客戶診斷結果/ })).toBeDisabled();
  });

  // ── AlertDialog 預覽內容 ────────────────────────────────────────────────
  it("點擊通知按鈕後開啟 AlertDialog，顯示收件人 email", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();
    expect(screen.getByText("wang@example.com")).toBeInTheDocument();
  });

  it("AlertDialog 主旨包含 RMA 編號", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();
    expect(
      screen.getByText(/\[RMA-2024-001\] 產品檢測結果與處理方式確認/)
    ).toBeInTheDocument();
  });

  it("AlertDialog 信件預覽包含診斷分類、診斷描述、處理方式和費用", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    // 【xxx】格式只出現在 email 預覽的 <pre> 裡
    expect(screen.getByText(/【診斷描述】電池接觸不良/)).toBeInTheDocument();
    expect(screen.getByText(/【診斷分類】功能異常/)).toBeInTheDocument();
    expect(screen.getByText(/【預估費用】NT\$ 1500/)).toBeInTheDocument();
    expect(screen.getByText(/【建議處理方式】維修/)).toBeInTheDocument();
  });

  it("無費用資料時，預覽顯示「待報價」", async () => {
    setupSupabaseMock({ repairDetail: { ...BASE_REPAIR, estimated_cost: null } });
    render(<ReceivingTab />);
    await openNotifyDialog();
    expect(screen.getByText(/待報價/)).toBeInTheDocument();
  });

  // ── send-rma-reply invoke payload ───────────────────────────────────────
  it("確認寄出後，以正確 payload 呼叫 send-rma-reply", async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    fireEvent.click(screen.getByRole("button", { name: "確認寄出" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "send-rma-reply",
        expect.objectContaining({
          body: expect.objectContaining({
            rmaRequestId: "rma-001",
            subject: "[RMA-2024-001] 產品檢測結果與處理方式確認",
            attachments: [],
          }),
        })
      );
    });
    // body 內容也驗證
    const invokeCall = mockInvoke.mock.calls[0][1];
    expect(invokeCall.body.body).toContain("電池接觸不良");
    expect(invokeCall.body.body).toContain("NT$ 1500");
  });

  // ── 寄出後狀態切換 ─────────────────────────────────────────────────────
  it("寄出成功後顯示 success toast 並呼叫 update-rma-status", async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", mockFetch);
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    fireEvent.click(screen.getByRole("button", { name: "確認寄出" }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("wang@example.com")
      );
    });

    // update-rma-status 呼叫包含 new_status: contacting
    const statusCall = mockFetch.mock.calls.find((c) =>
      String(c[0]).includes("update-rma-status")
    );
    expect(statusCall).toBeDefined();
    const callBody = JSON.parse(statusCall[1].body);
    expect(callBody).toMatchObject({ rma_id: "rma-001", new_status: "contacting" });
  });

  // ── 失敗時的處理 ────────────────────────────────────────────────────────
  it("send-rma-reply 失敗時顯示 error toast，不呼叫 update-rma-status", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error("network error") });
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", mockFetch);
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    fireEvent.click(screen.getByRole("button", { name: "確認寄出" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining("寄送失敗")
      );
    });
    expect(mockToastSuccess).not.toHaveBeenCalled();

    const statusCall = mockFetch.mock.calls.find((c) =>
      String(c[0]).includes("update-rma-status")
    );
    expect(statusCall).toBeUndefined();
  });

  it("send-rma-reply 回傳 error 物件時顯示 error toast", async () => {
    mockInvoke.mockResolvedValue({
      data: { error: "Quota exceeded" },
      error: null,
    });
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openNotifyDialog();

    fireEvent.click(screen.getByRole("button", { name: "確認寄出" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining("寄送失敗")
      );
    });
  });
});

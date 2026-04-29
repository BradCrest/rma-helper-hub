import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReceivingTab from "./ReceivingTab";

// ── Hoist mocks ────────────────────────────────────────────────────────────
const { mockFrom, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
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

// ── Test fixtures ──────────────────────────────────────────────────────────
const MOCK_RMA = {
  id: "rma-001",
  rma_number: "RMA-2024-001",
  customer_name: "王小明",
  product_name: "TERIC",
  product_model: "TERIC",
  serial_number: "SN12345",
  status: "received",
  received_date: "2024-01-15",
  issue_type: "功能異常",
  issue_description: "顯示器不亮",
  created_at: "2024-01-15T00:00:00Z",
};

// ── Mock factory ───────────────────────────────────────────────────────────
function setupSupabaseMock({
  rmaList = [MOCK_RMA],
  repairDetail = null,
  rmaDetail = { initial_diagnosis: null, diagnosis_category: null },
} = {}) {
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const mockUpdateRma = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  const mockUpdateRepair = vi.fn().mockReturnValue({
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
        update: mockUpdateRepair,
      };
    }

    // table === "rma_requests"
    return {
      select: vi.fn().mockImplementation((fields: string) => {
        if (fields === "initial_diagnosis, diagnosis_category") {
          // Detail fetch for dialog
          return {
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: rmaDetail, error: null }),
            }),
          };
        }
        // List fetch: .select("*").order(...).in(...)
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

  return { mockInsert, mockUpdateRma, mockUpdateRepair };
}

// ── Helpers ────────────────────────────────────────────────────────────────
async function openDialog() {
  const viewBtn = await screen.findByRole("button", { name: /檢視/ });
  fireEvent.click(viewBtn);
  await screen.findByText(/收件處理 - RMA-2024-001/);
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("ReceivingTab - Phase 1 新欄位", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
  });

  it("列表正常載入並顯示 RMA 資料", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    expect(await screen.findByText("RMA-2024-001")).toBeInTheDocument();
    expect(screen.getByText("王小明")).toBeInTheDocument();
    expect(screen.getByText("TERIC")).toBeInTheDocument();
  });

  it("點擊「檢視」後打開對話框，顯示三個新欄位標題", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openDialog();
    expect(screen.getByText("診斷分類")).toBeInTheDocument();
    expect(screen.getByText("實際處理方式")).toBeInTheDocument();
  });

  it("對話框預設不顯示替換欄位", async () => {
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openDialog();
    expect(screen.queryByLabelText("替換型號")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("替換序號")).not.toBeInTheDocument();
  });

  it("選擇「換新」後顯示替換型號和替換序號欄位", async () => {
    const user = userEvent.setup();
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openDialog();

    await user.click(screen.getByLabelText("實際處理方式"));
    await user.click(await screen.findByRole("option", { name: "換新" }));

    expect(screen.getByLabelText("替換型號")).toBeInTheDocument();
    expect(screen.getByLabelText("替換序號")).toBeInTheDocument();
  });

  it("選擇非「換新」的選項，不顯示替換欄位", async () => {
    const user = userEvent.setup();
    setupSupabaseMock();
    render(<ReceivingTab />);
    await openDialog();

    await user.click(screen.getByLabelText("實際處理方式"));
    await user.click(await screen.findByRole("option", { name: "維修" }));

    expect(screen.queryByLabelText("替換型號")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("替換序號")).not.toBeInTheDocument();
  });

  it("選擇「換新」並填入替換資料後，儲存包含 replacement_model 和 replacement_serial", async () => {
    const user = userEvent.setup();
    const { mockInsert } = setupSupabaseMock();
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
    expect(mockToastSuccess).toHaveBeenCalledWith("已儲存檢查記錄");
  });

  it("選擇「維修」時儲存的 replacement 欄位為 null", async () => {
    const user = userEvent.setup();
    const { mockInsert } = setupSupabaseMock();
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

  it("選擇 diagnosis_category 後，儲存時更新至 rma_requests", async () => {
    const user = userEvent.setup();
    const { mockUpdateRma } = setupSupabaseMock();
    render(<ReceivingTab />);
    await openDialog();

    await user.click(screen.getByLabelText("診斷分類"));
    await user.click(await screen.findByRole("option", { name: "功能異常" }));

    fireEvent.click(screen.getByRole("button", { name: "儲存記錄" }));

    await waitFor(() => {
      expect(mockUpdateRma).toHaveBeenCalledWith(
        expect.objectContaining({ diagnosis_category: "功能異常" })
      );
    });
  });

  it("existing repair detail 有 actual_method=換新 時，對話框開啟即顯示替換欄位", async () => {
    setupSupabaseMock({
      repairDetail: {
        id: "detail-001",
        rma_request_id: "rma-001",
        planned_method: "換貨",
        actual_method: "換新",
        internal_reference: null,
        estimated_cost: null,
        actual_cost: null,
        replacement_model: "TERIC-REFURB",
        replacement_serial: "SN88888",
      },
    });
    render(<ReceivingTab />);
    await openDialog();

    expect(screen.getByLabelText("替換型號")).toBeInTheDocument();
    expect(screen.getByDisplayValue("TERIC-REFURB")).toBeInTheDocument();
    expect(screen.getByDisplayValue("SN88888")).toBeInTheDocument();
  });
});

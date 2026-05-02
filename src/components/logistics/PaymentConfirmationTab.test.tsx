import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PaymentConfirmationTab from "./PaymentConfirmationTab";
import { server } from "@/mocks/server";
import { http, HttpResponse } from "msw";

const SUPABASE_URL = "https://xrbvyfoewbwywrwocrpf.supabase.co";

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

const QUOTE_CONFIRMED_RMA = {
  id: "rma-001",
  rma_number: "RMA-2024-001",
  customer_name: "王小明",
  product_model: "CR-4",
  actual_method: "purchase_b",
  repair_fee: 1800,
  updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
};

const FREE_RMA = {
  ...QUOTE_CONFIRMED_RMA,
  id: "rma-002",
  rma_number: "RMA-2024-002",
  actual_method: "warranty_replace",
  repair_fee: 0,
};

function setupMock(rmaList = [QUOTE_CONFIRMED_RMA]) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "rma_requests") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: rmaList, error: null }),
          }),
        }),
      };
    }
    return { select: vi.fn() };
  });
}

beforeEach(() => {
  mockToastSuccess.mockClear();
  mockToastError.mockClear();
  setupMock();
});

describe("PaymentConfirmationTab", () => {
  it("空狀態：無待確認案件時顯示空狀態訊息", async () => {
    setupMock([]);
    render(<PaymentConfirmationTab />);
    await waitFor(() => {
      expect(screen.getByText("目前沒有待付款確認的案件")).toBeInTheDocument();
    });
  });

  it("列表顯示：正確呈現 RMA 編號、處理方式 label、金額", async () => {
    render(<PaymentConfirmationTab />);
    await waitFor(() => {
      expect(screen.getByText("RMA-2024-001")).toBeInTheDocument();
      expect(screen.getByText("購買 B 級整新機")).toBeInTheDocument();
      expect(screen.getByText(/1,800/)).toBeInTheDocument();
    });
  });

  it("免費案件：repair_fee=0 時顯示「免費」badge", async () => {
    setupMock([FREE_RMA]);
    render(<PaymentConfirmationTab />);
    await waitFor(() => {
      expect(screen.getByText("免費")).toBeInTheDocument();
    });
  });

  it("確認收款：選擇付款方式後呼叫 update-rma-status 並顯示 success toast", async () => {
    render(<PaymentConfirmationTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    fireEvent.click(screen.getByRole("button", { name: /確認收款/ }));
    await waitFor(() => screen.getByText(/確認收款 — RMA-2024-001/));

    // 選擇付款方式
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => screen.getByRole("option", { name: "匯款" }));
    fireEvent.click(screen.getByRole("option", { name: "匯款" }));

    fireEvent.click(screen.getByRole("button", { name: /^確認收款$/ }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("已確認收款")
      );
    });
  });

  it("未選付款方式：顯示 error toast", async () => {
    render(<PaymentConfirmationTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    fireEvent.click(screen.getByRole("button", { name: /確認收款/ }));
    await waitFor(() => screen.getByText(/確認收款 — RMA-2024-001/));

    fireEvent.click(screen.getByRole("button", { name: /^確認收款$/ }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("請選擇付款方式");
    });
  });

  it("API 失敗：顯示 error toast", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/functions/v1/update-rma-status`, () =>
        HttpResponse.json({ error: "伺服器錯誤" }, { status: 500 })
      )
    );
    render(<PaymentConfirmationTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    fireEvent.click(screen.getByRole("button", { name: /確認收款/ }));
    await waitFor(() => screen.getByText(/確認收款 — RMA-2024-001/));

    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => screen.getByRole("option", { name: "匯款" }));
    fireEvent.click(screen.getByRole("option", { name: "匯款" }));

    fireEvent.click(screen.getByRole("button", { name: /^確認收款$/ }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining("伺服器錯誤"));
    });
  });
});

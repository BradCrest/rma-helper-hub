import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OutboundShippingTab from "./OutboundShippingTab";
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

// 真實 schema：actual_method 在 rma_repair_details，不在 rma_requests
const PAID_RMA = {
  id: "rma-001",
  rma_number: "RMA-2024-001",
  customer_name: "王小明",
  product_model: "CR-4",
  status: "paid",
  updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  rma_repair_details: [{ actual_method: "purchase_b" }],
};

const NO_REPAIR_RMA = {
  ...PAID_RMA,
  id: "rma-002",
  rma_number: "RMA-2024-002",
  status: "no_repair",
  rma_repair_details: [{ actual_method: "return_original" }],
};

const WARRANTY_RMA = {
  ...PAID_RMA,
  id: "rma-003",
  rma_number: "RMA-2024-003",
  status: "paid",
  rma_repair_details: [{ actual_method: "warranty_replace" }],
};

const NO_REPAIR_DETAILS_RMA = {
  ...PAID_RMA,
  id: "rma-004",
  rma_number: "RMA-2024-004",
  rma_repair_details: [],
};

function setupMock(rmaList = [PAID_RMA]) {
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

beforeEach(() => {
  mockToastSuccess.mockClear();
  mockToastError.mockClear();
  setupMock();
});

describe("OutboundShippingTab", () => {
  it("空狀態：無待出貨案件時顯示空狀態訊息", async () => {
    setupMock([]);
    render(<OutboundShippingTab />);
    await waitFor(() => {
      expect(screen.getByText("目前沒有待出貨的案件")).toBeInTheDocument();
    });
  });

  it("列表顯示：正確呈現 RMA 編號、處理方式 label、出貨類型 badge", async () => {
    render(<OutboundShippingTab />);
    await waitFor(() => {
      expect(screen.getByText("RMA-2024-001")).toBeInTheDocument();
      expect(screen.getByText("購買 B 級整新機")).toBeInTheDocument();
      expect(screen.getByText("寄出整新機")).toBeInTheDocument();
    });
  });

  it("warranty_replace 推斷出貨類型為「寄出新品」", async () => {
    setupMock([WARRANTY_RMA]);
    render(<OutboundShippingTab />);
    await waitFor(() => {
      expect(screen.getByText("寄出新品")).toBeInTheDocument();
    });
  });

  it("return_original (no_repair) 推斷出貨類型為「寄回原機」", async () => {
    setupMock([NO_REPAIR_RMA]);
    render(<OutboundShippingTab />);
    await waitFor(() => {
      expect(screen.getByText("寄回原機")).toBeInTheDocument();
    });
  });

  it("無 rma_repair_details 記錄時 fallback 到「寄回原機」", async () => {
    setupMock([NO_REPAIR_DETAILS_RMA]);
    render(<OutboundShippingTab />);
    await waitFor(() => {
      expect(screen.getByText("寄回原機")).toBeInTheDocument();
    });
  });

  it("確認出貨：填寫物流資訊後呼叫 submit-outbound-shipping 並顯示 success toast", async () => {
    render(<OutboundShippingTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    fireEvent.click(screen.getByRole("button", { name: /填寫出貨/ }));
    await waitFor(() => screen.getByText(/出貨資訊 — RMA-2024-001/));

    fireEvent.change(screen.getByPlaceholderText(/順豐速運/), { target: { value: "順豐速運" } });
    fireEvent.change(screen.getByPlaceholderText(/輸入追蹤號碼/), { target: { value: "SF123456789" } });

    fireEvent.click(screen.getByRole("button", { name: /確認出貨/ }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("出貨資訊已提交")
      );
    });
  });

  it("未填物流名稱：顯示 error toast", async () => {
    render(<OutboundShippingTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    fireEvent.click(screen.getByRole("button", { name: /填寫出貨/ }));
    await waitFor(() => screen.getByText(/出貨資訊 — RMA-2024-001/));

    fireEvent.click(screen.getByRole("button", { name: /確認出貨/ }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("請填寫物流名稱");
    });
  });

  it("未填物流單號：顯示 error toast", async () => {
    render(<OutboundShippingTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    fireEvent.click(screen.getByRole("button", { name: /填寫出貨/ }));
    await waitFor(() => screen.getByText(/出貨資訊 — RMA-2024-001/));

    fireEvent.change(screen.getByPlaceholderText(/順豐速運/), { target: { value: "順豐速運" } });
    fireEvent.click(screen.getByRole("button", { name: /確認出貨/ }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("請填寫物流單號");
    });
  });

  it("API 失敗：顯示 error toast", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/functions/v1/submit-outbound-shipping`, () =>
        HttpResponse.json({ error: "出貨提交失敗" }, { status: 500 })
      )
    );
    render(<OutboundShippingTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    fireEvent.click(screen.getByRole("button", { name: /填寫出貨/ }));
    await waitFor(() => screen.getByText(/出貨資訊 — RMA-2024-001/));

    fireEvent.change(screen.getByPlaceholderText(/順豐速運/), { target: { value: "順豐速運" } });
    fireEvent.change(screen.getByPlaceholderText(/輸入追蹤號碼/), { target: { value: "SF123456789" } });

    fireEvent.click(screen.getByRole("button", { name: /確認出貨/ }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining("出貨提交失敗"));
    });
  });
});

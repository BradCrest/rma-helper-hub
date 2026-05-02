import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ClosingTab from "./ClosingTab";
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

const SHIPPED_BACK_RMA = {
  id: "rma-001",
  rma_number: "RMA-2024-001",
  customer_name: "王小明",
  product_model: "CR-4",
  status: "shipped_back_refurbished",
  updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
};

const FOLLOW_UP_RMA = {
  ...SHIPPED_BACK_RMA,
  id: "rma-002",
  rma_number: "RMA-2024-002",
  status: "follow_up",
};

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

beforeEach(() => {
  mockToastSuccess.mockClear();
  mockToastError.mockClear();
  setupMock();
});

describe("ClosingTab", () => {
  it("空狀態：無待結案案件時顯示空狀態訊息", async () => {
    setupMock([]);
    render(<ClosingTab />);
    await waitFor(() => {
      expect(screen.getByText("目前沒有待結案追蹤的案件")).toBeInTheDocument();
    });
  });

  it("列表顯示：正確呈現 RMA 編號、狀態 badge、更新天數", async () => {
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

  it("標記追蹤中：呼叫 update-rma-status 並顯示 success toast", async () => {
    render(<ClosingTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    fireEvent.click(screen.getByRole("button", { name: /追蹤中/ }));
    await waitFor(() => screen.getByText(/標記追蹤中 — RMA-2024-001/));

    fireEvent.click(screen.getByRole("button", { name: /確認追蹤中/ }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("標記為追蹤中");
    });
  });

  it("確認結案：呼叫 update-rma-status 並顯示 success toast", async () => {
    render(<ClosingTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    fireEvent.click(screen.getByRole("button", { name: /結案/ }));
    await waitFor(() => screen.getByText(/確認結案 — RMA-2024-001/));

    fireEvent.click(screen.getByRole("button", { name: /確認結案/ }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("案件已結案");
    });
  });

  it("API 失敗：顯示 error toast", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/functions/v1/update-rma-status`, () =>
        HttpResponse.json({ error: "伺服器錯誤" }, { status: 500 })
      )
    );
    render(<ClosingTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    fireEvent.click(screen.getByRole("button", { name: /結案/ }));
    await waitFor(() => screen.getByText(/確認結案 — RMA-2024-001/));

    fireEvent.click(screen.getByRole("button", { name: /確認結案/ }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining("伺服器錯誤"));
    });
  });
});

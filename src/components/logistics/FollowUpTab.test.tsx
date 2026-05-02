import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FollowUpTab from "./FollowUpTab";

// ── Hoist mocks ────────────────────────────────────────────────────────────
const { mockFrom, mockToastError } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mockFrom },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mockToastError },
}));

// FollowUpEmailDialog 是獨立單元測試，這裡只驗證開關行為
vi.mock("./FollowUpEmailDialog", () => ({
  default: ({ open, rma }: { open: boolean; rma: { rma_number: string } | null }) =>
    open ? <div data-testid="email-dialog">{rma?.rma_number}</div> : null,
}));

// ── Fixtures ───────────────────────────────────────────────────────────────
const BASE_RMA = {
  id: "rma-001",
  rma_number: "RMA-2024-001",
  customer_name: "王小明",
  customer_email: "wang@example.com",
  product_model: "CR-4",
  follow_up_due_at: new Date(Date.now() + 3 * 86400000).toISOString(), // 3 天後
  updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
};

const OVERDUE_RMA = {
  ...BASE_RMA,
  id: "rma-002",
  rma_number: "RMA-2024-002",
  follow_up_due_at: new Date(Date.now() - 2 * 86400000).toISOString(), // 逾期 2 天
};

const TODAY_RMA = {
  ...BASE_RMA,
  id: "rma-003",
  rma_number: "RMA-2024-003",
  // 500ms 前到期 → remaining = Math.ceil(-0.000006) = 0 → 今日到期
  follow_up_due_at: new Date(Date.now() - 500).toISOString(),
};

const NULL_DUE_RMA = {
  ...BASE_RMA,
  id: "rma-004",
  rma_number: "RMA-2024-004",
  follow_up_due_at: null,
};

const SURVEY_PENDING = {
  id: "survey-001",
  rma_id: "rma-001",
  satisfaction: null,
  comments: null,
  sent_at: new Date().toISOString(),
  submitted_at: null,
};

const SURVEY_SUBMITTED = {
  id: "survey-002",
  rma_id: "rma-001",
  satisfaction: 4,
  comments: "很好",
  sent_at: new Date().toISOString(),
  submitted_at: new Date().toISOString(),
};

// ── Supabase mock helper ───────────────────────────────────────────────────
function setupMock(rmaList = [BASE_RMA], surveyList: typeof SURVEY_PENDING[] = []) {
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
    if (table === "rma_followup_surveys") {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: surveyList, error: null }),
          }),
        }),
      };
    }
    return { select: vi.fn() };
  });
}

// ── Setup ──────────────────────────────────────────────────────────────────
beforeEach(() => {
  mockToastError.mockClear();
  setupMock();
});

// ══════════════════════════════════════════════════════════════════════════
// 列表顯示
// ══════════════════════════════════════════════════════════════════════════
describe("FollowUpTab - 列表顯示", () => {
  it("無待關懷案件時顯示空狀態訊息", async () => {
    setupMock([]);
    render(<FollowUpTab />);
    await waitFor(() =>
      expect(screen.getByText("目前沒有需要關懷的案件")).toBeInTheDocument()
    );
  });

  it("正確呈現 RMA 編號、客戶名稱、Email、型號", async () => {
    render(<FollowUpTab />);
    await waitFor(() => {
      expect(screen.getByText("RMA-2024-001")).toBeInTheDocument();
      expect(screen.getByText("王小明")).toBeInTheDocument();
      expect(screen.getByText("wang@example.com")).toBeInTheDocument();
      expect(screen.getByText("CR-4")).toBeInTheDocument();
    });
  });

  it("筆數 badge 正確", async () => {
    render(<FollowUpTab />);
    await waitFor(() =>
      expect(screen.getByText("1 筆需要關懷")).toBeInTheDocument()
    );
  });

  it("查無資料時回傳 error → 顯示 error toast", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
        }),
      }),
    }));
    render(<FollowUpTab />);
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("載入資料失敗")
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 到期狀態 badge
// ══════════════════════════════════════════════════════════════════════════
describe("FollowUpTab - 到期狀態 badge", () => {
  it("3 天後到期：顯示「3 天後到期」", async () => {
    render(<FollowUpTab />);
    await waitFor(() =>
      expect(screen.getByText("3 天後到期")).toBeInTheDocument()
    );
  });

  it("逾期 2 天：顯示「逾期 2 天」", async () => {
    setupMock([OVERDUE_RMA]);
    render(<FollowUpTab />);
    await waitFor(() =>
      expect(screen.getByText(/逾期 2 天/)).toBeInTheDocument()
    );
  });

  it("今日到期：顯示「今日到期」", async () => {
    setupMock([TODAY_RMA]);
    render(<FollowUpTab />);
    await waitFor(() =>
      expect(screen.getByText("今日到期")).toBeInTheDocument()
    );
  });

  it("follow_up_due_at 為 null：顯示「—」，不顯示到期文字", async () => {
    setupMock([NULL_DUE_RMA]);
    render(<FollowUpTab />);
    await waitFor(() => screen.getByText("RMA-2024-004"));
    expect(screen.queryByText(/天後到期/)).not.toBeInTheDocument();
    expect(screen.queryByText(/逾期/)).not.toBeInTheDocument();
    expect(screen.queryByText("今日到期")).not.toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 問卷狀態 badge
// ══════════════════════════════════════════════════════════════════════════
describe("FollowUpTab - 問卷狀態 badge", () => {
  it("無問卷紀錄：顯示「未寄送」", async () => {
    setupMock([BASE_RMA], []);
    render(<FollowUpTab />);
    await waitFor(() =>
      expect(screen.getByText("未寄送")).toBeInTheDocument()
    );
  });

  it("問卷已寄送但未回覆：顯示「已寄送・待回覆」", async () => {
    setupMock([BASE_RMA], [SURVEY_PENDING]);
    render(<FollowUpTab />);
    await waitFor(() =>
      expect(screen.getByText("已寄送・待回覆")).toBeInTheDocument()
    );
  });

  it("問卷已回覆：顯示「已回覆 (N★)」", async () => {
    setupMock([BASE_RMA], [SURVEY_SUBMITTED]);
    render(<FollowUpTab />);
    await waitFor(() =>
      expect(screen.getByText("已回覆 (4★)")).toBeInTheDocument()
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 搜尋過濾
// ══════════════════════════════════════════════════════════════════════════
describe("FollowUpTab - 搜尋過濾", () => {
  it("以 RMA 編號搜尋：僅顯示符合項目", async () => {
    setupMock([BASE_RMA, OVERDUE_RMA]);
    render(<FollowUpTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    fireEvent.change(screen.getByPlaceholderText("搜尋 RMA 編號或客戶姓名"), {
      target: { value: "RMA-2024-002" },
    });

    expect(screen.queryByText("RMA-2024-001")).not.toBeInTheDocument();
    expect(screen.getByText("RMA-2024-002")).toBeInTheDocument();
  });

  it("清空搜尋框：恢復顯示全部", async () => {
    setupMock([BASE_RMA, OVERDUE_RMA]);
    render(<FollowUpTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    const input = screen.getByPlaceholderText("搜尋 RMA 編號或客戶姓名");
    fireEvent.change(input, { target: { value: "RMA-2024-002" } });
    fireEvent.change(input, { target: { value: "" } });

    expect(screen.getByText("RMA-2024-001")).toBeInTheDocument();
    expect(screen.getByText("RMA-2024-002")).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 按鈕行為
// ══════════════════════════════════════════════════════════════════════════
describe("FollowUpTab - 按鈕行為", () => {
  it("點「寄關懷信」→ 開啟 FollowUpEmailDialog", async () => {
    render(<FollowUpTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    expect(screen.queryByTestId("email-dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /寄關懷信/ }));

    expect(screen.getByTestId("email-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("email-dialog")).toHaveTextContent("RMA-2024-001");
  });

  it("無問卷紀錄時不顯示「回覆紀錄」按鈕", async () => {
    setupMock([BASE_RMA], []);
    render(<FollowUpTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));
    expect(screen.queryByRole("button", { name: /回覆紀錄/ })).not.toBeInTheDocument();
  });

  it("有問卷紀錄時顯示「回覆紀錄」按鈕，點擊開啟問卷 Dialog", async () => {
    setupMock([BASE_RMA], [SURVEY_SUBMITTED]);
    render(<FollowUpTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    const btn = screen.getByRole("button", { name: /回覆紀錄/ });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);

    await screen.findByText(/問卷紀錄 — RMA-2024-001/);
    expect(screen.getByText("已回覆")).toBeInTheDocument();
  });
});

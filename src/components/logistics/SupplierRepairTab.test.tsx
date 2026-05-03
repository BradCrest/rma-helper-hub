import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SupplierRepairTab from "./SupplierRepairTab";

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

// 子元件各自有獨立的 Supabase 查詢，隔離避免 mock 複雜度
vi.mock("./SupplierBatchPanel", () => ({
  default: ({ onChanged }: { onChanged: () => void }) => (
    <div data-testid="batch-panel" onClick={onChanged} />
  ),
}));

vi.mock("./RefurbishedInventoryPanel", () => ({
  default: () => <div data-testid="inventory-panel" />,
}));

vi.mock("./SupplierRepairDialog", () => ({
  default: ({ open, repair }: { open: boolean; repair: { id: string } | null }) =>
    open ? <div data-testid="repair-dialog">{repair?.id}</div> : null,
}));

// ── Fixtures ───────────────────────────────────────────────────────────────
const PENDING_CHUANGBAO = {
  id: "rep-001",
  rma_request_id: "rma-001",
  supplier_name: "chuangbao",
  supplier_status: "pending_send",
  repair_requirement: "螢幕故障",
  repair_count: 1,
  factory_repair_cost_estimated: 500,
  factory_repair_cost: null,
  invoice_reference: null,
  sent_to_factory_date: null,
  sent_carrier: null,
  sent_tracking_number: null,
  factory_return_date: null,
  batch_id: null,
  created_at: new Date().toISOString(),
  rma: {
    id: "rma-001",
    rma_number: "RMA-2024-001",
    customer_name: "王小明",
    product_name: "CR-4",
    product_model: "CR-4",
    serial_number: "SN001",
    status: "inspecting",
  },
};

const AT_FACTORY_RECENT = {
  ...PENDING_CHUANGBAO,
  id: "rep-002",
  supplier_status: "at_factory",
  sent_to_factory_date: new Date(Date.now() - 10 * 86400000).toISOString(), // 10 天前 → 未逾期
  factory_repair_cost_estimated: 800,
  factory_repair_cost: null,
  rma: {
    ...PENDING_CHUANGBAO.rma,
    id: "rma-002",
    rma_number: "RMA-2024-002",
    customer_name: "陳大明",
  },
};

const AT_FACTORY_OVERDUE = {
  ...PENDING_CHUANGBAO,
  id: "rep-003",
  supplier_status: "at_factory",
  sent_to_factory_date: new Date(Date.now() - 35 * 86400000).toISOString(), // 35 天前 → 逾期
  rma: {
    ...PENDING_CHUANGBAO.rma,
    id: "rma-003",
    rma_number: "RMA-2024-003",
    customer_name: "李小花",
    serial_number: "SN003",
  },
};

const ZHENG_REPAIR = {
  ...PENDING_CHUANGBAO,
  id: "rep-004",
  supplier_name: "zhengnengliang",
  supplier_status: "repaired",
  factory_repair_cost_estimated: 1200,
  factory_repair_cost: 1100,
  rma: {
    ...PENDING_CHUANGBAO.rma,
    id: "rma-004",
    rma_number: "RMA-2024-004",
    customer_name: "張三",
    product_model: "CR-5L",
  },
};

// ── Supabase mock helper ───────────────────────────────────────────────────
function setupMock(repairList = [PENDING_CHUANGBAO]) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "rma_supplier_repairs") {
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: repairList, error: null }),
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
describe("SupplierRepairTab - 列表顯示", () => {
  it("空列表顯示「沒有符合的工單」", async () => {
    setupMock([]);
    render(<SupplierRepairTab />);
    await waitFor(() =>
      expect(screen.getByText("沒有符合的工單")).toBeInTheDocument()
    );
  });

  it("正確顯示 RMA 編號、客戶名", async () => {
    render(<SupplierRepairTab />);
    await waitFor(() => {
      expect(screen.getByText("RMA-2024-001")).toBeInTheDocument();
      expect(screen.getByText("王小明")).toBeInTheDocument();
    });
  });

  it("chuangbao → 顯示「創葆」badge", async () => {
    render(<SupplierRepairTab />);
    await waitFor(() =>
      expect(screen.getByText("創葆")).toBeInTheDocument()
    );
  });

  it("zhengnengliang → 顯示「正能量」badge", async () => {
    setupMock([ZHENG_REPAIR]);
    render(<SupplierRepairTab />);
    await waitFor(() =>
      expect(screen.getByText("正能量")).toBeInTheDocument()
    );
  });

  it("pending_send → 顯示「待寄出」狀態 badge", async () => {
    render(<SupplierRepairTab />);
    await waitFor(() =>
      expect(screen.getByText("待寄出")).toBeInTheDocument()
    );
  });

  it("repaired → 顯示「工廠完工」狀態 badge", async () => {
    setupMock([ZHENG_REPAIR]);
    render(<SupplierRepairTab />);
    await waitFor(() =>
      expect(screen.getByText("工廠完工")).toBeInTheDocument()
    );
  });

  it("supplier_name 為 null 時顯示「未指定」", async () => {
    setupMock([{ ...PENDING_CHUANGBAO, supplier_name: null }]);
    render(<SupplierRepairTab />);
    await waitFor(() =>
      expect(screen.getByText("未指定")).toBeInTheDocument()
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 費用顯示
// ══════════════════════════════════════════════════════════════════════════
describe("SupplierRepairTab - 費用顯示", () => {
  it("有預估費時顯示「預 NT$ X」格式", async () => {
    render(<SupplierRepairTab />);
    await waitFor(() =>
      expect(screen.getByText(/預 NT\$ 500/)).toBeInTheDocument()
    );
  });

  it("有實際費時顯示「實 NT$ X,XXX」格式", async () => {
    setupMock([ZHENG_REPAIR]);
    render(<SupplierRepairTab />);
    await waitFor(() =>
      expect(screen.getByText(/實 NT\$ 1,100/)).toBeInTheDocument()
    );
  });

  it("預估費為 null 時顯示「—」", async () => {
    setupMock([{ ...PENDING_CHUANGBAO, factory_repair_cost_estimated: null }]);
    render(<SupplierRepairTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 在外天數
// ══════════════════════════════════════════════════════════════════════════
describe("SupplierRepairTab - 在外天數", () => {
  it("at_factory + sent_to_factory_date → 顯示在外天數", async () => {
    setupMock([AT_FACTORY_RECENT]);
    render(<SupplierRepairTab />);
    await waitFor(() =>
      expect(screen.getByText(/10 天/)).toBeInTheDocument()
    );
  });

  it("在外 35 天（逾期）時顯示天數", async () => {
    setupMock([AT_FACTORY_OVERDUE]);
    render(<SupplierRepairTab />);
    await waitFor(() =>
      expect(screen.getByText(/35 天/)).toBeInTheDocument()
    );
  });

  it("pending_send（未寄出）不顯示在外天數", async () => {
    render(<SupplierRepairTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));
    expect(screen.queryByText(/\d+ 天/)).not.toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 搜尋過濾
// ══════════════════════════════════════════════════════════════════════════
describe("SupplierRepairTab - 搜尋過濾", () => {
  it("搜尋 RMA 編號 → 只顯示符合工單", async () => {
    setupMock([PENDING_CHUANGBAO, ZHENG_REPAIR]);
    render(<SupplierRepairTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    fireEvent.change(screen.getByPlaceholderText("RMA / 客戶 / 序號"), {
      target: { value: "RMA-2024-004" },
    });

    expect(screen.queryByText("RMA-2024-001")).not.toBeInTheDocument();
    expect(screen.getByText("RMA-2024-004")).toBeInTheDocument();
  });

  it("搜尋客戶名 → 只顯示符合工單", async () => {
    setupMock([PENDING_CHUANGBAO, ZHENG_REPAIR]);
    render(<SupplierRepairTab />);
    await waitFor(() => screen.getByText("王小明"));

    fireEvent.change(screen.getByPlaceholderText("RMA / 客戶 / 序號"), {
      target: { value: "張三" },
    });

    expect(screen.queryByText("王小明")).not.toBeInTheDocument();
    expect(screen.getByText("張三")).toBeInTheDocument();
  });

  it("搜尋序號 → 只顯示符合工單", async () => {
    setupMock([PENDING_CHUANGBAO, AT_FACTORY_OVERDUE]);
    render(<SupplierRepairTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    fireEvent.change(screen.getByPlaceholderText("RMA / 客戶 / 序號"), {
      target: { value: "SN003" },
    });

    expect(screen.queryByText("RMA-2024-001")).not.toBeInTheDocument();
    expect(screen.getByText("RMA-2024-003")).toBeInTheDocument();
  });

  it("清空搜尋 → 恢復顯示全部", async () => {
    setupMock([PENDING_CHUANGBAO, ZHENG_REPAIR]);
    render(<SupplierRepairTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    const input = screen.getByPlaceholderText("RMA / 客戶 / 序號");
    fireEvent.change(input, { target: { value: "張三" } });
    fireEvent.change(input, { target: { value: "" } });

    expect(screen.getByText("RMA-2024-001")).toBeInTheDocument();
    expect(screen.getByText("RMA-2024-004")).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 逾期 toggle
// ══════════════════════════════════════════════════════════════════════════
describe("SupplierRepairTab - 逾期 toggle", () => {
  it("預設不過濾：pending_send 和 at_factory 工單都顯示", async () => {
    setupMock([PENDING_CHUANGBAO, AT_FACTORY_OVERDUE]);
    render(<SupplierRepairTab />);
    await waitFor(() => {
      expect(screen.getByText("RMA-2024-001")).toBeInTheDocument();
      expect(screen.getByText("RMA-2024-003")).toBeInTheDocument();
    });
  });

  it("開啟逾期 toggle → 只顯示在外 > 30 天的 at_factory 工單", async () => {
    setupMock([PENDING_CHUANGBAO, AT_FACTORY_RECENT, AT_FACTORY_OVERDUE]);
    render(<SupplierRepairTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    fireEvent.click(screen.getByRole("button", { name: /逾期未回/ }));

    // pending_send（未寄出）→ 不顯示
    expect(screen.queryByText("RMA-2024-001")).not.toBeInTheDocument();
    // at_factory 10 天 → 未逾期，不顯示
    expect(screen.queryByText("RMA-2024-002")).not.toBeInTheDocument();
    // at_factory 35 天 → 顯示
    expect(screen.getByText("RMA-2024-003")).toBeInTheDocument();
  });

  it("再次點擊逾期 toggle → 取消過濾，恢復全部", async () => {
    setupMock([PENDING_CHUANGBAO, AT_FACTORY_OVERDUE]);
    render(<SupplierRepairTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    const toggle = screen.getByRole("button", { name: /逾期未回/ });
    fireEvent.click(toggle); // 開啟
    fireEvent.click(toggle); // 關閉

    expect(screen.getByText("RMA-2024-001")).toBeInTheDocument();
    expect(screen.getByText("RMA-2024-003")).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 按鈕行為
// ══════════════════════════════════════════════════════════════════════════
describe("SupplierRepairTab - 按鈕行為", () => {
  it("點「檢視 / 更新」→ 開啟 SupplierRepairDialog 並傳入該工單 id", async () => {
    render(<SupplierRepairTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    expect(screen.queryByTestId("repair-dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /檢視 \/ 更新/ }));

    expect(screen.getByTestId("repair-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("repair-dialog")).toHaveTextContent("rep-001");
  });

  it("多筆工單時各自開啟對應 dialog", async () => {
    setupMock([PENDING_CHUANGBAO, ZHENG_REPAIR]);
    render(<SupplierRepairTab />);
    await waitFor(() => screen.getByText("RMA-2024-001"));

    const buttons = screen.getAllByRole("button", { name: /檢視 \/ 更新/ });
    fireEvent.click(buttons[1]); // 點第二筆

    expect(screen.getByTestId("repair-dialog")).toHaveTextContent("rep-004");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Sub-tab 存在確認
// ══════════════════════════════════════════════════════════════════════════
describe("SupplierRepairTab - sub-tab 存在確認", () => {
  it("顯示「送修追蹤」和「整新品庫存」兩個 tab 觸發器", async () => {
    render(<SupplierRepairTab />);
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "送修追蹤" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "整新品庫存" })).toBeInTheDocument();
    });
  });

  it("預設 active tab 為「送修追蹤」", async () => {
    render(<SupplierRepairTab />);
    await waitFor(() => {
      const repairsTab = screen.getByRole("tab", { name: "送修追蹤" });
      expect(repairsTab).toHaveAttribute("data-state", "active");
    });
  });

  it("SupplierBatchPanel 在送修追蹤 tab 下渲染", async () => {
    render(<SupplierRepairTab />);
    await waitFor(() =>
      expect(screen.getByTestId("batch-panel")).toBeInTheDocument()
    );
  });
});

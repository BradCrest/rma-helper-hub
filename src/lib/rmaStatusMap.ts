/**
 * RMA Status ↔ 分頁／Dashboard 對應表（純資料模組）
 *
 * 來源：實際盤點以下檔案的篩選邏輯
 *   - src/components/logistics/ReceivingTab.tsx
 *   - src/components/logistics/AwaitingConfirmationTab.tsx
 *   - src/components/logistics/CustomerHandlingTab.tsx（舊版）
 *   - src/pages/AdminDashboard.tsx
 *
 * 僅供 StatusMapDialog 顯示對照用。
 * 各分頁實際 query 仍以該檔案為準，此處變更不會影響行為。
 */

export type RmaStatus =
  | "registered"
  | "shipped"
  | "received"
  | "inspecting"
  | "contacting"
  | "quote_confirmed"
  | "paid"
  | "no_repair"
  | "repairing"
  | "shipped_back"
  | "shipped_back_new"
  | "shipped_back_refurbished"
  | "shipped_back_original"
  | "follow_up"
  | "closed"
  | "unknown";

export const RMA_STATUS_LABELS: Record<RmaStatus, string> = {
  registered: "已登錄",
  shipped: "已寄出（客→公司）",
  received: "已收到",
  inspecting: "檢測中",
  contacting: "聯繫客戶中",
  quote_confirmed: "已確認方案",
  paid: "已付款",
  no_repair: "不維修",
  repairing: "處理中",
  shipped_back: "已寄回（舊）",
  shipped_back_new: "寄回新品",
  shipped_back_refurbished: "寄回整新機",
  shipped_back_original: "寄回原機",
  follow_up: "後續追蹤",
  closed: "已結案",
  unknown: "未知",
};

export type LogisticsTabKey =
  | "receiving"
  | "awaitingConfirmation"
  | "customerHandlingLegacy"
  | "paymentConfirmation"
  | "outboundShipping"
  | "closing";

export type DashboardBucketKey =
  | "dashboardPending"
  | "dashboardInProgress"
  | "dashboardCompleted";

export const LOGISTICS_TAB_LABELS: Record<LogisticsTabKey, string> = {
  receiving: "收件處理",
  awaitingConfirmation: "待客戶確認",
  customerHandlingLegacy: "客戶處理（舊）",
  paymentConfirmation: "付款確認",
  outboundShipping: "出貨處理",
  closing: "結案追蹤",
};

export const DASHBOARD_BUCKET_LABELS: Record<DashboardBucketKey, string> = {
  dashboardPending: "Dashboard・待處理",
  dashboardInProgress: "Dashboard・處理中",
  dashboardCompleted: "Dashboard・已完成",
};

/**
 * 反向視角：每個分頁/桶包含哪些 status。
 */
export const TAB_STATUS_BUCKETS: Record<
  LogisticsTabKey | DashboardBucketKey,
  RmaStatus[]
> = {
  receiving: ["shipped", "received", "inspecting"],
  awaitingConfirmation: ["contacting"],
  customerHandlingLegacy: ["contacting", "quote_confirmed", "paid"],
  paymentConfirmation: ["quote_confirmed"],
  outboundShipping: ["paid", "no_repair"],
  closing: ["shipped_back", "shipped_back_new", "shipped_back_refurbished", "shipped_back_original", "follow_up"],
  dashboardPending: ["registered"],
  dashboardInProgress: [
    "shipped",
    "received",
    "inspecting",
    "contacting",
    "quote_confirmed",
    "paid",
    "repairing",
  ],
  dashboardCompleted: [
    "shipped_back",
    "shipped_back_new",
    "shipped_back_refurbished",
    "shipped_back_original",
    "follow_up",
    "closed",
  ],
};

/**
 * 主視角：每個 status 出現在哪些位置（從上面反推）。
 */
export const RMA_STATUS_LOCATIONS: Record<
  RmaStatus,
  { tabs: LogisticsTabKey[]; buckets: DashboardBucketKey[] }
> = (() => {
  const result = {} as Record<
    RmaStatus,
    { tabs: LogisticsTabKey[]; buckets: DashboardBucketKey[] }
  >;
  (Object.keys(RMA_STATUS_LABELS) as RmaStatus[]).forEach((status) => {
    result[status] = { tabs: [], buckets: [] };
  });
  (Object.entries(TAB_STATUS_BUCKETS) as [
    LogisticsTabKey | DashboardBucketKey,
    RmaStatus[]
  ][]).forEach(([key, statuses]) => {
    statuses.forEach((s) => {
      if (key.startsWith("dashboard")) {
        result[s].buckets.push(key as DashboardBucketKey);
      } else {
        result[s].tabs.push(key as LogisticsTabKey);
      }
    });
  });
  return result;
})();

/**
 * 視覺分組：用於 badge 顏色／提示文字。
 */
export function getStatusVisibility(status: RmaStatus): {
  inAnyTab: boolean;
  inDashboard: boolean;
  onlyInRmaList: boolean;
} {
  const loc = RMA_STATUS_LOCATIONS[status];
  const inAnyTab = loc.tabs.length > 0;
  const inDashboard = loc.buckets.length > 0;
  return {
    inAnyTab,
    inDashboard,
    onlyInRmaList: !inAnyTab && !inDashboard,
  };
}

/**
 * 已知缺口（顯示在 Dialog 底部資訊欄）。
 */
export const KNOWN_GAPS: string[] = [
  "contacting 同時出現在「待客戶確認」和舊版「客戶處理」分頁；CustomerHandlingTab 仍在 codebase 但未掛上 tabs。",
  "shipped_back（舊版匯入狀態）現在歸入「結案追蹤」，但建議後續逐步遷移至 shipped_back_* 的新版狀態。",
  "repairing 狀態目前不在任何後勤分頁，只能於「RMA 列表」查找。",
];

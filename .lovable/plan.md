## 目標

整理 16 種 `rma_status` 與後勤管理各分頁／Dashboard 的對應關係，並在管理介面新增一個「狀態 ↔ 分頁對照表」的快速查看 UI，讓管理員一眼看到每個狀態目前會在哪個分頁出現。

---

## 一、Status ↔ 分頁／Dashboard 對應總表（從程式碼盤點所得）

來源：
- `src/components/logistics/ReceivingTab.tsx` line 171
- `src/components/logistics/AwaitingConfirmationTab.tsx` line 111（只看 `contacting`）
- `src/components/logistics/CustomerHandlingTab.tsx` line 96（舊版「客戶處理」分頁，目前未掛在 AdminLogistics tabs 上）
- `src/pages/AdminDashboard.tsx` line 25–58（首頁三個統計卡）
- `src/pages/AdminRmaList.tsx` 用 `statusFilter` 任選

| status | 中文標籤 | 收件處理 | 待客戶確認 | 客戶處理（舊） | Dashboard 待處理 | Dashboard 處理中 | Dashboard 已完成 | RMA 列表 |
|---|---|---|---|---|---|---|---|---|
| `registered` | 已登錄 | | | | ✅ | | | ✅ |
| `shipped` | 已寄出（客→公司） | ✅ | | | | ✅ | | ✅ |
| `received` | 已收到 | ✅ | | | | ✅ | | ✅ |
| `inspecting` | 檢測中 | ✅ | | | | ✅ | | ✅ |
| `contacting` | 聯繫客戶中 | | ✅ | ✅ | | ✅ | | ✅ |
| `quote_confirmed` | 已確認方案 | | | ✅ | | ✅ | | ✅ |
| `paid` | 已付款 | | | ✅ | | ✅ | | ✅ |
| `no_repair` | 不維修 | | | | | | | ✅ |
| `repairing` | 處理中 | | | | | ✅ | | ✅ |
| `shipped_back` | 已寄回（舊） | | | | | | | ✅ |
| `shipped_back_new` | 寄回新品 | | | | | | | ✅ |
| `shipped_back_refurbished` | 寄回整新機 | | | | | | | ✅ |
| `shipped_back_original` | 寄回原機 | | | | | | | ✅ |
| `follow_up` | 後續追蹤 | | | | | | | ✅ |
| `closed` | 已結案 | | | | | | ✅ | ✅ |
| `unknown` | 未知 | | | | | | | ✅ |

### 觀察到的缺口（會在 UI 上以警示標出，不在這個 PR 修）
1. `no_repair`、`shipped_back*`、`follow_up` 三組狀態目前不在任何後勤分頁的預設視窗，只能去「RMA 列表」用篩選找。
2. `contacting` 同時出現在「待客戶確認」和舊「客戶處理」兩處（CustomerHandlingTab 仍在 codebase 但未掛上 tabs）。
3. Dashboard 的「處理中」桶包含 7 種狀態，但「已完成」只算 `closed`，`shipped_back*` 沒被歸進完成統計。

---

## 二、新增的 UI

### 1. 共用資料模組：`src/lib/rmaStatusMap.ts`（新檔，純資料）

匯出三件東西，供本次 UI 與未來各分頁/列表共用，避免再到處硬編碼：

```ts
export const RMA_STATUS_LABELS: Record<RmaStatus, string> = { ... };
// 每個 status 出現在哪些「位置」
export const RMA_STATUS_LOCATIONS: Record<RmaStatus, Location[]>;
// 反過來：每個分頁/桶包含哪些 status（從上面表格直接複製）
export const TAB_STATUS_BUCKETS = {
  receiving: ["shipped", "received", "inspecting"],
  awaitingConfirmation: ["contacting"],
  customerHandlingLegacy: ["contacting", "quote_confirmed", "paid"],
  dashboardPending: ["registered"],
  dashboardInProgress: ["shipped","received","inspecting","contacting","quote_confirmed","paid","repairing"],
  dashboardCompleted: ["closed"],
};
```

> 重要：這份資料只在新元件使用。**不**改 ReceivingTab / AwaitingConfirmationTab / Dashboard 既有 query，避免影響行為。後續若要逐步重構讓它們改吃這份 map，再分開做。

### 2. 新元件：`src/components/logistics/StatusMapDialog.tsx`

一個用 `Dialog` 包起來的對照表：

- **Trigger**：在 `AdminLogistics.tsx` header 右側、「首頁」按鈕左邊新增一顆 outline 按鈕「狀態對照表」（icon `Map` 或 `TableProperties`）。
- **內容**：
  - 上方一段說明文字：「每筆 RMA 依 `status` 自動進入對應分頁。下表整理目前各分頁的篩選範圍。」
  - 第一張表（主視角）：**Status → 出現位置**
    - 欄位：狀態 badge｜中文標籤｜後勤分頁｜Dashboard 統計｜備註
    - 用 `<Badge>` 標示位置，多個就並列
    - `unknown` / `no_repair` / `shipped_back*` / `follow_up` 顯示淡黃 badge「⚠ 僅在 RMA 列表」
  - 第二張表（反視角，可摺疊）：**分頁 → 包含哪些 status**
    - 每個分頁一列，右邊把 status badge 全列出
  - 底部小字注記：上面提到的三個觀察缺口，純資訊揭露。

### 3. 主畫面位置

只動 `AdminLogistics.tsx`：
- 在 header 的 buttons 區（`<span>{user?.email}</span>` 後）插入 `<StatusMapDialog />`。
- 不動 tabs 結構、不動既有分頁元件。

---

## 三、檔案異動清單

| 動作 | 檔案 |
|---|---|
| 新增 | `src/lib/rmaStatusMap.ts` |
| 新增 | `src/components/logistics/StatusMapDialog.tsx` |
| 編輯 | `src/pages/AdminLogistics.tsx`（header 加按鈕） |

無 DB migration、無 Edge Function 變更、無 RLS 影響。

---

## 四、技術細節

- 純 client-side，沒有任何資料 fetch，完全靠靜態 map render，零效能成本。
- 樣式沿用現有 shadcn `Dialog` / `Table` / `Badge` / `Button` + Tailwind，符合 memory 中「Clean modern, white cards, primary #3B82F6」基調。
- 顏色慣例：在保固/正常分頁出現 → `secondary` badge；只在 RMA 列表 → `outline` + 黃字；`closed` → `default`。
- i18n：全部繁中硬字串，與其他後勤分頁一致。

---

## 五、不在範圍內（避免 scope creep）

- 不重構 ReceivingTab / AwaitingConfirmationTab / Dashboard 改吃 `TAB_STATUS_BUCKETS`（要做但獨立 PR）。
- 不補 `no_repair` / `shipped_back*` / `follow_up` 的專屬分頁（要先跟使用者確認流程再說）。
- 不改 status enum、不刪 `unknown`。

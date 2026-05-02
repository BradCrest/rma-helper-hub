# 故障登記分頁（檢測與處置決策中心）

## 目標
新增 `FaultRegistrationTab`，作為收件後的單一決策入口，列出 `received` / `inspecting` 的 RMA，由後勤一次完成「檢測 → 故障分類 → 保固判斷 → 處置決策 → 狀態分流」。「待客戶確認」和「出貨處理」回歸純粹角色。

---

## 一、現況盤點（不會動到的東西）

- 既有 enum 完整可用：`registered, shipped, received, inspecting, contacting, quote_confirmed, paid, no_repair, shipped_back*, follow_up, closed` — **不新增 enum，不做 migration**
- `rma_requests` 已有 `initial_diagnosis`、`diagnosis_category`、`warranty_status`、`repair_fee`
- `rma_repair_details` 已有 `planned_method`、`actual_method`、`estimated_cost`、`actual_cost`、`replacement_model`、`replacement_serial`、`internal_reference`
- `ReceivingTab` 目前混合了「收件」+「初步診斷」+「方案決策」 — 我們會把「方案決策」職責搬到新分頁，`ReceivingTab` 只保留收件確認與最初步的故障歸類（避免破壞既有 test）
- `refurbishedPricing.ts` 已有 `ActualMethod` 與 `ACTUAL_METHOD_LABELS`，直接重用
- `supplier_repair` enum 不存在 → 依需求暫不引入，先把決策結果記在 `rma_repair_details.planned_method = 'supplier_repair'` + 內部備註，狀態維持 `inspecting`

---

## 二、新增分頁：`src/components/logistics/FaultRegistrationTab.tsx`

### 2.1 列表（Table）
查詢條件：`status IN ('received','inspecting')`，依 `received_date` / `updated_at` 倒序。

| 欄位 | 來源 |
|---|---|
| RMA 編號 | `rma_number` |
| 客戶姓名 | `customer_name` |
| 產品型號 | `product_model` |
| 序號 | `serial_number` |
| 目前狀態 | `status`（badge：received=灰, inspecting=藍） |
| 故障類型 | `diagnosis_category` |
| 保固判斷 | `warranty_status` + `evaluateWarranty()` 結果（badge：保固內=綠, 過保=橘, 人損=紅, 未判定=灰） |
| 處置決策 | `rma_repair_details.planned_method`（badge，未填時顯示「待決策」） |
| 更新時間 | `updated_at`（相對時間） |
| 操作 | 「檢視 / 登記」按鈕開 dialog |

頂部加搜尋框（RMA 編號、客戶姓名、序號）+「只顯示未決策」toggle。

### 2.2 詳細 Dialog `<FaultRegistrationDialog>`

讀取：`rma_requests` + `rma_repair_details` + Shopify 訂單卡（重用 `ShopifyOrdersCard`）。

#### 上半部：唯讀資訊
- 客戶 / 產品 / 序號 / 購買日期
- 客戶原始描述 `issue_type` + `issue_description` + 照片 grid（重用既有元件）
- `WarrantyCalculator` 區塊（讓 admin 看 serial 自動推算保固）

#### 下半部：表單欄位

| 欄位 | UI | 寫入位置 |
|---|---|---|
| 故障類型 `diagnosis_category` | Select：螢幕／電池／進水／外觀損壞／無法開機／感測器異常／充電異常／其他 | `rma_requests.diagnosis_category` |
| 檢測結果 | Textarea | `rma_requests.initial_diagnosis` |
| 是否可復現 | RadioGroup：是／否／不確定 | 併入 `initial_diagnosis` 文字開頭 `[可復現:是]`（避免新增欄位）|
| 保固判斷 `warranty_status` | Select：保固內／過保／人損不保／無法判定 | `rma_requests.warranty_status` |
| **處置決策** `planned_method` | RadioGroup：`internal_repair` / `supplier_repair` / `warranty_replace` / `purchase_a` / `purchase_b` / `purchase_c` / `return_no_repair` / `return_no_fault` | `rma_repair_details.planned_method` |
| 報價金額 | NumberInput（`purchase_*` 時自動帶 `getRefurbPrices`，可手動覆寫；`warranty_replace` 預設 0）| `rma_requests.repair_fee` + `rma_repair_details.estimated_cost` |
| 上游維修單號 | Input（僅 `supplier_repair` 顯示） | `rma_repair_details.internal_reference` |
| 內部備註 | Textarea | append 到 `initial_diagnosis` 結尾，`---內部備註---` 分隔 |
| 附件 / 照片 | 重用 `rma-photos` bucket 的上傳元件 | `rma_requests.photo_urls` 追加 |

底部按鈕：「儲存草稿」（只更新欄位，不換 status）／「送出處置決策」（更新欄位 + 依下表轉換 status）。

---

## 三、處置決策 → 狀態轉換對照

送出時依 `planned_method` 決定後續：

| 處置決策 | `planned_method` 寫入 | `actual_method` 寫入 | RMA 狀態 | 後續分頁 |
|---|---|---|---|---|
| 內部維修 | `internal_repair` | （不寫，等實際完工再寫）| `inspecting` → 維持 `inspecting` 並在備註標示「待內部維修」（暫不引入 `repairing` 狀態，等未來新增）| 故障登記分頁仍可見 |
| 送上游維修 | `supplier_repair` | （同上） | 維持 `inspecting`，`internal_reference` 記單號 | 未來「供應商維修」分頁 |
| 保固換整新機 | `warranty_replace` | `warranty_replace` | → `contacting` | 待客戶確認 |
| 購買 A / B / C 整新機 | `purchase_a/b/c` | 同 | → `contacting` | 待客戶確認 |
| 不維修，原機退回 | `return_no_repair` | `return_original` | → `no_repair` | 出貨處理 |
| 無故障，原機退回 | `return_no_fault` | `return_original` | → `no_repair` | 出貨處理 |

寫入順序：
1. upsert `rma_repair_details`（`planned_method`、`actual_method`、`estimated_cost`、`internal_reference`）
2. update `rma_requests`（`diagnosis_category`、`initial_diagnosis`、`warranty_status`、`repair_fee`、`status`）
3. status 變動由既有 trigger `log_rma_status_change` 自動寫進 `rma_status_history`

**保護機制**：送出前若必填欄位（故障類型、檢測結果、保固判斷、處置決策）任一缺漏，按鈕 disabled + tooltip 提示。

---

## 四、`AdminLogistics.tsx` 整合

把目前 `fault` tab 的 placeholder 換掉，並把 `disabled: true` 移除：

```tsx
{ id: "fault", label: "故障登記", icon: ClipboardCheck },
// ...
<TabsContent value="fault">
  <FaultRegistrationTab />
</TabsContent>
```

`fault` 分頁順序建議放在「收件處理」之後、「待客戶確認」之前，符合工作流向。

---

## 五、`ReceivingTab` 微調（最小變更）

為了不破壞既有測試，只做兩件事：
1. 在 ReceivingTab 的詳情 dialog 底部加一個提示卡片：「完成收件後請至『故障登記』登錄處置決策」+ 一鍵跳轉按鈕（`navigate('/admin/logistics?tab=fault')`）
2. 收件確認時，預設把 status 從 `shipped` → `received`（不直接跳 `inspecting`）；admin 可在故障登記分頁開始檢測時，由系統自動把 `received` → `inspecting`（在 dialog 開啟時 update 一次）

---

## 六、UI 規範

- 完全沿用既有 `rma-card` / `Badge` / shadcn `Table` / `Dialog` / `Select` / `RadioGroup` 樣式
- 處置決策 RadioGroup 用 2 欄 grid，每個選項旁加小字輔助說明（例如「保固換整新機 — 寄整新機給客戶，無費用」）
- 保固判斷 badge 配色與 `WarrantyCalculator` 一致

---

## 七、不做的事
- 不新增資料表
- 不新增 / 不修改 enum（`supplier_repair`、`repairing` 留待未來與「供應商維修」分頁一起做）
- 不在這個分頁做付款、出貨、寄信
- 不動 `AwaitingConfirmationTab` / `OutboundShippingTab` 的查詢條件（它們本來就靠 `status` 過濾，新分頁送出後資料會自動流進去）

---

## 檔案異動清單

新增：
- `src/components/logistics/FaultRegistrationTab.tsx`
- `src/components/logistics/FaultRegistrationDialog.tsx`
- `src/components/logistics/FaultRegistrationTab.test.tsx`（基本渲染 + 送出後 status 轉換）

修改：
- `src/pages/AdminLogistics.tsx`（啟用 fault tab）
- `src/components/logistics/ReceivingTab.tsx`（加跳轉提示，最小改動）

---

請確認方向 OK 我就開工。若有以下任一想調整請先說：
1. 「不維修退回」要不要直接跳 `shipped_back_original` 而不是 `no_repair`？（目前依你需求採 `no_repair`）
2. 「內部維修」目前無對應 enum，要先用 `inspecting` + 備註撐著，還是這次順便加 `repairing` enum migration？

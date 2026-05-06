# 物流作業總覽

物流作業頁面（`/admin/logistics`）是管理員日常操作最頻繁的區域，以 **Tab 分頁**組織十個功能模組，涵蓋從收件到結案的完整流程。

## Tab 分頁一覽

| Tab 名稱 | 主要用途 | 主要對象 |
|---------|---------|---------|
| [收件處理](/logistics/receiving) | 確認客戶寄回產品到貨 | 倉庫/收件端 |
| [故障登記](/logistics/damage-registration) | 登記產品故障狀況 | 技術人員 |
| [待客戶確認](/logistics/awaiting-confirmation) | 等候客戶確認維修方案或費用 | 客服人員 |
| [付款確認](/logistics/payment-confirmation) | 確認客戶已付款（過保維修）| 財務/客服 |
| [出貨處理](/logistics/outbound-shipping) | 產品寄回客戶的出貨管理 | 倉庫 |
| [結案追蹤](/logistics/case-closing) | 已完成工單的結案確認 | 客服人員 |
| [客戶關懷](/logistics/customer-care) | 維修後追蹤關懷 | 客服人員 |
| [供應商維修](/logistics/supplier-repair) | 送廠維修進度管理 | 技術/採購 |
| [銷貨匯入](/logistics/sales-import) | 整新品銷售記錄匯入 | 業務/倉庫 |
| [保固審核](/logistics/warranty-review) | 保固判斷人工審核 | 管理員 |

## 各 Tab 對應狀態

| Tab | 涵蓋狀態 |
|-----|---------|
| 收件處理 | `shipped`、`received`、`inspecting` |
| 待客戶確認 | `contacting` |
| 付款確認 | `quote_confirmed` |
| 出貨處理 | `paid`、`no_repair` |
| 結案追蹤 | `shipped_back`、`shipped_back_new`、`shipped_back_refurbished`、`shipped_back_original`、`follow_up` |

> `registered` 顯示在 Dashboard 待處理桶，不在物流頁任何 Tab。
> `closed` 不在任何 Tab，只可在 `/admin/rma-list` 搜尋查詢。

## 典型工作流程

### 一般 RMA 完整流程

```
客戶申請（registered）
  ↓
[收件處理] 確認包裹到貨 → received
  ↓
[收件處理] 初步診斷 → inspecting
  ↓
  ├─ 保固內 → 直接 paid，進入出貨處理
  └─ 保固外 → [待客戶確認] contacting，等候客戶確認費用
                   ↓ 客戶確認 → quote_confirmed
               [付款確認] 收款確認 → paid
  ↓
  ├─ 自行維修 → [出貨處理] shipped_back_original
  ├─ 整新品替換 → [出貨處理] shipped_back_refurbished
  ├─ 新品替換 → [出貨處理] shipped_back_new
  └─ 不維修 → [出貨處理] no_repair → closed
  ↓
[結案追蹤] follow_up（後續關懷）
  ↓
[結案追蹤] closed（結案）
```

若需送廠維修，在 `inspecting` 階段從「供應商維修 Tab」建立送修批次，完成後再回到出貨流程。

### 每日例行工作建議順序

1. **收件處理 Tab** — 確認新到的包裹，推進 `received` → `inspecting`
2. **供應商維修 Tab** — 確認有無工廠完工需驗收
3. **待客戶確認 Tab** — 追蹤 `contacting` 工單（避免超時）
4. **出貨處理 Tab** — 確認當日應寄出的工單（`paid` / `no_repair`）
5. **結案追蹤 Tab** — 確認 `follow_up` 到期的關懷排程，推進至 `closed`

## 共用篩選器功能

每個 Tab 都有頂部篩選列，共同特性：

- **關鍵字搜尋**：支援 RMA 號碼、客戶姓名、序號
- **狀態篩選**：依各 Tab 的狀態選項篩選
- **逾期標記**：快速顯示超過時限的項目（以橘/紅色標示）
- **即時篩選**：輸入後立即更新列表，資料已在本地快取

## 其他入口

Email 往返管理（RMA 回覆 / 客戶來信）位於不同頁面：

→ **客戶回覆及知識庫**：`/admin/email-knowledge`

| 功能 | 說明 |
|------|------|
| RMA 回覆 | 針對特定 RMA 工單的 Email thread 管理，支援 AI 輔助起草 |
| 客戶來信 | Gmail 整合收件匣，處理一般來信 |

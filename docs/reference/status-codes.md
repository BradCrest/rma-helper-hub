# 狀態碼一覽

## RMA 工單狀態（rma_status）

> **來源**：`src/lib/rmaStatusMap.ts`（`RMA_STATUS_LABELS`、`TAB_STATUS_BUCKETS`）。

| 狀態值 | 中文 | 說明 | 物流 Tab |
|--------|------|------|---------|
| `registered` | 已登錄 | 客戶送出申請，等待後續處理 | Dashboard 待處理 |
| `shipped` | 已寄出（客→公司）| 客戶已填寄件資訊，等待到貨 | 收件處理 |
| `received` | 已收到 | 產品已到達，準備檢測 | 收件處理 |
| `inspecting` | 檢測中 | 技術人員初步診斷中 | 收件處理 |
| `contacting` | 聯繫客戶中 | 告知費用或維修方案，等候客戶回覆 | 待客戶確認 |
| `quote_confirmed` | 已確認方案 | 客戶已確認維修方案，等待付款 | 付款確認 |
| `paid` | 已付款 | 確認收款，準備出貨 | 出貨處理 |
| `no_repair` | 不維修 | 客戶拒絕維修或設備無法修復 | 出貨處理 |
| `shipped_back_new` | 寄回新品 | 已寄出全新替換品 | 結案追蹤 |
| `shipped_back_refurbished` | 寄回整新機 | 已寄出整新品替換 | 結案追蹤 |
| `shipped_back_original` | 寄回原機 | 已寄回維修後原機 | 結案追蹤 |
| `shipped_back` | 已寄回（舊版）| 歷史匯入狀態，建議遷移至 `shipped_back_*` | 結案追蹤 |
| `follow_up` | 後續追蹤 | 產品已寄回，等待後續關懷確認 | 結案追蹤 |
| `closed` | 已結案 | 工單完成，所有流程結束 | — |

### 狀態 Badge 顏色

| 狀態 | Badge 顏色 |
|------|-----------|
| registered | 🟡 黃色（amber）|
| shipped | 🟣 紫色（violet）|
| received | 🟤 橘色（orange）|
| inspecting | 🔵 靛色（indigo）|
| contacting | 🔵 藍色（blue）|
| quote_confirmed | 🟣 紫色（violet）|
| paid | 🟢 綠色（emerald）|
| no_repair | ⬜ 灰色（gray）|
| shipped_back / shipped_back_* | 🟢 綠色（emerald）|
| follow_up | 🟡 黃色（amber）|
| closed | ⬜ 灰色（gray）|

---

## 供應商送修狀態（supplier_status）

| 狀態值 | 中文 | 說明 |
|--------|------|------|
| `pending_send` | 待寄出 | 已建立送修工單，等待加入批次出貨 |
| `at_factory` | 工廠維修中 | 已寄出，工廠處理中 |
| `repaired` | 工廠完工 | 工廠回報維修完成，等待管理員驗收 |
| `returned` | 已驗收完成 | 管理員驗收通過，機器入庫 |
| `scrapped` | 報廢 | 無法修復，廢棄處理 |

### 狀態 Badge 顏色

| 狀態 | Badge 顏色 |
|------|-----------|
| pending_send | 🟡 黃色（amber）|
| at_factory | 🔵 藍色（blue）|
| repaired | 🟣 紫色（violet）|
| returned | 🟢 綠色（emerald）|
| scrapped | 🔴 紅色（red）|

---

## 批次出貨狀態（batch_status）

| 狀態值 | 中文 | 說明 |
|--------|------|------|
| `draft` | 草稿（未寄出）| 批次建立中，可繼續添加工單 |
| `shipped` | 已寄出 / 工廠中 | 批次已出貨，工廠處理中 |
| `received` | 已收回 | 工廠回寄，批次全部收回 |

---

## 整新品庫存狀態（refurb_inventory_status）

| 狀態值 | 中文 | 說明 |
|--------|------|------|
| `in_stock` | 在庫 | 可供銷售或撥用保固替換 |
| `used_warranty` | 已撥用保固 | 已用於替換保固客戶 |
| `sold` | 已售出 | 整新品銷售完成 |
| `scrapped` | 報廢 | 二次檢查後品質不符，廢棄 |

### 狀態 Badge 顏色

| 狀態 | Badge 顏色 |
|------|-----------|
| in_stock | 🟢 綠色（emerald）|
| used_warranty | 🔵 藍色（blue）|
| sold | 🟣 紫色（violet）|
| scrapped | 🔴 紅色（red）|

---

## Email 寄送狀態（email_send_log.status）

| 狀態值 | 說明 |
|--------|------|
| `pending` | 等待佇列處理 |
| `sent` | 已成功寄出 |
| `suppressed` | 收件人在退訂/黑名單，略過寄送 |
| `failed` | 寄送失敗（將重試）|
| `bounced` | 退信（Email 不存在或信箱已滿）|
| `complained` | 被標記為垃圾信（Spam Complaint）|
| `dlq` | 死信佇列（多次重試失敗後放棄）|

---

## 供應商代號對照

| 代號（英文）| 中文名稱 | 負責型號 |
|-----------|---------|---------|
| `chuangbao` | 創葆 | CR-4、CR-1 |
| `zhengnengliang` | 正能量 | CR-5、CR-5L |

---

## 保固批次代號

| 代號 | 生產日期 | 保固期限 |
|------|---------|---------|
| `legacy_2018_2022` | 2018/01 ~ 2022/10 | 無保固 |
| `v2_2022_2025` | 2022/11 ~ 2025/11/11 | 2 年 |
| `v3_2025_onwards` | 2025/11/12 起 | 1 年 |

---

## 整新品等級

| 等級 | 說明 |
|------|------|
| A | 完全修復，外觀近新 |
| B | 功能正常，有輕微磨損 |
| C | 功能正常，外觀明顯瑕疵 |

---

## 使用者角色

| 角色 | 說明 |
|------|------|
| `admin` | 一般管理員 |
| `super_admin` | 超級管理員（含帳號管理權限）|

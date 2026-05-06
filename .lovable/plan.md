## 修正方向（v2，已採納 reviewer 意見）

修正客戶從自動 email 連結進入後出現「找不到 RMA」的 bug。同時修補 Track 頁面的兩個半完成問題（PII 卡片、手動 RMA 查詢 UI）。

## 根因回顧

`supabase/functions/lookup-rma/index.ts` 匿名路徑強制要求二次驗證（電話或 Email），但所有自動 email 連結只帶 `rma_number`，導致 400 → 前端誤判為「找不到 RMA」。

受影響：`shipping-reminder` 與 `rma-confirmation` 模板中 `/shipping-form?rma=...`、`/track?rma=...` 連結。Token-based 信件（`rma-reply`、follow-up survey）不受影響。

## 變更範圍

### 1. 後端：`supabase/functions/lookup-rma/index.ts`

新增第三條路徑 `purpose=email_link`（與 admin / 嚴格匿名並列）：

- **接受條件**：必須帶 `rma_number`，正規化後 `length >= 6`；不接受 `customer_name`/`customer_phone`/`customer_email`（即使帶了也忽略）
- **跳過二次驗證**
- **嚴格單筆命中**：候選用 `ilike %normalized%` 取最多 50 筆 → JS 端 `normalizeRma === normalized` 嚴格過濾 → 必須剛好 1 筆，否則 404（避免 partial 模糊命中）
- **回應最小欄位（完全不含 PII，連 masked 都不回）**：
  ```ts
  { id, rma_number, status, product_name, product_model, issue_type,
    purchase_date, created_at, updated_at, status_history }
  ```
  - 保留 `id`：`submit-shipping` 需要它寫入 `rma_shipping`
  - 保留 `status_history`：Track 頁進度時間軸用，僅含 `{ id, status, created_at, notes }`，無 PII
  - **不**回 `customer_name`/`customer_phone`/`customer_email`/`customer_address`/`mobile_phone`/`serial_number`/`warranty_date`/`updated_by_email`
- **審計 log**：`console.log('email_link lookup', { rma_number, hit: true/false })`
- 其他兩條路徑（admin `full_details`、嚴格匿名 RMA + 二次驗證、name path）**完全不動**

新增同目錄 `index_test.ts`（Deno test），覆蓋：
1. `purpose=email_link` + valid RMA → 200，回應**不含** `customer_name/customer_phone/customer_email`
2. `purpose=email_link` + 缺 `rma_number` → 400
3. `purpose=email_link` + 太短 RMA（< 6 chars）→ 400
4. `purpose=email_link` + 不存在的 RMA → 404
5. 嚴格匿名（無 `purpose`）+ 只給 `rma_number`，無電話/email → 400（行為不變）
6. `full_details=true` 無 admin token → 403（行為不變）

測試引用 `https://deno.land/std@0.224.0/dotenv/load.ts` 從 `.env` 讀 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_PUBLISHABLE_KEY`，並務必對每個 response 呼叫 `await response.text()` 以避免 resource leak。需要一筆已存在 RMA 號（如 `RC7EA001463`）作為 fixture 常數，由 reviewer 視情況改成 staging 上實際存在的號碼。

### 2. 前端：`src/pages/ShippingForm.tsx`

- fetch URL 加上 `&purpose=email_link`
- `RmaResult` interface 移除 `customer_name`/`customer_phone`/`customer_email`/`customer_address` 等已不會回傳的欄位（若該頁未使用就刪掉；若有使用，改為「該頁本來就用客戶輸入的新地址，不依賴回傳值」）
- 確認該頁僅用 `id`、`rma_number`、`status`、`product_name` 等已涵蓋欄位

### 3. 前端：`src/pages/Track.tsx`（reviewer 指出的兩個半成品）

#### 3a. 自動查詢路徑使用 `email_link`
- `handleSearchByRma` 增加參數 `fromEmailLink: boolean = false`
- `useEffect`（行 98–105）裡呼叫時傳 `true`，URL 加 `&purpose=email_link`
- 手動 submit（`handleSearch`）呼叫時傳 `false`，**不**加 `purpose`，維持現有「需要 RMA + 電話/Email」的嚴格驗證

#### 3b. 手動 RMA 查詢補上「電話或 Email」欄位（行 322–340）
目前 RMA tab 只有一個 RMA 編號 input；後端要求二次驗證會永遠失敗。改為：
```
[ RMA 編號 ] (existing)
[ 電話 或 Email ] (new, 至少擇一)
```
- 提交前 client 端校驗：必須填 `rmaNumber` + (`phone` || `email`) 其一
- 失敗顯示中英 toast：「請輸入電話或 Email 以驗證身分」
- `handleSearchByRma` 改為同時帶 `customer_phone` 或 `customer_email` query param

#### 3c. 「聯絡資訊」卡片（行 499–521）依資料動態隱藏
- `selectedRma.customer_name` / `customer_phone` / `customer_email` 全為空/undefined → **整張卡片改顯示**：
  ```
  聯絡資訊 / Contact Information
  為保護隱私，從 email 連結進入時不顯示聯絡資訊。
  如需查看，請於首頁使用 RMA + 電話/Email 重新查詢。
  For privacy, contact info is hidden when accessed via email link.
  ```
- 否則維持現狀顯示 masked 值

#### 3d. `RmaResult` interface 調整
- `customer_name`/`customer_phone`/`customer_email`/`customer_address` 改為 optional（`?: string | null`）
- `serial_number` 改為 optional（email_link 不回）

### 4. 部署 + 驗證

1. 部署 `lookup-rma`
2. `https://rma-helper-hub.lovable.app/shipping-form?rma=RC7EA001463` → 顯示填寫表單
3. `https://rma-helper-hub.lovable.app/track?rma=RC7EA001463` → 顯示進度卡片，聯絡資訊卡片顯示隱私提示
4. Track 手動 RMA tab：只填 RMA → 提示需要電話/Email；補上電話 → 成功查詢，聯絡資訊正常顯示 masked 值
5. Track 客戶資訊 tab：行為不變
6. 管理員後台 `RmaDetailDialog`（`full_details=true` + JWT）→ 回完整欄位，行為不變
7. 跑 `lookup-rma` 的 Deno tests，全部通過

## 安全評估

- `purpose=email_link` 用「持有 email 連結」作為驗證層，與 Track 頁原 PII 保護目標一致：能拿到 RMA 號碼通常代表已收到我們發的信
- 回應**完全不含 PII**，被枚舉到也只能看到工單狀態
- `id` 雖回傳但僅作為 `submit-shipping` 寫入用，並非 PII
- RMA 號碼結構（`RC + hex year + month count + total count`）約 11 字元，全空間枚舉成本高
- 暫不加 rate limit；後續若要加強可改成 one-time token per email（schema + 所有模板/edge function 配合，不在本次範圍）

## 不在本次範圍

- `src/pages/Shipping.tsx`（舊版手動寄件頁）的同類問題
- One-time token per email
- 主動補寄客戶 RC7EA001463 提醒信（部署後可手動觸發 `send-shipping-reminders`）

## Files Changed

- `supabase/functions/lookup-rma/index.ts`（新增第三路徑）
- `supabase/functions/lookup-rma/index_test.ts`（新增）
- `src/pages/ShippingForm.tsx`（URL + interface）
- `src/pages/Track.tsx`（自動/手動分流 + 手動表單加電話/Email + PII 卡片條件渲染 + interface）
- `.lovable/plan.md`（更新計畫）

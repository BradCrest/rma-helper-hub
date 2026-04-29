
# Phase 1：RMA 詳情頁整合 Shopify 訂單

## 範圍與非範圍

**做：**
- Admin 在 `RmaDetailDialog` 內看到該 RMA email 對應的 Shopify 最近 5 筆訂單
- 每筆訂單顯示：訂單號、日期、商品（標題 + SKU）、金額、狀態
- 「使用此訂單日為購買日」按鈕，一鍵帶入 `purchase_date` 並用 `warrantyPolicy.ts` 重算 `warranty_date`
- 純 admin 後台功能，客戶端完全不變

**不做（明確排除）：**
- 不做購物車、結帳、Storefront 任何 e-commerce UI
- 不同步 Shopify 訂單到我們的 DB（每次即時呼叫 Admin API）
- 不改 RMA 申請流程、不在客戶端加訂單欄位（留待 Phase 2）
- 不改既有 `warrantyPolicy.ts` / `WarrantyCalculator` 邏輯

## 整體流程

```text
RmaDetailDialog 開啟
  → 自動 invoke("shopify-find-orders-by-email", { email })
    → Edge Function 驗證 admin role
    → 呼叫 Shopify Admin API GraphQL: customers + orders
    → 回傳最近 5 筆訂單（含商品、日期、金額）
  → 顯示「Shopify 訂單記錄」摺疊卡片
  → admin 點「使用此訂單日為購買日」
    → 更新 rma_requests.purchase_date
    → 用 warrantyPolicy.calcWarrantyExpiry(batch, purchaseDate) 重算 warranty_date
    → 透過 update-rma-status edge function 寫入 DB
  → 顯示成功 toast，重新載入 RMA 詳情
```

## 技術細節

### 1. 新增 Edge Function `shopify-find-orders-by-email`

- 路徑：`supabase/functions/shopify-find-orders-by-email/index.ts`
- `verify_jwt = true`（admin only）
- 在函式內額外檢查 `user_roles` 確認是 admin / super_admin
- 輸入：`{ email: string }`，用 zod 驗證
- 呼叫 Shopify Admin GraphQL API：
  - 環境變數使用 Shopify enable 自動注入的 `SHOPIFY_STORE_PERMANENT_DOMAIN` 與 admin token（具體變數名稱以 `fetch_secrets` 確認後使用）
  - API version：`2025-07`
  - Endpoint：`https://{shop}/admin/api/2025-07/graphql.json`
  - GraphQL：`customers(first: 5, query: "email:xxx")` → 取得 customer.id → `orders(first: 5, sortKey: PROCESSED_AT, reverse: true)` 帶 `lineItems`、`processedAt`、`name`(訂單號)、`totalPriceSet`、`displayFinancialStatus`、`displayFulfillmentStatus`
- 輸出：精簡後的訂單陣列，只回傳 UI 需要的欄位（不要把整個 GraphQL response 丟回前端）
- 速率限制：簡易 in-memory rate limit（同一 admin 每分鐘最多 30 次），warning 註明非 production-grade
- CORS、錯誤處理依照專案標準範式

### 2. 新增前端元件 `ShopifyOrdersCard.tsx`

- 路徑：`src/components/rma/ShopifyOrdersCard.tsx`
- Props：`{ email: string, rmaId: string, currentPurchaseDate?: string, onPurchaseDateApplied: () => void }`
- 內部狀態：`useQuery(["shopify-orders", email], …)` 透過 React Query 快取 5 分鐘
- 顯示：
  - 載入中：skeleton
  - 無訂單：「此 email 在 Shopify 找不到訂單記錄」灰色提示，不顯示錯誤
  - 有訂單：每筆訂單一張小卡，顯示訂單號、日期、商品 list、總金額
  - 每張卡右側「使用此訂單日為購買日」按鈕（若已等於目前 purchase_date 則 disabled 顯示「目前使用中」）
  - 連結到 Shopify admin 的訂單詳情（外開新分頁）
- 使用既有 `Card`、`Button`、`Badge`、`Collapsible` shadcn 元件
- 樣式遵循專案既有設計（淡灰藍底、白卡、藍色 primary）

### 3. 整合到 `RmaDetailDialog.tsx`

- 在現有區塊之間插入 `<ShopifyOrdersCard … />`，預設摺疊
- 標題列加 Shopify icon（lucide `ShoppingBag`）+ 「Shopify 訂單記錄」+ 訂單數量 badge

### 4. 「一鍵帶入購買日」處理

- 點擊按鈕 → 呼叫既有 `update-rma-status` edge function（或為了降低耦合新增 `update-rma-purchase-date`，視 update-rma-status 是否支援自訂欄位而定，實作時確認）
- 更新欄位：`purchase_date` + 重算後的 `warranty_date`
- 重算用 `src/lib/warrantyPolicy.ts` 既有的 `calcWarrantyExpiry(batch, purchaseDate)`
- 批次來源：使用該 RMA 現有的 batch 判定（不在這一步重新偵測批次）
- 成功後 invalidate React Query cache，RMA 詳情自動 refresh
- 在 `rma_customer_contacts` 加一筆記錄：「Admin 從 Shopify 訂單 #xxxx 帶入購買日 yyyy-mm-dd」（reuse 既有 contact log 機制）

### 5. 不改動的部分

- `src/lib/warrantyPolicy.ts`、`WarrantyCalculator.tsx`：完全沿用
- 資料庫 schema：不新增欄位（`shopify_order_id` 留待 Phase 2 評估）
- 客戶端 RMA 申請流程：不動
- `supabase/config.toml`：只新增 `[functions.shopify-find-orders-by-email] verify_jwt = true` 區塊

## 安全與權限

- Edge Function 驗證 JWT + 二次檢查 `user_roles` 是 admin
- Shopify token 只存在於 Edge Function 環境變數，不暴露到前端
- email 參數用 zod 驗證為合法 email 格式
- 回傳資料不包含 Shopify 客戶的其他 PII（電話、地址）—— 只回訂單必要欄位
- Rate limit 防止 admin 帳號被濫用大量打 Shopify API

## 邊界情況

| 情境 | 處理 |
|---|---|
| email 在 Shopify 找不到客戶 | 顯示「找不到訂單記錄」，不視為錯誤 |
| Shopify API 回傳錯誤 / 超時 | 顯示「暫時無法載入訂單」+ 重試按鈕，不阻擋 RMA 詳情 |
| 一個 email 對應多個 customer | 取第一個（Shopify search 會按相關度排序），未來 Phase 2 再優化 |
| 訂單超過 5 筆 | 只顯示最近 5 筆 + 「在 Shopify 查看完整歷史」連結 |
| RMA 沒有 email | 不顯示卡片（return null） |
| 重算 warranty_date 時批次未知 | 按鈕 disabled，提示「請先在 WarrantyCalculator 確認批次」 |

## 驗收標準

1. 開啟任一 RMA 詳情，能看到 Shopify 訂單卡片（無論有無訂單都正常顯示）
2. 點「使用此訂單日為購買日」後，purchase_date 與 warranty_date 都更新，且 contact log 有記錄
3. 非 admin 呼叫 edge function 回 401/403
4. Shopify API 失敗時不會讓整個 RMA 詳情崩潰
5. 同一 email 5 分鐘內重開不會重打 API（React Query 快取生效）

## 檔案異動清單

**新增：**
- `supabase/functions/shopify-find-orders-by-email/index.ts`
- `src/components/rma/ShopifyOrdersCard.tsx`

**修改：**
- `src/components/rma/RmaDetailDialog.tsx`（插入卡片）
- `supabase/config.toml`（新增 function 設定）

**不動：**
- `src/lib/warrantyPolicy.ts`、`WarrantyCalculator.tsx`、`refurbishedPricing.ts`、客戶端 RMA 申請相關檔案、資料庫 schema

## 後續 Phase（不在本次範圍）

- Phase 2A：客戶端申請頁加訂單編號選填欄位
- Phase 2B：在 `rma_requests` 新增 `shopify_order_id` 欄位以建立永久關聯
- Phase 2C：獨立 Shopify 訂單分頁（用於主動售後關懷）
- Phase 2D：批次偵測整合 Shopify 訂單日（兩段驗證更可靠）


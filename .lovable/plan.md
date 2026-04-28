## 計畫：在 RMA 列表搜尋中加入「序號」搜尋

### 修改檔案
`src/pages/AdminRmaList.tsx`

### 變更內容

**1. 擴充搜尋欄位（第 232-236 行附近）**

在現有 `or()` 查詢條件中加入 `serial_number` 欄位：

```ts
.or(
  `rma_number.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%,customer_email.ilike.%${searchTerm}%,customer_phone.ilike.%${searchTerm}%,serial_number.ilike.%${searchTerm}%`
)
```

**2. 更新搜尋框 placeholder 文字（第 902 行）**

原：`搜尋 RMA 編號、客戶名稱、電話或郵件...`
改為：`搜尋 RMA 編號、客戶名稱、電話、郵件或產品序號...`

### 不變更

- 不影響分頁、狀態篩選、日期區間
- 不影響後端 / RLS（admin 已可讀 `serial_number`）
- 不需資料庫遷移

確認後即實作。
# RMA 是什麼？

**RMA（Return Merchandise Authorization）** 是退貨授權申請流程的標準縮寫。在 CREST 系統中，RMA 代表客戶將產品送回進行維修或換貨的申請單。

## 誰可以申請 RMA？

| 申請人類型 | 說明 |
|-----------|------|
| 一般消費者 | 個人購買，直接申請 |
| 經銷商 | 代理多位終端用戶，可批次申請 |
| 代理商 | 地區代理商，通常一次申請多台 |

## 申請管道

### 線上申請（主要）
客戶前往 **[https://rma-helper-hub.lovable.app](https://rma-helper-hub.lovable.app)** 填寫申請表單。

申請資訊：
- 個人 / 公司資訊
- 產品型號、序號
- 購買日期（保固判斷依據）
- 故障描述
- 產品照片（最多 5 張）

### 管理員代填
管理員可在 `/admin/dashboard` 點擊「新增 RMA」代客戶填寫。

### CSV 批次匯入
針對經銷商多筆申請，或從舊系統遷移歷史資料，使用 `/admin/csv-import`。

## 工單號格式

每筆 RMA 自動產生唯一工單號：

```
RMA-20250503-001
     ↑          ↑
  YYYYMMDD    當天流水號
```

工單號由資料庫觸發器（`generate_rma_number_trigger`）在 INSERT 時自動產生，管理員無法手動設定。

## 申請後的自動動作

客戶送出申請後，系統自動：
1. 將資料寫入 `rma_requests` 資料表
2. 寄送確認信給客戶（模板：`rma-confirmation`）
3. 傳送 Slack 通知給管理員

以上 2、3 步驟為非阻塞式（fire-and-forget），不影響申請成功與否。

## 下一步

- [RMA 完整生命週期 →](/rma/lifecycle)
- [保固政策與判斷 →](/rma/warranty)
- [搜尋與篩選 →](/rma/search-and-filter)

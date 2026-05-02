## 檢查結果總覽

針對所有會呼叫 `send-transactional-email` 的函式，確認上游身分驗證（誰可以呼叫我）與下游伺服器對伺服器呼叫的 header 模式：

| 函式 | 上游驗證 | 下游 header | 狀態 |
|---|---|---|---|
| `send-customer-email-reply` | user JWT → admin role | `Bearer serviceKey` + `apikey: serviceKey` | ✅ 正確 |
| `send-rma-reply` | user JWT → admin role | `Bearer serviceKey` + `apikey: serviceKey` | ✅ 正確 |
| `send-follow-up-email` | user JWT → admin role | `Bearer serviceKey` + `apikey: serviceKey` | ✅ 已修正 |
| `submit-rma` | 公開（客戶提交） | `Bearer serviceKey` + `apikey: serviceKey` | ✅ 正確 |
| `send-shipping-reminders` | CRON_SECRET 或 admin JWT | 僅 `apikey: serviceKey`（無 Bearer） | ⚠️ 可運作但與其他 4 個風格不一致 |

`send-transactional-email` 第 63-69 行邏輯：`presented = bearer || apikey`，**任一 header 帶上正確的 service role key 即可通過**。所以五個函式目前**都能正常工作**，沒有功能性 bug。

## 建議的小幅統一（純風格）

只動一個檔案：`supabase/functions/send-shipping-reminders/index.ts` 第 193-198 行，補上 `Authorization: Bearer ${serviceKey}` header，讓五個函式呼叫下游時的 header 格式完全一致：

```ts
headers: {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${serviceKey}`,
  "apikey": serviceKey,
},
```

修改後重新部署 `send-shipping-reminders`。

## 不變的部分

- 不修改 `send-transactional-email` 本身（OR 邏輯保留向後相容）。
- 各函式上游的 admin/JWT 驗證邏輯均維持不變。
- 不新增 wrapper、不抽 helper（五個 call site 簡單明確，抽出反而增加耦合與部署複雜度）。

## 驗證

部署後，等下一次 `send-shipping-reminders` 排程觸發（或手動測試），確認郵件正常寄出、無 401。

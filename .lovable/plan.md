
## 計畫：修正「索引處理失敗，請稍後再試」的真正原因

### 目前判斷出的原因
這個訊息目前不是代表每一批索引都真的失敗，而是前端把「任何一次對後端函式的連線中斷」都顯示成同一句失敗訊息。

從目前資料看得出來：

- `generate-email-embeddings` 其實有持續成功執行
- 每次都成功處理 `20` 筆
- 目前資料庫狀態約為：
  - `completed: 2931`
  - `pending: 16257`
- 你的知識來源總數約 `19188`

也就是說，系統不是完全沒跑，而是「有在跑，但量太大，前端輪詢很久後只要其中一次 request 斷線，就被 UI 顯示成失敗」。

### 為什麼會發生
目前架構有三個問題疊加：

1. `generate-email-embeddings` 每次只處理 20 筆，而且是逐筆呼叫外部 embedding API  
   這代表單輪執行時間偏長。

2. `EmailEmbeddingManager.tsx` 依賴前端頁面一直開著，反覆呼叫 Edge Function  
   只要瀏覽器暫停、網路波動、分頁休眠，`supabase.functions.invoke()` 就可能丟出 `Failed to fetch / FunctionsFetchError`。

3. 前端 catch 到任何錯誤後，直接顯示：
   - `索引處理失敗，請稍後再試`
   但沒有區分：
   - 後端真的報錯
   - 只是本輪連線中斷
   - 其實背景已經處理了一部分

### 證據摘要
目前觀察到的行為是：

```text
03:07:13  processed 20, remainingPending 16397
03:07:30  processed 20, remainingPending 16377
03:07:46  processed 20, remainingPending 16357
03:08:02  processed 20, remainingPending 16337
...
```

這代表索引工作確實在前進，不是完全卡死。

### 實作修正方向

#### 1. 先修正前端錯誤判讀
調整 `src/components/admin/EmailEmbeddingManager.tsx`：

- 不要把所有 invoke 例外都顯示成「索引失敗」
- 區分三種狀態：
  - 後端真的回傳錯誤
  - 本輪連線暫時中斷
  - 本輪完成但仍有大量 pending
- 若只是 `Failed to fetch` / `FunctionsFetchError`：
  - 顯示成「連線中斷，稍後自動重試」
  - 不要直接把整個流程標記成失敗
- 加入 retry/backoff：
  - 第一次中斷後等待幾秒再試
  - 連續多次才轉成真正錯誤

#### 2. 讓 Edge Function 回傳更明確的結構化結果
調整 `supabase/functions/generate-email-embeddings/index.ts`：

- 回傳固定格式，例如：
  - `ok`
  - `processed`
  - `failed`
  - `remainingPending`
  - `hasMore`
  - `error`
  - `diagnostics`
- 讓前端能知道：
  - 這輪是成功但還沒跑完
  - 還是後端真的失敗
- 對單筆失敗項目保留細節，不要只靠總數

#### 3. 補上「單輪長時間執行」的保護
目前每輪 20 筆，對 1.6 萬筆 backlog 來說，前端要連續跑很久。會做兩層保護：

- 估算每輪耗時並顯示「大量待索引，將持續分批處理」
- 避免 UI 讓人以為幾分鐘內就會完成
- 若 backlog 很大，顯示剩餘筆數與已完成數，而不是只顯示泛用錯誤

#### 4. 改善自動續跑策略
調整前端自動續跑邏輯：

- 網路中斷後不要立刻停止整個流程
- 改成：
  - 暫停
  - 顯示可恢復狀態
  - 自動再試幾輪
- 只有在以下情況才顯示真正錯誤：
  - 連續多次無法呼叫 function
  - function 明確回傳錯誤
  - pending 完全沒下降且有異常 diagnostics

#### 5. 補上 backlog 監控資訊
調整索引卡片 UI：

- 顯示：
  - `已完成 / 總數`
  - `剩餘待索引`
  - `本輪處理筆數`
  - `最近一次成功時間`
- 若待索引量很大，顯示說明：
  - `目前資料量較大，系統會持續分批處理，請保持頁面開啟或稍後回來查看`

#### 6. 第二階段優化：把長時間索引從前端持續驅動改成更穩定的背景處理
這是根本解法，因為目前 1.6 萬筆 backlog 不適合靠瀏覽器長時間盯著跑。

可升級方向：

```text
前端只負責顯示狀態
→ 後端建立索引工作(job)
→ 背景函式持續吃 pending queue
→ 前端定時刷新 job 狀態
```

這樣就算使用者關掉頁面，也不會因為瀏覽器中斷而看到「索引失敗」。

### 這次會修改的檔案
- `src/components/admin/EmailEmbeddingManager.tsx`
- `supabase/functions/generate-email-embeddings/index.ts`
- `src/pages/AdminEmailKnowledge.tsx`

### 預期結果
完成後會變成：

```text
索引實際在跑
→ 中途若有短暫網路中斷
→ UI 顯示「連線中斷，稍後重試」
→ 自動恢復續跑
→ 只有真正後端失敗時才顯示錯誤
```

### 技術摘要
- 目前主因不是索引完全失敗，而是：
  - backlog 極大（約 1.6 萬 pending）
  - 每輪只處理 20 筆
  - 前端必須長時間持續呼叫
  - 任一輪瀏覽器 fetch 中斷就被誤判為整體失敗
- 真正需要修的是：
  - 前端錯誤分類
  - 自動重試與續跑
  - 後端回傳結構化 diagnostics
  - 長期則改成背景 job 架構

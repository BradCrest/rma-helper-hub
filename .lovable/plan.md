
## 計畫：修正「上傳並建立索引」按鈕無法按下

### 問題判斷
目前不是後端完全壞掉，而是前端按鈕的啟用條件過於嚴格，造成看起來像「不能按」：

- `KnowledgeFileUpload` 的按鈕只有在 `pending` 檔案數量 > 0 時才可點
- 一旦檔案都變成 `done` 或 `error`，按鈕就會再次被 disable
- 目前按鈕文案叫「上傳並建立索引」，但實際流程是：
  1. 先上傳檔案
  2. 再自動觸發 embedding
  3. 真正索引狀態在右側 `EmailEmbeddingManager`
- 這會讓使用者誤以為按鈕壞掉，尤其在上傳過一次、失敗一次、或沒有明確選到檔案時最容易卡住

另外，console 也有 `Function components cannot be given refs` 警告，雖然不是主因，但會干擾這頁互動除錯，應一起清掉。

### 實作內容

#### 1. 重做上傳區的按鈕狀態邏輯
調整 `src/components/admin/KnowledgeFileUpload.tsx`：

- 抽出明確狀態：
  - `pendingCount`
  - `errorCount`
  - `doneCount`
- 按鈕 disable 條件改成更直觀：
  - 只有 `isUploading === true` 時禁用
  - 或完全沒有任何待處理 / 可重試檔案時禁用
- 若有 `error` 檔案，提供「重新上傳失敗項目」而不是整個區塊卡死
- 若全部都 `done`，主按鈕不再顯示成不可理解的灰色，而是切換成完成態文案

#### 2. 拆清楚「上傳」與「索引」兩件事的 UI
避免使用者誤解：

- 主按鈕改成更準確文案，例如：
  - 有待上傳檔案時：`開始上傳`
  - 上傳完成後：`已上傳，索引處理中`
- 在上傳成功後明確顯示：
  - 已新增幾個檔案
  - 已切成幾段
  - 已自動送進知識庫索引流程
- 若 embedding 已自動觸發，顯示提示引導看右側索引狀態卡片
- `EmailEmbeddingManager` 成功/進行中時同步 refresh，避免右邊還停在舊狀態

#### 3. 增加失敗後可恢復的操作
現在失敗項目只顯示錯誤，但流程不夠完整。會補上：

- 「重試失敗項目」
- 「清除失敗項目」
- 「全部清空」
- 若單一檔案失敗，不影響其他成功項目後續索引提示

這樣使用者不需要整頁重整才能繼續操作。

#### 4. 改善按鈕可視狀態
目前主按鈕有 `disabled`，但缺少足夠的 disabled 樣式提示。會補上：

- `disabled:opacity-50`
- `disabled:cursor-not-allowed`
- 視覺上明確表達「目前不能按」的原因
- 在按鈕旁顯示原因提示，例如：
  - `請先選擇檔案`
  - `上傳中...`
  - `全部檔案已完成`

#### 5. 修正 AdminEmailKnowledge 這頁的 ref 警告
將以下元件改成可接收 ref 或避免被外層誤傳 ref 造成警告：

- `KnowledgeFileUpload`
- `EmailEmbeddingManager`
- `EmailKnowledgeChat`

目標是清掉目前 console 裡的 React warning，讓這頁互動更穩定、除錯更乾淨。

#### 6. 端到端驗證
完成後會依這些情境驗證：

```text
情境 A：未選檔案
- 按鈕應顯示 disabled
- 有明確提示「請先選擇檔案」

情境 B：選 1 個 md 檔
- 按鈕可點
- 點下後進入 uploading
- 成功後列表顯示 done / chunk 數
- 右側索引狀態更新

情境 C：部分成功、部分失敗
- 成功項目維持 done
- 失敗項目顯示 error
- 可只重試失敗項目

情境 D：全部完成
- 主按鈕不再造成「壞掉」誤解
- 有清楚完成提示
```

### 會修改的檔案
- `src/components/admin/KnowledgeFileUpload.tsx`
- `src/components/admin/EmailEmbeddingManager.tsx`
- `src/components/admin/EmailKnowledgeChat.tsx`
- `src/pages/AdminEmailKnowledge.tsx`

### 技術摘要
- 核心問題：前端 `disabled={isUploading || pendingCount === 0}` 導致按鈕常被鎖住
- 後端上傳與 embedding 流程目前看起來已可運作，這次重點是修正前端狀態機與 UX
- 一併清除 `Function components cannot be given refs` 警告，降低頁面互動風險



## 計畫：檔案上傳到知識庫

### 1. Storage Bucket
新增 **私有 bucket `knowledge-files`**（僅 admin 可讀寫），存放原始檔案。

### 2. 資料表調整
擴充 `email_knowledge_sources`：
- 新增 `source_type`：`'document'`（文件類）
- 新增欄位：`file_path` (text, nullable)、`file_name`、`file_type`、`file_size`
- `metadata` 額外存放：原始檔資訊、頁數、解析狀態

### 3. 長文件自動分段（Chunking）
產品說明書/MD 通常很長，超過 embedding 8K token 限制。新增邏輯：
- 上傳後在 Edge Function 中解析 → 按段落切成 ~1500 字的 chunk
- 每個 chunk 一筆 `email_embeddings`（共用同一個 `source_id`）
- `email_embeddings.metadata` 記錄 `chunk_index`、`total_chunks`

### 4. 新 Edge Function：`upload-knowledge-file`
- 接收上傳的檔案 → 存到 storage `knowledge-files/{userId}/{uuid}-{filename}`
- 依副檔名解析：
  - **`.md` / `.txt` / `.eml`**：直接讀文字
  - **`.pdf` / `.docx`**：用 [Mistral OCR](https://docs.mistral.ai/) 或 LlamaParse 透過 fetch 解析（或先支援純文字 + MD，PDF/DOCX 列為「即將支援」）
- 切段 → 為每段建立 `email_knowledge_sources` + 觸發器自動排入 `pending`
- 回傳處理結果

### 5. 修改 `generate-email-embeddings`
維持不變（已支援批次處理 pending），上傳完按一次「立即生成」即可索引所有新 chunk。

### 6. 前端：在 `AdminEmailKnowledge.tsx` 的「Gmail 自動同步」卡片下方新增上傳區
- 拖放/點選上傳區（支援 `.md`、`.txt`、`.eml`、`.pdf`、`.docx`，單檔 ≤ 10MB）
- 可一次選多個檔案
- 上傳進度條 + 解析狀態
- 上傳完成後自動 refresh 列表 + embedding 狀態

### 7. 列表 UI 強化
- 已上傳的檔案在列表中顯示：📎 圖示 + 檔名 + chunk 數量
- 點擊可下載原始檔（用 signed URL）
- 刪除時連同 storage 檔案、所有 chunks、embeddings 一併刪除

### 範圍說明
✅ 本次完成：MD/TXT/EML 全文上傳 + 自動切段 + 索引  
🟡 PDF/DOCX：先放上傳 UI 並接受檔案，解析改用 Lovable AI Gemini 視覺模型讀取（不需額外 API key）— 第一階段先支援單頁 PDF、DOCX 用簡易文字抽取  
⏸ 大型 PDF（>50 頁）多模態 OCR 留待第二階段


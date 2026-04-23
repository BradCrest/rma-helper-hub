

## 計畫：在知識庫頁面顯示「最近上傳的檔案 + 索引狀態」

### 目的
解決「上傳完看不到反饋、不知道是否已索引」的疑慮。讓你一眼看到每份檔案被切成幾段、目前索引到哪。

### 改動內容

#### 1. 新增元件 `RecentKnowledgeUploads.tsx`
位置：`src/components/admin/RecentKnowledgeUploads.tsx`

顯示最近 24 小時上傳的檔案，每筆顯示：
- 檔名 + 上傳時間（相對時間，例如「2 分鐘前」）
- 總段數 / 已索引 / 待處理 / 失敗（彩色 badge）
- 進度列（已索引 / 總段數）
- 若有待處理或失敗 → 顯示「重新索引這份」按鈕

資料來源（單一查詢）：
```sql
SELECT s.id, s.file_name, s.file_size, s.created_at,
  count(e.id) as total,
  count(*) FILTER (WHERE e.status = 'completed') as completed,
  count(*) FILTER (WHERE e.status = 'pending') as pending,
  count(*) FILTER (WHERE e.status = 'failed') as failed
FROM email_knowledge_sources s
LEFT JOIN email_embeddings e ON e.source_id = s.id
WHERE s.created_at > now() - interval '24 hours'
GROUP BY s.id ORDER BY s.created_at DESC;
```

每 5 秒輪詢一次，跑完自動轉綠勾 ✅。

#### 2. 嵌入到 `AdminEmailKnowledge.tsx`
位置：`KnowledgeFileUpload` 下方、`EmailEmbeddingManager` 上方。
標題：**「最近上傳檔案的索引狀態」**

#### 3. 上傳完成後自動捲動 + 刷新
修改 `KnowledgeFileUpload.tsx`：上傳成功後
- `scrollIntoView()` 到「最近上傳檔案」區塊
- 觸發 `RecentKnowledgeUploads` 立即重新查詢一次

### UI 樣式範例
```text
┌────────────────────────────────────────────────────────┐
│ 📎 Diverout 操作方式說明_中文版_20260414.pdf  2 分鐘前 │
│ 3.3 MB · 切成 2 段                                     │
│ ▰▰▰▰▰▰▰▰▰▰  ✅ 已完成 (2/2)                          │
├────────────────────────────────────────────────────────┤
│ 📎 20241003_User_Manual_CREST_CRF_CN_V1.0.pdf  20 分鐘前│
│ 3.7 MB · 切成 11 段                                    │
│ ▰▰▰▰▰▰▰▰▰▰  ✅ 已完成 (11/11)                        │
└────────────────────────────────────────────────────────┘
```

### 需要修改的檔案
- 新增：`src/components/admin/RecentKnowledgeUploads.tsx`
- 修改：`src/pages/AdminEmailKnowledge.tsx`（嵌入新元件）
- 修改：`src/components/admin/KnowledgeFileUpload.tsx`（上傳成功後 scroll + 通知刷新）

### 不需要動的部分
- 不改後端
- 不改資料庫結構
- 不改 edge function
- 不需要新 API key

### 預期結果
1. 上傳檔案 → 自動捲到下方 → 看到新檔案出現
2. 每 5 秒自動更新，能直接看到「pending → completed」變化
3. 如果某段 failed，會出現「重新索引」按鈕直接點擊重跑
4. 你問過的 19,303 vs 19,302 這種差 1 筆的疑惑，從此一目瞭然


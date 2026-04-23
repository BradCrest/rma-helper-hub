

## 回答 + 計畫

### 你的問題回答

**1. 知識庫 AI 對話寫回知識庫時用什麼 Tag？**
- 「直接提問模式」按 `💾 存為知識` → `metadata.tag = "AI 對話修正"`，`source_type = "email"`
- 「主動學習模式」按 `💾 存為知識` → `metadata.tag = "AI 主動學習"`，`source_type = "email"`
- 草擬回覆信件「手動模式」 → `tag = "客服回覆"`
- 草擬回覆信件「主動學習模式」 → `tag = "AI 主動學習回覆"`

**2. 為什麼在「知識來源管理」的篩選看不到？**
那一排篩選按鈕篩的是 **`source_type`**（FAQ / 客服範本 / 客戶 Email / 文件），不是 `metadata.tag`。
所有 AI 寫回的條目 `source_type` 都是 `email`，所以它們**有顯示**，但被歸到「客戶 Email」分類裡面，沒有獨立的篩選按鈕。每筆條目卡片裡會顯示 `#AI 對話修正` / `#AI 主動學習` 等紫色 tag chip。

**3. 「最近上傳檔案的索引狀態」顯示「（手動建立）」**
目前 `RecentKnowledgeUploads.tsx` 只判斷有沒有 `file_name`，沒有的就一律寫「（手動建立）」。需要根據 `metadata.saved_from` 推斷真正來源並改顯示文字。

---

### 計畫

#### A. 在「知識來源管理」加上 Tag 篩選列

**修改 `src/pages/AdminEmailKnowledge.tsx`**

在現有的 source_type 篩選列下方，新增第二排 **Tag 篩選**（只顯示實際存在於資料中的 tag）：

```text
篩選類型：[全部] [FAQ] [客服範本] [客戶 Email] [文件]
篩選標籤：[全部標籤] [#AI 對話修正 (3)] [#AI 主動學習 (5)] [#客服回覆 (2)] [#AI 主動學習回覆 (1)] ...
```

- 新增狀態 `tagFilter: string | "all"`，預設 `"all"`
- 從 `sources` 動態算出所有出現過的 tag + 計數（`useMemo`）
- `filtered` 邏輯加上 tag 比對：`(tagFilter === "all" || s.metadata?.tag === tagFilter)`
- 切換 tag 時 `setCurrentPage(1)`

#### B. 修正「最近上傳檔案的索引狀態」的標題

**修改 `src/components/admin/RecentKnowledgeUploads.tsx`**

1. `fetchData` 撈 `email_knowledge_sources` 時 `select` 加上 `metadata`（已經有了，確認帶入 group）
2. group 物件多加 `saved_from`、`tag` 欄位
3. 計算顯示名稱的優先序：
   - 有 `file_name` → 顯示檔名（維持現狀）
   - 否則看 `metadata.saved_from`：
     - `"email_knowledge_chat"` → 顯示「💬 知識庫 AI 對話（修正）」
     - `"email_knowledge_chat_learning"` → 顯示「✨ 知識庫 AI 對話（主動學習）」
     - `"draft_email_reply"` → 顯示「✍️ 草擬回覆信件（修正）」
     - `"draft_email_reply_learning"` → 顯示「✨ 草擬回覆信件（主動學習）」
     - 其他 → 沿用 `metadata.tag` → fallback 「（手動建立）」
4. group key 不能再共用 `__manual__{id}`，改用 `__{saved_from}__{id}` 確保不同來源不誤合併

#### 不需要改動
- 不改後端 / DB / edge function
- 不改既有寫回邏輯，已存的舊條目立刻吃到新 UI（讀 `metadata`）

### 需要修改的檔案
- `src/pages/AdminEmailKnowledge.tsx`（新增 tag 篩選列）
- `src/components/admin/RecentKnowledgeUploads.tsx`（標題改判斷邏輯）

### 預期效果
1. 「知識來源管理」可以一鍵篩出所有「AI 對話修正」「AI 主動學習」「客服回覆」等條目
2. 「最近上傳」清楚看出每筆是來自哪個功能寫回，而不是統一「（手動建立）」
3. 不會動到任何寫入流程，舊資料即時生效


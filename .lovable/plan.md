

## 計畫：把客戶來信 + 修正後草稿一鍵存入知識庫

### 目的
讓你在 `/admin/email-knowledge` 頁面草擬完回覆、人工修正內容後，按一個按鈕就能把「客戶來信 + 最終回覆」存進知識庫，自動觸發向量索引，下次 AI 草擬時就會引用，越用越聰明。

### 改動內容

#### 1. 修改 `src/components/admin/DraftEmailReply.tsx`
在草稿區塊下方新增「💾 儲存為知識來源」按鈕，按下後：

- 標題自動組成：`客戶Email - {主旨 || 寄件人 || 日期}`
- 內容組成（純文字，方便日後 AI 檢索）：
  ```
  【客戶來信】
  寄件人：xxx
  主旨：xxx
  
  {客戶原文}
  
  ---
  
  【客服回覆（已人工修正）】
  {修正後的草稿}
  ```
- `source_type = 'customer_email'`（新標籤，可在知識庫管理頁篩選）
- `metadata` 存：`{ sender, subject, rma_number, model_used, saved_from: 'draft_email_reply' }`
- 直接 `supabase.from('email_knowledge_sources').insert(...)` ← 觸發器會自動建立 pending embedding，背景排程會自動產生向量

按下後：
- 顯示 toast「已加入知識庫，背景索引中…」
- 按鈕變灰並標示「✅ 已儲存」（避免重複按）
- 可選：觸發 `kickoffEmailEmbeddingJob('manual')` 立即喚醒索引（不等 cron）

#### 2. 修改 `src/components/admin/EmbeddingManager.tsx` / 知識來源列表
在 `source_type` 篩選/顯示加上 `customer_email` 對應中文標籤「客戶 Email」，使用不同顏色 badge（建議橙色）方便辨識。

#### 3. （可選）修改 `supabase/functions/draft-email-reply/index.ts`
不需要改後端 — 因為儲存是直接從前端寫 `email_knowledge_sources`（admin RLS 允許），且 trigger 自動處理 embedding。

### UI 樣式
```text
┌─ 草稿產生後 ────────────────────────────────────┐
│ 模型：claude-sonnet-4-5 · 檢索 5 筆參考  [複製] │
├─────────────────────────────────────────────────┤
│ [可編輯的草稿 textarea]                         │
│                                                 │
└─────────────────────────────────────────────────┘
                              [💾 儲存為知識來源]  ← 新按鈕
                              提示：修正後再儲存，AI 會學到你的用語
```

### 需要修改的檔案
- 修改：`src/components/admin/DraftEmailReply.tsx`（加儲存按鈕 + 邏輯）
- 修改：`src/components/admin/EmbeddingManager.tsx` 或來源列表元件（加 `customer_email` 標籤顯示）

### 不需要動的部分
- 不改資料庫結構（`source_type` 是 text，可直接寫新值）
- 不改 edge function
- 不改向量索引機制（trigger 自動處理）
- 不需要新 secret

### 預期效果
1. 修正完草稿 → 一鍵存進知識庫 → 自動切段 + 向量化
2. 下次有類似客戶來信，AI 草擬時會直接參考你修正過的版本
3. 知識庫管理頁可篩選「客戶 Email」分類，方便日後審視/刪除錯誤學習資料
4. 越用越貼近你的客服語氣


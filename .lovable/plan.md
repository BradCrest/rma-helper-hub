# 修復「存入知識庫」失敗：source_type CHECK constraint

## 症狀
在 RMA 回覆 tab 按「存入知識庫」，出現：
```
new row for relation "email_knowledge_sources" violates check constraint
"email_knowledge_sources_source_type_check"
```

## 根因
`RmaReplyTab.handleSaveToKnowledge` 寫入時 `source_type: "email"`。Dev 環境的 constraint 已包含 `'email'`（migration `20260420162426` 已套用），但 **Live／您目前實際使用的環境** 上的 constraint 仍是舊版，只允許 `'faq', 'template', 'document'`，因此被擋。

## 解法（兩道保險，都要做）

### 1. 重新套用 constraint（新 migration）
建立一個新的 idempotent migration，確保任何環境的 constraint 都包含 `email`：

```sql
ALTER TABLE public.email_knowledge_sources
  DROP CONSTRAINT IF EXISTS email_knowledge_sources_source_type_check;

ALTER TABLE public.email_knowledge_sources
  ADD CONSTRAINT email_knowledge_sources_source_type_check
  CHECK (source_type = ANY (ARRAY['faq','template','email','document']));
```

這道修正即時解掉 dev 與 Live 的不一致；之後您發布／同步 schema 時也會帶上去。

### 2. 強化錯誤訊息（前端小改）
目前 toast 是 `存入知識庫失敗：<原始 SQL 錯誤>`，內容很長且只截到「附件的資訊」之類片段。改成：
- 偵測到含有 `source_type_check` 字樣 → 顯示「知識庫資料表設定尚未更新，請重試或聯絡管理員（DB constraint 過期）」
- 其他錯誤照原樣顯示，但截斷至 200 字以內

異動檔案：`src/components/logistics/RmaReplyTab.tsx` 內 `handleSaveToKnowledge` 的 catch 區塊（單一函式、極小改動）。

## 不做
- 不改 `source_type` 為其他字串（`'email'` 是正確語意）
- 不改 `email_knowledge_sources` 其他欄位或 RLS
- 不動 `CustomerEmailTab`、`DraftEmailReply`、`EmailKnowledgeChat` 的儲存邏輯（它們也都送 `'email'`，這次修完會一起好）
- 不處理「附件」相關功能 — 此按鈕本來就不存附件，您看到的「附件資訊」只是錯誤 toast 被截斷後的片段，並非真的有附件邏輯壞掉

## 驗收
1. 在 RMA 回覆 tab 按「存入知識庫」 → toast 顯示「已存入知識庫，正在喚醒背景索引…」
2. `email_knowledge_sources` 新增一筆 `source_type='email'`、`metadata.origin='rma_reply'` 的紀錄
3. 背景 embedding job 開始跑，幾分鐘後該筆 `status` 變 `completed`
4. `CustomerEmailTab` 的「存入知識庫」也同步可用（同一條 constraint）

## 檔案異動
**新增：** `supabase/migrations/<timestamp>_fix_email_knowledge_source_type_check.sql`

**修改：** `src/components/logistics/RmaReplyTab.tsx`（catch 區塊錯誤訊息友善化，~6 行）

**不動：** 其他所有檔案



## 計畫：知識庫 AI 對話可編輯回答 + 一鍵存回知識庫

### 目的
1. 把區塊標題 **「Email 知識庫 AI 對話」** 改為 **「知識庫 AI 對話」**
2. AI 回答後你可以直接修改內容（修正錯誤），按一個按鈕把「問題 + 修正後的答案」寫回 `email_knowledge_sources`，下次 AI 回答時會引用你修正過的版本，逐步修正錯誤知識。

### 改動內容（單一檔案：`src/components/admin/EmailKnowledgeChat.tsx`）

#### 1. 標題與描述
- 標題：「知識庫 AI 對話」
- 副標題：「用自然語言查詢知識庫；可編輯回答並存回知識庫修正錯誤」

#### 2. 訊息資料結構擴充
每則 assistant 訊息增加狀態：
- `isEditing`：是否在編輯模式
- `editedContent`：編輯中的暫存內容
- `savedAsKnowledge`：是否已存回知識庫（避免重複存）

#### 3. 每則 AI 回答下方新增操作列
```text
┌─ AI 回答氣泡 ────────────────────────────────────┐
│ {AI 回答內容（編輯模式時變成 textarea）}         │
└──────────────────────────────────────────────────┘
   [✏️ 編輯] [💾 存為知識]              ← 預設狀態
   
   編輯模式時：
   [✅ 完成編輯] [❌ 取消]   後變回上面那行
```
- **僅在串流結束後顯示**（避免邊串流邊出現按鈕）
- **空回答不顯示**

#### 4. 「✏️ 編輯」按鈕
- 點擊把該則訊息切換成 `<Textarea>`，內容為當前文字
- 即時更新 `editedContent`
- 「✅ 完成編輯」把 `editedContent` 寫回 `messages[i].content`，退出編輯
- 「❌ 取消」丟棄編輯，退出編輯

#### 5. 「💾 存為知識」按鈕
邏輯（仿 `DraftEmailReply` 的 `handleSaveAsKnowledge`）：
- 找到該則 AI 訊息**之前最近的 user 訊息**作為「問題」
- 組合內容：
  ```
  【使用者問題】
  {user 問題}
  
  ---
  
  【AI 回答（已人工修正）】
  {修正後的 AI 回答}
  ```
- 寫入 `email_knowledge_sources`：
  - `source_type: 'email'`（沿用現有 tag 體系，知識庫管理頁顯示為「客戶 Email」）
  - `title: 'AI 對話修正 - {問題前 60 字}'`
  - `metadata`：
    ```json
    {
      "language": "zh-TW",
      "tag": "AI 對話修正",
      "question": "...",
      "model_used": "...",
      "saved_from": "email_knowledge_chat",
      "was_edited": true | false
    }
    ```
  - `created_by: user?.id`
- 成功後：toast「已加入知識庫，背景索引中…」、按鈕變灰並顯示「✅ 已存入知識庫」
- 立刻呼叫 `kickoffEmailEmbeddingJob('manual')` 喚醒索引

#### 6. UI 細節
- 編輯模式 textarea：`min-h-[120px] w-full text-sm` 帶邊框
- 操作列按鈕用小尺寸 ghost / outline 樣式，避免干擾對話
- 修改後 `savedAsKnowledge` 自動重設為 `false`，可再次存（覆蓋學習）
- 引入 `useAuth` 取得 `user?.id`、引入 `kickoffEmailEmbeddingJob`

### 不需要動的部分
- 不改後端 / edge function / 資料庫
- 不改 trigger（insert 後 `mark_email_embedding_pending` 自動建立 pending embedding）
- 不改知識庫管理頁（標籤已支援 `email`）
- 不改 RAG 檢索邏輯（下次對話會自動引用新內容）

### 預期效果
1. 標題乾淨改為「知識庫 AI 對話」
2. 發現 AI 回答有錯 → 直接編輯 → 存回知識庫 → 下次同類問題自動引用修正後版本
3. 在知識庫管理頁可看到 `tag: "AI 對話修正"` 條目，方便日後審視 / 刪除錯誤學習
4. 越用越聰明，符合「逐步修正錯誤知識」的目標


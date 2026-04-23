## 計畫：AI 自動產題 → 人工審題 → AI 回答 → 人工修正 → 存回知識庫

### 目的

在「知識庫 AI 對話」區塊新增**主動學習模式**：

1. 點按鈕讓 AI 從現有知識庫挖出「值得補充」的問題
2. 你檢視並修改題目
3. 確認後 AI 用知識庫回答
4. 你修正答案
5. 一鍵存回 `email_knowledge_sources`，餵養下次的 RAG

整個流程是「主動學習」，不用等客戶來信，你就能持續訓練模型。

### UI 流程

```text
┌─ 知識庫 AI 對話 ─────────────────────────────────┐
│                                                  │
│  [💬 直接提問模式]  [✨ 主動學習模式 ←新]       │  ← 模式切換
│                                                  │
├─ 主動學習模式畫面 ──────────────────────────────┤
│                                                  │
│  [🎲 由 AI 產生練習題]                           │  ← 步驟 1
│                                                  │
│  ┌─ AI 產生的題目（可編輯）─────────────────┐  │
│  │ 客戶詢問海外寄修運費誰負擔？              │  │  ← 步驟 2
│  │ [編輯區可改題目文字]                       │  │
│  └────────────────────────────────────────────┘  │
│  [✅ 確認此題目，產生回答]  [🔄 重新出題]       │
│                                                  │
│  ┌─ AI 根據知識庫的回答（串流）──────────────┐  │
│  │ 海外客戶寄修...                            │  │  ← 步驟 3 + 4
│  │ [編輯] [💾 存為知識]                       │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 改動內容

#### 1. 新增 Edge Function `supabase/functions/generate-knowledge-question/index.ts`

**目的**：呼叫 Lovable AI 從知識庫採樣 3-5 篇文章，請 AI 產出一個「值得補充或測試」的客服情境問題（純文字、繁中、單一問題）。

**邏輯**：

- 驗證 admin 身份（同 `email-knowledge-chat`）
- 從 `email_knowledge_sources` 隨機取 5 筆 `title + content` 摘要
- 系統提示：
  > 你是 CREST 客服訓練助理。根據以下知識庫片段，產生「一個」實際可能發生的客戶來信情境問題（繁體中文、口語、20-60 字、不要解釋、不要編號），讓客服練習回覆。
- 模型：沿用 `ai_settings` 的 `admin_chat_model`（預設 `google/gemini-2.5-flash`）
- 非串流，回傳 `{ question: string }`
- 處理 429 / 402 錯誤
- `supabase/config.toml` 加 `verify_jwt = false`（在程式內驗證 JWT）

#### 2. 修改 `src/components/admin/EmailKnowledgeChat.tsx`

**新增模式切換**：

- 頂端兩顆 tab 按鈕：「💬 直接提問」/「✨ 主動學習」
- 預設為「直接提問」（保持現有行為）

**新增「主動學習」區塊狀態**：

```typescript
type LearningStage = "idle" | "generating_q" | "editing_q" | "answering" | "answered";
const [stage, setStage] = useState<LearningStage>("idle");
const [generatedQuestion, setGeneratedQuestion] = useState("");
const [questionDraft, setQuestionDraft] = useState("");
const [learningAnswer, setLearningAnswer] = useState("");
const [answerDraft, setAnswerDraft] = useState("");
const [isEditingAnswer, setIsEditingAnswer] = useState(false);
const [savedToKnowledge, setSavedToKnowledge] = useState(false);
```

**步驟 1：產生題目**

- 「🎲 由 AI 產生練習題」按鈕 → `supabase.functions.invoke("generate-knowledge-question")`
- 成功後 `stage = "editing_q"`、`questionDraft = data.question`

**步驟 2：審題**

- `<Textarea>` 顯示題目，可即時編輯 `questionDraft`
- 「✅ 確認此題目，產生回答」→ 進入 `stage = "answering"`，呼叫既有的 `email-knowledge-chat`（傳 `[{role:"user", content: questionDraft}]`），複用現有 SSE 串流邏輯把回答寫進 `learningAnswer`
- 「🔄 重新出題」→ 重新呼叫 step 1

**步驟 3 + 4：審答案**

- 串流結束後 `stage = "answered"`，顯示回答 + 操作列：
  - 「✏️ 編輯」→ 切換 `<Textarea>`，更新 `answerDraft`
  - 「💾 存為知識」→ 同 `handleSaveAsKnowledge` 邏輯：
    ```
    【練習題目】
    {questionDraft}

    ---

    【知識庫回答（已人工修正）】
    {learningAnswer}
    ```
    - `source_type: 'email'`
    - `title: 'AI 主動學習 - {題目前 60 字}'`
    - `metadata.tag: 'AI 主動學習'`、`saved_from: 'email_knowledge_chat_learning'`、`auto_generated_question: true`
    - 觸發 `kickoffEmailEmbeddingJob('manual')`
- 存完顯示「✅ 已存入知識庫」、提供「下一題」按鈕重置流程

**錯誤處理**：429 / 402 / 一般錯誤 → toast，不留半截 UI

#### 3. （無需改動）

- 不改資料庫 schema
- 不改 `email-knowledge-chat` edge function
- 不改 `kickoff-email-embedding-job`
- 不改 `EmbeddingManager` 列表
- 既有「直接提問」模式完全保留

### 技術細節

- **題目產生用非串流**（單句很短，沒必要 SSE）
- **回答產生複用串流**（沿用既有 `email-knowledge-chat`，不用重寫 RAG）
- **模式切換不清空對話**：主動學習狀態獨立保存，切回直接提問還在
- **JWT 驗證**：edge function 內 `userClient.auth.getUser()` + 檢查 `user_roles`
- **CORS**：沿用現有 headers
- **模型選擇**：與 `email-knowledge-chat` 共用 `ai_settings.admin_chat_model` 設定

### 需要修改的檔案

- 新增：`supabase/functions/generate-knowledge-question/index.ts`
- 修改：`src/components/admin/EmailKnowledgeChat.tsx`（加模式切換 + 主動學習流程）

### 預期效果

1. 沒題目可問也能持續訓練 AI
2. 你掌握每一道題目和答案的最終版本
3. 修正後立即向量化，下次對話 / 草擬時即引用
4. 知識庫管理頁可用 `tag: "AI 主動學習"` 篩選 / 審視
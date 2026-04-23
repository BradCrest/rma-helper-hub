

## 計畫：草擬回覆信件加入「主動學習」功能

### 目的
把「知識庫 AI 對話」的主動學習流程，搬一份到「草擬回覆信件」區塊，讓你不用等真的客戶來信，也能持續訓練 AI 寫客服回覆：

1. AI 自動產生一封模擬客戶來信
2. 你檢視 / 修改題目
3. 確認後 AI 用知識庫草擬回覆
4. 你修正回覆
5. 一鍵把「客戶來信 + 修正後的回覆」存回知識庫

### UI 流程

```text
┌─ ✍️ 草擬回覆信件 ──────────────────────────────┐
│                                                │
│  [💬 手動模式]   [✨ 主動學習模式 ←新]         │  模式切換
│                                                │
├─ 主動學習模式 ─────────────────────────────────┤
│                                                │
│  [🎲 由 AI 產生模擬客戶來信]                    │  步驟 1
│                                                │
│  ┌─ AI 產生的客戶來信（可編輯）──────────────┐│
│  │ 主旨：[可改]                               ││  步驟 2
│  │ 內文：[textarea, 可改]                     ││
│  │ 寄件人 / RMA 編號：[選填，可改]            ││
│  └────────────────────────────────────────────┘│
│  [✅ 確認，產生回覆草稿] [🔄 重新出題]         │
│                                                │
│  ┌─ AI 草擬的回覆（可編輯）──────────────────┐│
│  │ {草稿內容}                                 ││  步驟 3 + 4
│  │ 模型：xxx · 檢索 N 筆                      ││
│  │ [✏️ 編輯] [📋 複製] [💾 存為知識]          ││
│  └────────────────────────────────────────────┘│
│  [➡️ 下一題]                                   │
└────────────────────────────────────────────────┘
```

### 改動內容

#### 1. 新增 Edge Function `supabase/functions/generate-practice-email/index.ts`
**目的**：產生一封「模擬客戶來信」（含主旨 + 內文 + 模擬寄件人 + 可選 RMA 編號）

**邏輯**：
- 驗證 admin（同 `generate-knowledge-question`）
- 從 `email_knowledge_sources` 隨機取 5 筆作為情境靈感
- 從 `rma_requests` 隨機取 1 筆作為可能的 RMA 上下文（取 `rma_number` + `product_name` + `customer_name`，可空）
- 模型：沿用 `ai_settings.slack_reply_model`（與草擬回覆同模型，預設 `google/gemini-2.5-pro`）
- 系統提示要求 AI 輸出**嚴格 JSON**：
  ```json
  {
    "subject": "...",
    "body": "...",
    "sender": "customer@example.com",
    "rmaNumber": "RC7E9001234"
  }
  ```
- 用 `response_format: { type: "json_object" }`
- 處理 429 / 402 錯誤
- `supabase/config.toml` 加 `verify_jwt = true`

#### 2. 修改 `src/components/admin/DraftEmailReply.tsx`

**模式切換**：
- 區塊標題列下方加兩個 tab 按鈕：「💬 手動模式」/「✨ 主動學習模式」
- 預設「手動模式」（保留現有所有行為）
- 切換不清空既有狀態

**主動學習區塊新增狀態**：
```typescript
type LearningStage = "idle" | "generating_q" | "editing_q" | "answering" | "answered";
const [stage, setStage] = useState<LearningStage>("idle");
const [practiceSubject, setPracticeSubject] = useState("");
const [practiceBody, setPracticeBody] = useState("");
const [practiceSender, setPracticeSender] = useState("");
const [practiceRma, setPracticeRma] = useState("");
const [practiceDraft, setPracticeDraft] = useState("");
const [practiceModel, setPracticeModel] = useState("");
const [practiceRagCount, setPracticeRagCount] = useState(0);
const [practiceSaved, setPracticeSaved] = useState(false);
```

**步驟 1：產生模擬來信**
- 「🎲 由 AI 產生模擬客戶來信」→ `supabase.functions.invoke("generate-practice-email")`
- 成功 → 把回傳 `subject/body/sender/rmaNumber` 寫入 practice 狀態，`stage = "editing_q"`

**步驟 2：審題**
- 4 個 input/textarea（主旨、寄件人、RMA、內文）皆可編輯
- 「✅ 確認，產生回覆草稿」→ `stage = "answering"`，呼叫**現有的** `draft-email-reply` edge function（傳 practice 那組 subject/body/sender/rmaNumber），結果寫入 `practiceDraft`/`practiceModel`/`practiceRagCount`，`stage = "answered"`
- 「🔄 重新出題」→ 回到步驟 1，清空 practice 狀態

**步驟 3 + 4：審回覆 + 存回知識庫**
- 草稿 textarea 可編輯（即時更新 `practiceDraft`，重設 `practiceSaved`）
- 「📋 複製」按鈕（同手動模式）
- 「💾 存為知識」→ 仿現有 `handleSaveAsKnowledge` 邏輯：
  ```
  【客戶來信】
  寄件人：xxx
  主旨：xxx
  RMA：xxx
  
  {practiceBody}
  
  ---
  
  【客服回覆（已人工修正）】
  {practiceDraft}
  ```
  - `source_type: 'email'`
  - `title: 'AI 主動學習回覆 - {主旨前 60 字 || 寄件人 || 日期}'`
  - `metadata`：
    ```json
    {
      "language": "zh-TW",
      "tag": "AI 主動學習回覆",
      "sender": "...",
      "subject": "...",
      "rma_number": "...",
      "model_used": "...",
      "saved_from": "draft_email_reply_learning",
      "auto_generated_question": true
    }
    ```
  - 觸發 `kickoffEmailEmbeddingJob('manual')`
  - 顯示「✅ 已儲存」、出現「➡️ 下一題」按鈕，按下重置流程回到步驟 1

**錯誤處理**：429 / 402 / 一般錯誤 → toast，不留半截 UI

#### 3. （無需改動）
- 不改資料庫 schema
- 不改 `draft-email-reply` edge function（直接複用）
- 不改 `kickoff-email-embedding-job`
- 不改 `EmbeddingManager` 列表（標籤已支援 `email`）
- 既有「手動模式」完全保留

### 技術細節
- **模擬來信用非串流**（一次輸出 JSON，沒必要 SSE）
- **回覆產生複用現有 `draft-email-reply`**（自動 RAG + Anthropic/Lovable AI 切換）
- **JSON 解析容錯**：edge function 內 `JSON.parse` 失敗時回退用整段文字當 body
- **模型選擇**：模擬來信跟著 `slack_reply_model` 設定（與真實草擬一致）
- **CORS / JWT**：沿用現有 pattern

### 需要修改的檔案
- 新增：`supabase/functions/generate-practice-email/index.ts`
- 修改：`supabase/config.toml`（加 `[functions.generate-practice-email] verify_jwt = true`）
- 修改：`src/components/admin/DraftEmailReply.tsx`（加模式切換 + 主動學習流程）

### 預期效果
1. 沒客戶來信也能產生擬真情境，持續訓練 AI 客服語氣
2. 你掌握每封來信和回覆的最終版本
3. 修正後立刻向量化，下次草擬時即引用
4. 知識庫管理頁可用 `tag: "AI 主動學習回覆"` 篩選 / 審視


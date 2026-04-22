

## 我的判斷：方向對，做法可以更精簡

### Claude 建議的核心觀念是對的
**API Key 絕對不能放在 Lovable 前端**，因為前端程式碼會被打包到瀏覽器，所有用戶都能看到。這點 Claude 說的 100% 正確。

### 但「另外架 FastAPI」是不必要的
你的專案**已經有後端**——就是 Supabase Edge Functions（用 TypeScript / Deno 跑）。它扮演的角色和 Claude 推薦的 FastAPI 完全一樣：

```text
Lovable 前端 (React)
    ↓ supabase.functions.invoke("draft-email-reply")
Supabase Edge Function (已經存在的後端)
    ↓ 從 ai_settings 讀模型 + 從 email_embeddings 找知識庫
    ↓ 呼叫 Claude / Gemini / GPT-5 API
回傳草稿給前端顯示
```

優點：
- 不用另外租 server、設網域、處理 SSL
- 不用維護兩套後端（Python + TypeScript）
- 知識庫已經在 Supabase（pgvector + email_embeddings），不用搬資料
- ANTHROPIC_API_KEY 可直接存 Supabase secret，前端拿不到

唯一差異只是「語言」：你現有的後端是 TypeScript 不是 Python，但呼叫 Anthropic API 的邏輯一模一樣。

---

## 對應到 Claude 給的範例

| Claude 的 FastAPI | 你的專案會用的 |
|---|---|
| `server.py` + FastAPI | `supabase/functions/draft-email-reply/index.ts` |
| `@app.post("/api/reply")` | `serve(async (req) => ...)` |
| 知識庫 MD 檔放後端 | 已存於 `email_embeddings`（pgvector） |
| `generate_draft_with_claude()` | edge function 內 fetch Anthropic API |
| 前端 `fetch("/api/reply")` | 前端 `supabase.functions.invoke("draft-email-reply")` |
| 自己處理 CORS / Auth | Supabase 自動處理 + JWT 驗證 |

結論：**Claude 推薦的架構在你這裡已經有了**，只差「新增一個 edge function + 加 ANTHROPIC_API_KEY」就能用 Claude 草擬回覆。

---

## 計畫：用既有 Edge Function 架構整合 Claude

### 1. 加入 Anthropic API Key（後端密鑰，前端拿不到）
透過 `add_secret` 請你提供：
- `ANTHROPIC_API_KEY`（從 https://console.anthropic.com/settings/keys 取得）

存在 Supabase secret，只有 edge function 能讀。

### 2. 建立 `draft-email-reply` Edge Function
新增 `supabase/functions/draft-email-reply/index.ts`：
- JWT 驗證（只有登入的 admin 能呼叫）
- 接收：客戶 Email 主旨 + 內文 + 寄件人（選填 RMA 編號）
- 從 `ai_settings.slack_reply_model` 讀目前選的模型
- 用 OpenAI embedding 把客戶 Email 轉向量 → 從 `email_embeddings` 找最相關 5~8 筆歷史回覆
- 組 system prompt（含品牌語氣 + 知識庫片段）
- 根據模型字串分流：
  - `anthropic/*` → 呼叫 `https://api.anthropic.com/v1/messages`
  - `google/*` / `openai/*` → 呼叫現有 Lovable AI Gateway
- 回傳純文字草稿 JSON

### 3. 擴充 AI 模型白名單
- `update-ai-settings/index.ts`：`ALLOWED_MODELS` 加入 `anthropic/claude-sonnet-4-5`、`anthropic/claude-opus-4-1`、`anthropic/claude-haiku-4-5`
- `AiModelSettings.tsx`：在「Slack 客服回覆模型」下拉新增 Claude 選項，標註「使用 Anthropic 直連，需 ANTHROPIC_API_KEY」

### 4. 前端入口（Email 知識庫頁面）
在 `/admin/email-knowledge` 頁面新增「草擬回覆信件」區塊：
- 主旨輸入框
- 內文輸入框（多行）
- 寄件人 Email（選填）
- 「產生草稿」按鈕
- 草稿結果顯示區（可編輯、複製）
- 顯示目前使用的模型名稱

呼叫方式（純前端，無 API Key）：
```ts
const { data } = await supabase.functions.invoke("draft-email-reply", {
  body: { subject, body, sender }
});
```

### 5. 可觀測性
草稿產生紀錄寫入新表 `email_draft_logs`（選填），記錄：用了哪個模型、檢索到幾筆知識、產生時間，方便之後評估 Claude vs Gemini 的品質差異。

---

## 為什麼這比 Claude 建議的 FastAPI 方案好

| 項目 | FastAPI 自架 | Edge Function（推薦） |
|---|---|---|
| 額外伺服器 | 需要（Render / Railway / VPS） | 不需要 |
| 部署 | 自己處理 | git push 自動部署 |
| Auth | 自己接 Supabase JWT | 自動帶 Authorization |
| 知識庫存取 | 跨服務查 Supabase | 同一個專案內 |
| API Key 安全 | 存後端 env | 存 Supabase secret |
| 維護成本 | 兩套（Python + TS） | 一套（TS） |
| 月成本 | 額外 server 費用 | 含在現有方案 |

唯一場景需要 FastAPI：**你已經有大量 Python 邏輯不想重寫**。但你的專案是 TypeScript-first，重寫一個薄薄的 fetch 包裝（約 80 行）比另外維護一台 Python server 划算太多。

---

## 需要你確認

1. **是否同意用 Edge Function 整合 Claude？**（不用另架 FastAPI）
2. **草擬回覆的入口要放哪裡？**
   - A. `/admin/email-knowledge` 頁面新增區塊（推薦，知識庫旁邊）
   - B. RMA 詳情對話框內（針對特定 RMA 草擬）
   - C. 獨立新頁面 `/admin/draft-reply`
   - D. 以上都要
3. **Claude 模型預設選哪個？**
   - `claude-sonnet-4-5`（推薦：品質/成本平衡）
   - `claude-opus-4-1`（最強，貴）
   - `claude-haiku-4-5`（最快，便宜）

確認後我會切換到實作模式，先請你提供 `ANTHROPIC_API_KEY`，然後建置 edge function 和前端介面。


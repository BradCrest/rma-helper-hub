## 目標

在「客戶來信」分頁的 AI 草稿下方新增「儲存到知識庫」功能，把客戶原信 + 編輯後的回覆寫入既有的 `email_knowledge_sources`，並觸發背景索引；同時改善信件清單的快取行為，避免每次切換分頁都重新拉取。

---

## 一、新增「儲存到知識庫」功能

### UI（CustomerEmailTab.tsx，AI 草稿區塊下方）

新增一個摺疊區塊「💾 存入知識庫」，包含：

- **標題**（自動帶入信件主旨，可編輯）
- **標籤**（選填輸入框，例如：保固、退貨）
- **儲存內容預覽**（唯讀，顯示將寫入的格式，見下方）
- **儲存按鈕**（寫入後顯示成功狀態 + 「在知識庫檢視」連結）

只有在「AI 草稿已產生且非空」時，這個區塊才會出現（因為要存的是「來信 + 回覆」配對）。

### 寫入格式

把客戶原信和編輯後的草稿合併成一筆 `email` 類型的知識來源，內容格式：

```text
【客戶來信】
寄件人：{name} <{email}>
主旨：{subject}
時間：{date}
{RMA: xxx 若有偵測到}

{原信純文字內容}

---

【客服回覆】
{編輯後的草稿內容}
```

### 寫入邏輯

直接呼叫 `supabase.from("email_knowledge_sources").insert(...)`（沿用 AdminEmailKnowledge.tsx 第 109-130 行的模式），payload：

```ts
{
  source_type: "email",
  title: 形如「客戶來信：{主旨}」,
  content: 上述合併文字,
  metadata: {
    language: "zh-TW",
    tag: 使用者輸入的標籤 || undefined,
    sender: "{name} <{email}>",
    gmail_message_id: detail.id,           // 用於去重檢查
    rma_number: detectedRma || undefined,
    saved_at: new Date().toISOString(),
  },
  created_by: user?.id,
}
```

寫入成功後呼叫 `kickoffEmailEmbeddingJob("customer-email-save")` 觸發背景索引（與既有流程一致），並 toast 顯示結果。

### 防重複

寫入前先用 `gmail_message_id` 查一下：

```ts
supabase.from("email_knowledge_sources")
  .select("id").eq("metadata->>gmail_message_id", detail.id).maybeSingle()
```

若已存在，按鈕改為「更新已儲存內容」走 `update` 路徑；若是新存，呈現「✓ 已存入知識庫」並停留在該狀態（含「在知識庫檢視」按鈕，連到 `/admin/email-knowledge`）。

### 額外：選擇切換信件後重置

切換到別封信時，重置「已存入」狀態。

---

## 二、改善信件清單快取

### 現況問題

每次離開再回到 `/admin/logistics`、或切換到其他分頁再回來，`CustomerEmailTab` 都會 unmount → 重新 mount → 重新 `loadMessages()`。

### 解決方案：模組層級快取 + TTL

在 `CustomerEmailTab.tsx` 檔案頂部建立 module-scope 快取（不需要 React Query，最小改動）：

```ts
// 模組級快取：跨 mount 保留
const emailListCache = new Map<string, { data: EmailListItem[]; ts: number }>();
const emailDetailCache = new Map<string, EmailDetail>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分鐘
```

**清單快取行為：**
- key = `${filter}|${search}` (即 query 字串)
- mount 時若快取存在且未過期 → 直接顯示快取，不發 request
- 使用者按「同步」按鈕 → 強制刷新並更新快取（這是唯一觸發網路請求的方式，當快取有效時）
- 切換 filter/search 時，若該 key 有快取也直接用，否則 fetch

**信件內文快取：**
- key = `messageId`
- 已讀過的信件直接從快取顯示，不重打 `gmail-get-message`
- 標記已讀的 modify call 仍照舊（只第一次跑）

### 視覺提示

工具列加上「最後同步：X 分鐘前」小字，讓使用者知道資料是快取的，需要時可手動按「同步」。

---

## 技術細節

**檔案異動：**
- `src/components/logistics/CustomerEmailTab.tsx` — 新增儲存區塊 UI、寫入邏輯、模組層級快取
- 不需要新的 edge function（直接用 supabase-js 寫表）
- 不需要 DB migration（沿用 `email_knowledge_sources` 既有結構，metadata jsonb 自由擴充）

**沿用既有功能：**
- 寫入後背景索引：`kickoffEmailEmbeddingJob("customer-email-save")` (lib/email-embedding-job.ts)
- 知識庫頁面已會自動顯示新增的 `email` 類型項目，含 metadata 標籤、語言過濾

**不會破壞：**
- 切換分頁回來看到舊資料是預期行為，按「同步」即可拉新
- Gmail 第一次 mount 仍會 fetch（首次無快取）
- 5 分鐘 TTL 過期後自動重抓

---

## 驗收

1. 開一封客戶來信 → 按 ✨AI 草擬回覆 → 編輯草稿
2. AI 草稿下方出現「💾 存入知識庫」區塊
3. 輸入標籤（例如「保固詢問」）→ 按儲存
4. Toast 顯示「已存入知識庫，背景索引已排程」
5. 到 `/admin/email-knowledge` → 篩選「客戶 Email」→ 看到剛存入的記錄，內容包含原信 + 回覆
6. 同一封信再按一次 → 變成「更新已儲存內容」
7. 離開 `/admin/logistics` 切到別頁再回來 → 信件清單立即顯示（無 loading），標示「最後同步：X 分鐘前」
8. 按「同步」→ 重新拉取最新信件
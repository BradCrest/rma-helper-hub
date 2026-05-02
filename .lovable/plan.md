# 後續關懷流程（Follow-up Care）完整實作

> **狀態**：等待你按「Approve」後切回 default mode 一次完成 D → E → A → B → C → F。
> 本檔案為實作藍圖,所有檔案內容都已備妥可直接落地。

---

## D：資料庫 migration

新檔 `supabase/migrations/20260502175028_rma_followup_surveys.sql`：

```sql
CREATE TABLE IF NOT EXISTS public.rma_followup_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_id UUID NOT NULL REFERENCES public.rma_requests(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT replace(replace(replace(
    encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', ''),
  satisfaction INT,
  comments TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 用 trigger 而非 CHECK 約束（專案規範）
CREATE OR REPLACE FUNCTION public.validate_followup_survey()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.satisfaction IS NOT NULL AND (NEW.satisfaction < 1 OR NEW.satisfaction > 5) THEN
    RAISE EXCEPTION 'satisfaction must be between 1 and 5';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_followup_survey
  BEFORE INSERT OR UPDATE ON public.rma_followup_surveys
  FOR EACH ROW EXECUTE FUNCTION public.validate_followup_survey();

CREATE INDEX idx_rma_followup_surveys_token ON public.rma_followup_surveys (token);
CREATE INDEX idx_rma_followup_surveys_rma_id ON public.rma_followup_surveys (rma_id);

ALTER TABLE public.rma_followup_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view followup surveys"
  ON public.rma_followup_surveys FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete followup surveys"
  ON public.rma_followup_surveys FOR DELETE USING (public.is_admin(auth.uid()));
CREATE POLICY "Service role full access to followup surveys"
  ON public.rma_followup_surveys FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
```

> RLS 設計：前端**不直接寫**這張表,所有寫入由 service-role 邊緣函式處理;管理員可查詢結果做統計。Token 由資料庫產生(24-byte URL-safe base64),不可預測。

---

## E：三支 Edge Functions

### E-1 `draft-follow-up-email`（admin auth, JWT）

**用途**：依 `template_key` (`standard` / `survey`) 用 Lovable AI Gateway (gemini-2.5-flash) 產生 `{ subject, body }`。
**關鍵點**：
- `survey` 模板強制保留 `{{survey_url}}` 佔位符（若 AI 漏寫會自動補上）
- 用 `response_format: json_object` 取得結構化輸出
- 處理 429 / 402 並回傳對應 status code

### E-2 `create-follow-up-survey`（admin JWT **或** service-role bearer）

**用途**：對指定 `rma_id` 建立(或重用尚未填寫的)問卷,回傳 `{ token, survey_url }`。
**關鍵點**：
- 同一 RMA 若已有未填寫的 token 就重用,避免重複建立
- 接受 service-role 是為了讓 `notify-follow-up-due` cron 也能呼叫
- `SITE_URL` 從環境變數讀,預設 `https://rma-helper-hub.lovable.app`

### E-3 `submit-follow-up-survey`（**公開**,只認 token）

**用途**：客戶問卷頁送出。`config.toml` 設 `verify_jwt = false`。
**關鍵點**：
- 支援 `GET ?token=xxx`：給問卷頁用來判斷是否已填過 + 顯示 RMA 編號/型號
- `POST { token, satisfaction, comments }`：驗 token 存在 + 未填過(409 已填過)
- `satisfaction` 強制 1–5 整數
- `comments` 截斷到 2000 字

### `supabase/config.toml` 新增

```toml
[functions.draft-follow-up-email]
verify_jwt = true

[functions.create-follow-up-survey]
verify_jwt = true

[functions.submit-follow-up-survey]
verify_jwt = false
```

---

## A：`FollowUpTab.tsx`（新分頁）

修改 `src/pages/AdminLogistics.tsx`：把 `followup` tab 的 `disabled: true` 拿掉,接上 `<FollowUpTab />`。

新檔 `src/components/logistics/FollowUpTab.tsx`：
- 撈所有 `status = 'follow_up'` 的 RMA(不過濾到期),left join `rma_followup_surveys` 看是否有最新一筆 `submitted_at`
- 表格欄位：RMA 編號 / 客戶 / 型號 / 關懷到期日 / **倒數/逾期 badge**（沿用 `ClosingTab` 的紅/橘/灰三色） / **問卷狀態**（未填 / ★ X / 已填 X 天前） / 動作
- 動作按鈕：`[發送關懷信]`(開 Dialog) / `[標記已關懷 → 結案]`(呼叫 `update-rma-status` 直接結案)
- 搜尋框、空狀態提示「目前沒有待關懷的案件」

---

## B：`FollowUpEmailDialog.tsx`（新檔）

UI 流程：
1. **頂部摘要**：客戶 / 型號 / RMA 編號 / 關懷到期日
2. **範本 Select**：`標準關懷` / `滿意度問卷`
3. **`[AI 生成草稿]`** 按鈕 → 呼叫 `draft-follow-up-email`,填入下方 subject + body（loading 狀態, 失敗 toast）
4. **Subject input + Body textarea**(可手動修改,也可從零自寫)
5. **Survey 模板專屬**：當 body 含 `{{survey_url}}` 時顯示提示「送出時會自動建立並替換問卷連結」
6. **`[寄出關懷信]`**：
   - 若是 survey 模板：先呼叫 `create-follow-up-survey` 取 `survey_url` → `body.replaceAll('{{survey_url}}', survey_url)`
   - 呼叫**新增的** `send-follow-up-email` 邊緣函式(管理員 JWT,內部用 service-role 呼叫 `send-transactional-email`)
   - 成功後寫一筆 `rma_customer_contacts` (`contact_method: 'follow_up_email'`) → toast「關懷信已送出」→ 關閉 → `fetchRmas()`

> **為何要新增第四支 `send-follow-up-email`?**
> `send-transactional-email` 要求 service-role bearer,前端拿不到;`send-customer-email-reply` 強綁 Gmail 訊息 ID(我們沒有);所以需要一個薄的 admin-auth wrapper,沿用 `customer-email-reply` 模板(複用既有 React Email 樣式,無附件)。

### `send-follow-up-email`（admin JWT,薄 wrapper）

```ts
// 檢查 admin → 內部用 service-role 呼叫 send-transactional-email
//   templateName: "customer-email-reply"
//   templateData: { subject, customerName, rmaNumber, replyBody: body, attachments: [] }
//   idempotencyKey: `follow-up-${rma_id}-${Date.now()}`
// 成功後 insert rma_customer_contacts
```

`config.toml` 加 `[functions.send-follow-up-email] verify_jwt = true`。

---

## C：公開問卷頁 `/follow-up-survey/:token`

`src/App.tsx` 新增路由(放在 `<ProtectedRoute>` 外):

```tsx
<Route path="/follow-up-survey/:token" element={<FollowUpSurveyPage />} />
```

新檔 `src/pages/FollowUpSurveyPage.tsx`：
- 掛載時 `GET submit-follow-up-survey?token=xxx` → 顯示載入/已填過/可填寫三狀態
- 表單：
  - **滿意度**：5 顆星按鈕橫排(預設 4 星,點擊切換),手機自動縮小
  - **意見**：textarea(選填,max 2000 字)
  - **送出**：`POST submit-follow-up-survey { token, satisfaction, comments }`
- 送出成功 → 切到「感謝您的回饋 🙏」感謝畫面
- 樣式：CREST 品牌色（`#3B82F6` primary）、白卡片、簡潔置中、無需登入、響應式

---

## F：Slack 通知加問卷連結

修改 `supabase/functions/notify-follow-up-due/index.ts`：

```ts
// 在組 lines 之前,逐一呼叫 create-follow-up-survey 取得 survey_url
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://rma-helper-hub.lovable.app";
const linesPromises = due.slice(0, 20).map(async (r) => {
  const days = Math.floor((Date.now() - new Date(r.follow_up_due_at!).getTime()) / 86400000);
  const overdueText = days >= 0 ? `逾期 ${days} 天` : `${-days} 天後到期`;
  let surveyLink = "";
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/create-follow-up-survey`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ rma_id: r.id }),
    });
    if (res.ok) {
      const { survey_url } = await res.json();
      surveyLink = `\n  → <${survey_url}|問卷連結>`;
    }
  } catch (e) {
    console.error("create survey failed:", r.rma_number, e);
  }
  return `• \`${r.rma_number}\` — ${r.customer_name} (${r.product_model ?? "—"}) · ${overdueText}${surveyLink}`;
});
const lines = await Promise.all(linesPromises);
```

> Slack 維持**只通知**(無互動按鈕),純多一行可點的問卷連結。`SITE_URL` 沒設就只顯示文字。

---

## 不做的事

- ❌ Slack 互動按鈕(你說純通知)
- ❌ 改 `ClosingTab` 的 checkbox 流程
- ❌ AI 草稿吃 `rma_thread_messages` 做個人化(第二波再做)
- ❌ 問卷統計 dashboard(資料先存進來,以後做)

---

## 驗證

1. `npm run test:run` 全綠（不加新測試,純基礎設施）
2. 手動 E2E：
   1. 把一筆 RMA 標成 `follow_up` → 「客戶關懷」分頁出現
   2. 開 Dialog → 選 `滿意度問卷` → 按 AI 草稿 → 寄出
   3. 收件信箱應收到信,點問卷連結 → 5 顆星 + 留言 → 送出 → 顯示感謝頁
   4. 回後台「客戶關懷」分頁,該筆問卷狀態變「★ 5」
   5. 手動觸發 `notify-follow-up-due` → Slack 訊息每行多一個問卷連結
3. 重新點同個 token → 顯示「已填過」

---

## 風險

| 風險 | 緩解 |
|---|---|
| AI 失敗 | Body 預設可空,失敗 toast「請手動撰寫」,不卡流程 |
| Token 二次提交 | DB `submitted_at` 欄位 + 409 阻擋 |
| 寄送失敗 | 沿用 `send-transactional-email` 既有錯誤處理,不重新發明輪子 |
| Migration 與 Edge Function 屬 Lovable 主導區 | 完成後標注「請 Lovable review 部署狀態」(符合 CLAUDE.md) |

---

## 檔案清單

**新增 (10)**
- `supabase/migrations/20260502175028_rma_followup_surveys.sql`
- `supabase/functions/draft-follow-up-email/index.ts`
- `supabase/functions/create-follow-up-survey/index.ts`
- `supabase/functions/submit-follow-up-survey/index.ts`
- `supabase/functions/send-follow-up-email/index.ts`
- `src/components/logistics/FollowUpTab.tsx`
- `src/components/logistics/FollowUpEmailDialog.tsx`
- `src/pages/FollowUpSurveyPage.tsx`

**修改 (3)**
- `supabase/config.toml`(加 4 個函式 entry)
- `src/pages/AdminLogistics.tsx`(啟用 followup tab)
- `src/App.tsx`(加公開路由)
- `supabase/functions/notify-follow-up-due/index.ts`(每行加問卷連結)

---

回 **「Approve / 開工」** 我就切回 default mode 一次落地以上全部。

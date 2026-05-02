# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚫 Claude Code 禁區（絕對不要修改）

| 檔案 | 原因 |
|------|------|
| `src/integrations/supabase/types.ts` | Supabase CLI 自動產生，改了會被覆蓋 |
| `src/integrations/supabase/client.ts` | Lovable 自動管理 |
| `supabase/config.toml` | 改 project_id 會導致部署失敗 |
| `.env` | Lovable Cloud 自動管理 |
| `supabase/migrations/*.sql`（已執行的）| Migration 不可逆，新增欄位請建新 migration |
| Edge Functions（`supabase/functions/`）| Lovable 負責，有自動部署流程；Claude 若要 patch 請在 Lovable push 後再改 |
| DB schema / RLS policy | Lovable 有 migration 審核流程，Claude 改 SQL 容易漏 RLS |

---

## 分工原則（Lovable vs Claude Code）

| 類型 | 負責方 | 原因 |
|------|--------|------|
| UI / shadcn 元件 / Tailwind 樣式 | **Lovable** | 即時預覽、視覺回饋快 |
| 新頁面、表單、Dialog | **Lovable** | 同上 |
| Edge Functions（Deno）| **Lovable** | 有自動部署，Claude 改完還需手動部署 |
| DB migration / RLS policy | **Lovable** | 有 migration 審核流程 |
| 純函式邏輯（csvParser、validator）| **Claude Code** | 最需要單元測試，Claude 寫測試比較細 |
| Vitest 測試補強 | **Claude Code** | Lovable 預設不主動寫測試 |
| 文件（README、CLAUDE.md、PR 說明）| **Claude Code** | 不影響 runtime，零風險 |
| 跨檔案重構 / 抽 hook / 命名統一 | **Claude Code** | 適合 review-driven 流程 |
| Bug 修復 | 看狀況 | UI bug → Lovable；邏輯 bug → 誰先看到誰修 |

---

## Lovable ↔ Claude Code 協作流程

### Claude Code 開始工作前（必做）
```bash
git checkout main
git pull --rebase origin main
```

### 衝突時的優先權
- **UI / 元件 / 樣式檔**：保留 Lovable 版本，Claude 的改動丟棄或重做
- **測試檔 / 文件 / 純邏輯模組**：保留 Claude 版本（Lovable 通常不動這些）
- **Edge Functions**：以 Lovable 版本為主，Claude 在其上 patch

### 「Lovable 工作中」暫停規則
Lovable 做大改動期間，Claude Code 暫停開 PR。等 Lovable push 完畢、執行 `git pull --rebase` 後再繼續。同時有多個 PR 開著容易產生 merge conflict。

---

## What this project is

A **Return Merchandise Authorization (RMA) warranty management system** for CREST diving computers. Customers submit products for repair, track status, and communicate with support. Admins manage the entire repair lifecycle with AI-assisted email drafting and a RAG-based knowledge base.

## Commands

```bash
npm run dev          # Start dev server on port 8080
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest watch mode
npm run test:run     # Vitest single run (CI)
npm run test:ui      # Vitest browser UI
```

Run a single test file:
```bash
npx vitest run src/lib/csvParser.test.ts
```

## Architecture

### Frontend → Backend boundary

The frontend **never writes to the database directly**. All mutations go through Supabase Edge Functions (Deno), which use the `SUPABASE_SERVICE_ROLE_KEY` to bypass Row-Level Security. Direct Supabase client calls from the frontend are read-only queries with RLS applied.

### Edge Functions (`supabase/functions/`)

35 Deno functions, each in its own directory with `index.ts`. Grouped by concern:

| Group | Functions |
|---|---|
| RMA lifecycle | `submit-rma`, `update-rma-status`, `lookup-rma`, `import-rma-csv` |
| Shipping | `submit-shipping`, `submit-outbound-shipping`, `send-shipping-reminders` |
| Email send | `send-transactional-email`, `send-rma-reply`, `send-customer-email-reply` |
| Email receive | `gmail-get-message`, `gmail-list-messages`, `gmail-modify-message` |
| Email queue | `process-email-queue` (cron-driven batch sender) |
| AI | `rma-ai-analysis`, `draft-email-reply`, `email-knowledge-chat` |
| Embeddings | `generate-rma-embeddings`, `generate-email-embeddings`, `kickoff-email-embedding-job` |
| Knowledge base | `upload-knowledge-file`, `generate-knowledge-question` |
| Auth/Admin | `list-admins`, `reset-admin-password`, `log-login`, `update-ai-settings` |
| Customer-facing | `submit-customer-reply`, `lookup-rma-reply-thread`, `handle-email-unsubscribe`, `handle-email-suppression` |
| Housekeeping | `cleanup-rma-attachments`, `slack-notify`, `preview-transactional-email` |

`send-transactional-email` is the central email sender — it renders React Email templates (in `supabase/functions/_shared/transactional-email-templates/`) and queues via `email_send_log`.

### Authentication & roles

`useAuth` (`src/hooks/useAuth.tsx`) wraps Supabase Auth and checks `user_roles` table on every sign-in. Two roles exist: `admin` and `super_admin`. `ProtectedRoute` uses `requireAdmin` prop to guard `/admin/*` routes. Role check is deferred with `setTimeout(0)` to avoid a Supabase auth listener deadlock.

### State management

- **Server state**: TanStack React Query (all Supabase reads)
- **Auth state**: React Context via `AuthProvider` / `useAuth`
- **Form state**: local `useState` (no form library on most pages; `react-hook-form` only in a few admin components)

### Key data flow: RMA submission

```
RmaForm (frontend)
  → supabase.functions.invoke("submit-rma")
    → inserts into rma_requests (service role, bypasses RLS)
    → calls send-transactional-email (non-blocking, fire-and-forget)
    → calls slack-notify (non-blocking)
  → navigates to /rma-confirmation
```

### Email system

Outbound emails go through a queue: `send-transactional-email` writes to `email_send_log` with `status = 'pending'`. A cron job (`process-email-queue`) batches and sends them. Rate limiting and retry are configured in `email_send_state`. Sender domain is `notify.crestdiving.com` — this is baked into `send-transactional-email/index.ts` and must match Lovable's DNS delegation.

### AI / Embeddings

- RMA records and email knowledge sources are vectorized via `pgvector` embeddings stored in `rma_embeddings` and `email_embeddings`.
- `email-knowledge-chat` does RAG: semantic search over embeddings → feeds results to Claude API → returns drafted reply.
- AI model settings (provider, temperature, max tokens) are stored in `ai_settings` table and editable from `/admin/settings`.

### CSV import

`src/lib/csvParser.ts` — parses a 51-column CSV format with Chinese column headers. `src/lib/rmaMultiCsvParser.ts` — simpler parser for multi-product batch submission. Both are pure functions with no side effects.

### Serial number validation

`src/lib/serialNumberValidator.ts` — detects inputs that are **not** product serial numbers: EN13319 (EU diving standard) and NCC approval codes (CCA prefix). Called on blur in `RmaForm` and before multi-product submission.

### Warranty policy (`src/lib/warrantyPolicy.ts`)

Pure functions implementing the [2025/11/12 CREST policy](https://crestdiving.com/blogs/crest-news/crest-warranty-repair-policy-update). Three production batches:

| Batch | Production dates | Warranty |
|---|---|---|
| `legacy_2018_2022` | Jan 2018 – Oct 2022 | None (special exchange only) |
| `v2_2022_2025` | Nov 2022 – Nov 11 2025 | 2 years |
| `v3_2025_onwards` | Nov 12 2025+ | 1 year |

Key functions:
- `parseSerialNumber(serial, model)` — extracts year/week from serial number using model-specific byte offsets (CR-4/CR-1: pos 4-5/6-7; CR-5L/CR-F: pos 5-6/7-8)
- `detectBatch(productionDate)` — maps a date to the three batch constants
- `calcWarrantyExpiry(batch, productionDate)` — returns expiry date (null for legacy)
- `evaluateWarranty({ serialNumber, productModel, warrantyDate, manualBatchOverride, manualWarrantyOverride })` — full decision object; priority: serial → manualBatchOverride → warrantyDate fallback

**Testing note**: When writing fixture data for "in-warranty" scenarios, use `serial_number: null` so `evaluateWarranty` falls back to `warranty_date`. If you use a real-looking serial like `"SN12345"`, the parser may decode a production date and override the `warranty_date` field.

### Refurbished pricing (`src/lib/refurbishedPricing.ts`)

- `REFURB_PRICES` — A/B/C tier prices for CR-4 and CR-5L (add new models here)
- `getRefurbPrices(model)` — fuzzy match (case-insensitive, ignores hyphens/spaces); returns `{A:0,B:0,C:0}` for unknown models
- `formatNT(amount)` — formats to `"NT$ X,XXX"` Taiwan locale
- `buildDiagnosisNotificationBody({productModel, serialNumber, withinWarranty, diagnosis})` — warranty-aware email template
- `ACTUAL_METHOD_LABELS` / `ActualMethod` type — `warranty_replace | purchase_a | purchase_b | purchase_c | return_original`

### Status map (`src/lib/rmaStatusMap.ts`)

Read-only reference module mapping every `RmaStatus` string to its Chinese label and which logistics tab / dashboard bucket it appears in. Used by `StatusMapDialog.tsx` for admin reference. **Not authoritative** — each tab's actual query is the source of truth.

### Email template labels (`src/lib/emailTemplateLabels.ts`)

`EMAIL_TEMPLATE_LABELS` — maps template technical names to Chinese display names. Add new templates here when creating them.

### Shopify integration (`src/components/rma/ShopifyOrdersCard.tsx`)

Calls the `shopify-find-orders-by-email` Edge Function to look up purchase history by customer email. Displayed in the RMA detail dialog to help admins verify purchase dates for warranty calculation.

## Testing

Tests use **Vitest + React Testing Library + MSW**. MSW is configured in Node mode (`msw/node`) via `src/mocks/server.ts`, started in `src/test-setup.ts`.

**Important quirks discovered during test authoring:**
- Use `fireEvent.submit(form)` (not `userEvent.click(submitButton)`) to test JS validation logic — jsdom enforces HTML `required` attributes and blocks `onSubmit` when clicking a submit button with unfilled required fields.
- The agreement "checkbox" in `RmaForm` is a `<div onClick>`, not a real `<input>`. To toggle it in tests: find the label via `screen.getByText("服務條款").closest("label")`, then click `label.querySelector("div")`. (The terms text is split across `<Link>` elements so `getByText("我同意服務條款和隱私政策 *")` no longer works.)
- `MultiProductForm` uses the same placeholder strings as `RmaForm` single mode (e.g. `"請輸入產品序號"`, `"請詳細描述問題..."`), so these cannot distinguish modes. Use `"故障問題 *"` (with asterisk, single mode only) or `screen.getByRole("option", { name: "選擇故障問題" })` (native `<option>`, absent in multi mode which uses Radix UI Select).
- `toHaveValue(expect.stringContaining(...))` does NOT work — jest-dom's `toHaveValue` doesn't accept asymmetric matchers. Use `(element as HTMLTextAreaElement).value.toContain(...)` instead.
- When testing warranty-aware components (`ReceivingTab`, `AwaitingConfirmationTab`), use `serial_number: null` in "in-warranty" fixtures. Otherwise `evaluateWarranty` may parse the serial number, compute a past expiry, and override `warranty_date`.

Add MSW handlers for new Edge Functions in `src/mocks/handlers.ts`. Use `server.use(overrideHandler)` inside individual tests to test error scenarios — MSW resets handlers after each test automatically.

## Supabase types

`src/integrations/supabase/types.ts` is **auto-generated** by Supabase CLI. Do not edit manually. Regenerate with:
```bash
npx supabase gen types typescript --project-id xrbvyfoewbwywrwocrpf > src/integrations/supabase/types.ts
```

## Edge Function count

36 Deno functions (added `shopify-find-orders-by-email` for Shopify order lookup by customer email).

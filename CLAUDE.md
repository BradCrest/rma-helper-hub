# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Testing

Tests use **Vitest + React Testing Library + MSW**. MSW is configured in Node mode (`msw/node`) via `src/mocks/server.ts`, started in `src/test-setup.ts`.

**Important quirks discovered during test authoring:**
- Use `fireEvent.submit(form)` (not `userEvent.click(submitButton)`) to test JS validation logic — jsdom enforces HTML `required` attributes and blocks `onSubmit` when clicking a submit button with unfilled required fields.
- The agreement "checkbox" in `RmaForm` is a `<div onClick>`, not a real `<input>`. To toggle it in tests: `label.querySelector('div')` then `fireEvent.click(div)`.
- `MultiProductForm` uses the same placeholder strings as `RmaForm` single mode (e.g. `"請輸入產品序號"`, `"請詳細描述問題..."`), so these cannot distinguish modes. Use `"故障問題 *"` (with asterisk, single mode only) or `screen.getByRole("option", { name: "選擇故障問題" })` (native `<option>`, absent in multi mode which uses Radix UI Select).

Add MSW handlers for new Edge Functions in `src/mocks/handlers.ts`. Use `server.use(overrideHandler)` inside individual tests to test error scenarios — MSW resets handlers after each test automatically.

## Supabase types

`src/integrations/supabase/types.ts` is **auto-generated** by Supabase CLI. Do not edit manually. Regenerate with:
```bash
npx supabase gen types typescript --project-id xrbvyfoewbwywrwocrpf > src/integrations/supabase/types.ts
```

## In-progress feature (from `.lovable/plan.md`)

The `send-customer-email-reply` Edge Function and `CustomerEmailTab.tsx` send section are being built to allow admins to reply directly to customer emails (not just RMA threads) with attachments. Storage path: `rma-attachments/email-replies/{gmailMessageId}/`. No new DB tables — reuses `send-transactional-email` with the `customer-email-reply` template.

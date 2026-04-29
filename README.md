# RMA Helper Hub

CREST 潛水電腦的保固維修管理系統（RMA）。涵蓋客戶申請、物流追蹤、維修管理，以及 AI 輔助客服回覆的完整流程。

## 使用者角色

| 角色 | 入口 | 功能 |
|------|------|------|
| 一般客戶 | `/` | 提交 RMA 申請、追蹤狀態、回覆客服 |
| 授權經銷商 | `/` | CSV 批量提交多筆 RMA |
| 管理人員 | `/admin` | 管理 RMA、物流、客服信件、知識庫 |
| 超級管理員 | `/admin/settings` | 帳號管理、AI 設定、系統設定 |

## 技術棧

- **前端**：React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **後端**：Supabase（PostgreSQL + Auth + Edge Functions / Deno）
- **AI**：Claude API（RAG 回覆草稿、分析報告）
- **Email**：Transactional email queue + Gmail API 整合

## 本地開發

### 前置需求

- Node.js 18+
- npm

### 環境設定

1. Clone 專案：
   ```bash
   git clone https://github.com/BradCrest/rma-helper-hub.git
   cd rma-helper-hub
   ```

2. 安裝依賴：
   ```bash
   npm install
   ```

3. 建立 `.env` 檔案（參考 `.env.example`）：
   ```env
   VITE_SUPABASE_URL=https://<project-id>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
   VITE_SUPABASE_PROJECT_ID=<project-id>
   ```

4. 啟動開發伺服器：
   ```bash
   npm run dev
   # 開啟 http://localhost:8080
   ```

## 常用指令

```bash
npm run dev          # 開發伺服器（port 8080）
npm run build        # 正式版 build
npm run lint         # ESLint 檢查
npm run test         # 執行測試（watch 模式）
npm run test:run     # 執行測試（單次，CI 用）
npm run test:ui      # 測試 UI 介面（瀏覽器）
```

## 專案結構

```
├── src/
│   ├── components/
│   │   ├── admin/       # 管理後台元件（AI 草稿、知識庫、設定）
│   │   ├── logistics/   # 物流工作流元件（RMA 回覆、客戶信件、收件）
│   │   ├── rma/         # RMA 申請表單相關元件
│   │   └── ui/          # shadcn/ui 基礎元件
│   ├── hooks/
│   │   └── useAuth.tsx  # 認證 Context（角色：admin / super_admin）
│   ├── integrations/supabase/
│   │   ├── client.ts    # Supabase client singleton
│   │   └── types.ts     # 自動產生的 DB 型別（勿手動編輯）
│   ├── lib/
│   │   ├── csvParser.ts              # 51 欄位 CSV 解析器
│   │   ├── rmaMultiCsvParser.ts      # 多產品批量 CSV 解析器
│   │   └── serialNumberValidator.ts  # 序號驗證（過濾 EN13319 / CCA）
│   ├── mocks/
│   │   ├── handlers.ts  # MSW request handlers（測試用）
│   │   └── server.ts    # MSW Node server（測試用）
│   └── pages/           # 各路由頁面
├── supabase/
│   ├── functions/       # 35 個 Deno Edge Functions
│   └── migrations/      # PostgreSQL schema 遷移檔案
└── CLAUDE.md            # AI 協作說明（Claude Code 自動讀取）
```

## 路由總覽

| 路徑 | 說明 | 是否需登入 |
|------|------|-----------|
| `/` | RMA 申請表單 | 否 |
| `/track` | 狀態查詢 | 否 |
| `/shipping` | 寄件確認 | 否 |
| `/rma-reply/:token` | 客戶回覆（token 驗證）| 否 |
| `/unsubscribe` | 取消訂閱 | 否 |
| `/admin` | 管理員登入 | 否 |
| `/admin/dashboard` | 管理儀表板 | ✅ admin |
| `/admin/rma-list` | RMA 列表管理 | ✅ admin |
| `/admin/logistics` | 物流工作流 | ✅ admin |
| `/admin/email-knowledge` | AI 知識庫 | ✅ admin |
| `/admin/csv-import` | 批量匯入 | ✅ admin |
| `/admin/settings` | 系統設定 | ✅ admin |

## 測試

測試使用 **Vitest + React Testing Library + MSW**，不需要真實 Supabase 環境。MSW 在 Node 層攔截所有 HTTP 請求並回傳假資料。

```bash
npm run test:run   # 執行全部測試
```

詳細說明請見 `CLAUDE.md` 的 Testing 章節。

## 部署

此專案透過 [Lovable](https://lovable.dev) 部署。推送到 `main` 分支後會自動觸發部署。

Edge Functions 透過 Supabase Dashboard 或 Supabase CLI 部署：
```bash
npx supabase functions deploy <function-name>
```

# 系統簡介

CREST RMA 管理系統是專為 CREST 潛水電腦錶設計的保固維修管理平台，涵蓋客戶申請、維修追蹤、Email 溝通、供應商送修、整新品庫存等完整流程。

## 系統架構一覽

```
客戶端（公開頁面）
  ├── 申請 RMA → /（申請表單）
  ├── 查詢狀態 → /track
  ├── 填寫寄件資訊 → /shipping-form
  └── 客戶 Email 回覆 → /rma-reply/:token

管理後台（需登入）
  ├── /admin/dashboard     → 總覽 Dashboard
  ├── /admin/rma-list      → RMA 工單列表
  ├── /admin/logistics     → 物流作業（多 Tab）
  ├── /admin/email-knowledge → AI 知識庫
  ├── /admin/csv-import    → CSV 批次匯入
  └── /admin/settings      → 系統設定
```

## 主要功能模組

### 📋 RMA 工單管理
- 客戶線上申請（含照片上傳）
- 管理後台全列表搜尋、篩選、分類
- 自動產生 `RMA-YYYYMMDD-NNN` 格式工單號

### 📧 Email 通訊
- 管理員對客戶的 RMA 專屬回覆（thread 模式）
- Gmail 整合收件匣（處理一般來信）
- AI 自動起草回覆（RAG 語意搜尋知識庫）
- 自動化 Email 佇列（批次寄送，防重複）

### 🚚 物流追蹤
- 客戶寄件資訊收集（inbound tracking）
- 收件確認與入庫記錄
- 客戶聯繫紀錄追蹤
- 後續關懷排程與調查問卷

### 🔧 供應商送修
- 送修批次出貨管理（創葆 / 正能量）
- 各台機器狀態追蹤（送出 → 維修中 → 完工 → 驗收）
- 預估費用 vs 實際發票金額
- 整新品庫存管理（A/B/C 等級）

### 🤖 AI 功能
- 知識庫文件管理（FAQ、範本、Email 歷史）
- RAG（Retrieval-Augmented Generation）草稿生成
- RMA 資料分析報告

### 🛡️ 保固判斷引擎
依據序號、型號、購買日期，自動判斷保固批次（2018–2022 特例 / 2022–2025 兩年保固 / 2025 後一年保固）。

## 技術架構（給進階管理員）

- **前端**：React 18 + TypeScript + Tailwind CSS，部署於 Lovable Cloud
- **後端**：Supabase（PostgreSQL + Edge Functions on Deno）
- **Email**：透過佇列機制發送，Sender Domain = `notify.crestdiving.com`
- **AI**：Anthropic Claude API（可在設定頁調整 model / temperature）
- **Embeddings**：OpenAI text-embedding-3-small + pgvector

> **重要**：前端不直接寫入資料庫。所有新增/修改/刪除操作都透過 Edge Functions 執行，由系統以 `service_role` 金鑰繞過 RLS（Row-Level Security）。

## 瀏覽器需求

建議使用 **Google Chrome 或 Microsoft Edge** 最新版本。  
系統使用 Gmail API 整合，部分功能需要登入 Google 帳號授權。

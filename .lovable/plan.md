# 知識庫匯出功能

## 目標
在 `/admin/email-knowledge` 頁面右上角新增「📥 匯出知識庫」下拉按鈕，讓管理員可以隨時把整個 RAG 知識庫下載成檔案，方便備份、檢視或日後重新匯入。

## 功能設計

### 按鈕位置
放在頁面標題列「📧 客戶往來知識庫」旁邊，與「首頁」「登出」同一排。使用下拉選單（DropdownMenu）展開三個選項：
- 匯出為 JSON（含完整 metadata，可重新匯入）
- 匯出為 CSV（Excel 可直接開啟）
- 匯出為 Markdown（每筆一個區塊，方便閱讀）

### 匯出範圍
從 `email_knowledge_sources` 撈取**全部**知識來源（不受目前篩選影響），會尊重目前篩選器：
- 若使用者已套用「類型」或「標籤」篩選，按鈕旁顯示「目前篩選：XXX（N 筆）」並提供「匯出全部」與「匯出篩選結果」兩個選項
- 預設匯出全部

### 各格式內容

**JSON**（`knowledge-base-YYYYMMDD-HHmm.json`）
```json
{
  "exported_at": "2026-04-28T...",
  "total": 123,
  "sources": [
    {
      "id": "...",
      "source_type": "faq",
      "title": "...",
      "content": "...",
      "metadata": { "language": "zh-TW", "tag": "保固", "gmail_message_id": "...", ... },
      "file_name": "...",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

**CSV**（`knowledge-base-YYYYMMDD-HHmm.csv`）
欄位：`類型, 標題, 標籤, 語言, 內容, 檔案名稱, 建立時間, 更新時間`
- 內容欄位處理換行與引號跳脫
- 加 UTF-8 BOM 讓 Excel 正確顯示中文

**Markdown**（`knowledge-base-YYYYMMDD-HHmm.md`）
```markdown
# 客戶往來知識庫匯出
匯出時間：2026-04-28 ...
共 123 筆

---

## [FAQ] 標題
- 標籤：#保固
- 語言：zh-TW
- 更新：2026-04-20

內容...

---
```

## 技術實作

**檔案異動**：只動 `src/pages/AdminEmailKnowledge.tsx` 一個檔案，純前端實作，不需要新 Edge Function（管理員已有 RLS 讀取權限）。

**新增**：
- `handleExport(format: 'json' | 'csv' | 'md')` 函式
- 用 Blob + URL.createObjectURL 觸發瀏覽器下載
- 工具函式：`escapeCsvField()`、`formatAsMarkdown()`、`formatAsJson()`
- 引入 `lucide-react` 的 `Download` 與 `ChevronDown` icon
- 使用既有的 `DropdownMenu` UI 元件

**不需要**：
- 不需要資料庫 migration
- 不需要 Edge Function
- 不需要新 secrets
- 不需要打包 storage 原始檔（這次先不做，未來如要可加 ZIP 選項）

## 範圍限制
- 只匯出 `email_knowledge_sources` 內容（含 metadata）
- 不匯出向量資料（`email_embeddings`）— 對人類無意義，且檔案會非常大
- 不匯出原始上傳檔案（PDF/Word）— 之後若需要可再加「打包原始檔 ZIP」按鈕

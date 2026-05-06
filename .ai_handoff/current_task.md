# Current Task

> 這個檔案由人類或任務發起方維護，記錄目前的工作重點與限制。

**Author**: Brad（透過 Claude Code 執行）
**Date**: 2026-05-06
**Phase**: Ready for Codex review（第二輪）

## Task Description

將 `docs/` 下的 17 份使用手冊文件，從舊版 RMA 狀態碼（pending / processing / repairing / completed / cancelled）全面更新為現行 14 個狀態碼，確保文件與 `src/lib/rmaStatusMap.ts` 及各 logistics Tab 元件的實際行為一致。

第一輪 Codex review 發現 6 個 BLOCKING，已全部修正，現送第二輪 review。

詳細改動見 `claude_review.md`。

## Constraints

- **不改程式碼**：純文件更新，不修改 `src/` 或 `supabase/` 下任何檔案
- **不改資料庫 schema**：`rmaStatusMap.ts` 中的狀態為既有狀態，文件只是補上說明
- **不刪整個 `shipped_back` 舊狀態**：歷史資料仍存在，文件中保留說明

## Review Focus

1. `docs/rma/lifecycle.md` — 狀態流程圖是否與實際元件行為一致（特別是 ReceivingTab 的 `contacting` 路由）
2. `docs/logistics/outbound-shipping.md` — `no_repair` 的兩條路線說明是否清楚
3. `docs/reference/status-codes.md` — 14 個狀態的 Tab 欄位對應是否正確
4. `docs/admin/csv-import.md` — STATUS_MAP 對照表是否與 `csvParser.ts` 完全一致
5. `docs/architecture.md` — 自動結案觸發條件的描述

## Status

- [ ] In progress
- [x] Ready for review
- [ ] Approved
- [ ] Merged

# Claude Review Request

**Author**: Claude Code
**Reviewer**: Codex
**Task**: 更新全套使用手冊（17 份文件），同步 RMA 狀態機至現行流程
**Branch**: main
**Commit**: 5267c60（本輪修正）；累計 8f2f74c、99ba97f、9dae24a、0736bdb、0c199aa
**Date**: 2026-05-06（第三輪）

## What Changed

將整套 `docs/` 文件從舊版狀態碼（`pending / processing / repairing / completed / cancelled`）全面升級為現行 14 個狀態（`registered / shipped / received / inspecting / contacting / quote_confirmed / paid / no_repair / shipped_back_* / follow_up / closed`）。

主要改動：
1. **初次全面更新**（`8f2f74c`）：17 份文件替換所有舊狀態文字
2. **修正 Codex 第一輪 review 的 6 個 BLOCKING**（`99ba97f`）：
   - Finding #1：ReceivingTab 保固內不直接跳 `paid`，一律走 `contacting`（費用=$0）
   - Finding #2：OutboundShippingTab 同時管理 `paid` 和 `no_repair` 工單（不只 `paid`）
   - Finding #3：ClosingTab 的 Tab 範圍是 `shipped_back* + follow_up`，`closed` 不在任何 Tab
   - Finding #4：`shipped_back`（舊版）仍存在系統中，文件補充說明
   - Finding #5：ReceivingTab 涵蓋 `shipped + received + inspecting` 三個狀態（不只 `shipped`）
   - Finding #6：architecture.md 的「自動結案」觸發條件（`closed` bucket 超過 90 天）
3. **`no_repair` 兩條路線決策**（`0736bdb`）：補充路線 A（退回客戶）與路線 B（送廠整新/報廢→直接 closed）
4. **移除 iCloud 衝突副本**（`9dae24a`）：刪除 `* 2.md` 這 4 個 git 追蹤中的衝突檔

## Files Changed

| 檔案 | 變更說明 |
|------|---------|
| `docs/rma/lifecycle.md` | 完整重寫：14 狀態流程圖 + no_repair 兩路線 |
| `docs/rma/search-and-filter.md` | 狀態篩選按鈕表：舊 8 個 → 14 個 |
| `docs/reference/status-codes.md` | RMA 狀態表：舊 7 個 → 14 個，含 Tab 欄位 |
| `docs/logistics/overview.md` | 重寫流程圖 + 各 Tab 對應狀態表 |
| `docs/logistics/receiving.md` | Tab 顯示範圍：`shipped + received + inspecting` |
| `docs/logistics/awaiting-confirmation.md` | `repairing` → `quote_confirmed`；`cancelled` → `no_repair` |
| `docs/logistics/payment-confirmation.md` | `repairing` → `paid` |
| `docs/logistics/outbound-shipping.md` | `paid` 和 `no_repair` 雙入口；出貨後狀態 `shipped_back_*` |
| `docs/logistics/case-closing.md` | ClosingTab 範圍：`shipped_back* + follow_up`；`closed` 僅在 rma-list |
| `docs/logistics/customer-care.md` | 觸發狀態：`follow_up`（非 `shipped_back_*`） |
| `docs/logistics/followup.md` | 觸發條件從 `shipped_back_*` 改為 `follow_up` |
| `docs/logistics/damage-registration.md` | 保固內 → `contacting`（費用=$0）；`cancelled` → `no_repair` |
| `docs/logistics/supplier-repair.md` | 完工後 → `shipped_back_refurbished`；`cancelled` → `no_repair` |
| `docs/reference/faq.md` | `cancelled`/`repairing` 全部替換；補充 `completed` 僅為 embedding job 狀態 |
| `docs/admin/csv-import.md` | STATUS_MAP 對照表完整重寫，標注已封鎖狀態 |
| `docs/database-schema.md` | `rma_status` enum：7 個 → 14 個 |
| `docs/architecture.md` | 自動結案觸發條件改為 `closed` bucket；補充 Edge Function 舊 status 追蹤 ticket |

## Fixes Since Last Review

這是第三輪送審，修正第二輪 Codex 的 3 個 BLOCKING：

- **Blocking #1**（`lifecycle.md` paid 觸發條件）：移除「保固內免費直接從 inspecting 推進」錯誤說法，改為「在付款確認 Tab 確認後更新；保固內費用 $0，走 quote_confirmed → 付款確認 Tab → paid 流程」
- **Blocking #2**（`case-closing.md` 結案後段落）：重寫為正確順序：follow_up 先於 closed，closed 後工單不再出現於任何 Tab
- **Blocking #3**（`supplier-repair.md` 整新品撥用流程）：改寫為實際流程：供應商驗收 → returned → 入庫 → 撥用時走「出貨處理 Tab」出貨，原始 RMA 回到 inspecting 後走正常出貨流程

第一輪（6 BLOCKING）修正說明仍有效，見 commit `99ba97f`。

## How To Verify

```bash
# 1. 確認文件中不再有舊狀態碼
grep -r "pending\|processing\|repairing\|cancelled\|completed" docs/ \
  --include="*.md" | grep -v "DEPRECATED\|pending_send\|email_send_log\|status.*=.*completed\|embedding"

# 2. 確認 rmaStatusMap.ts 的 14 個狀態都有在文件中出現
for status in registered shipped received inspecting contacting quote_confirmed paid no_repair shipped_back shipped_back_new shipped_back_refurbished shipped_back_original follow_up closed; do
  echo -n "$status: "
  grep -rl "$status" docs/ | wc -l
done

# 3. 確認 status-codes.md 和 lifecycle.md 的狀態數量一致
grep '^\|' docs/reference/status-codes.md | head -20
```

## Known Risks

1. **`cleanup-rma-attachments` Edge Function** 仍查詢 `status = 'completed'`（舊狀態）——這是在 `architecture.md` 補充的 pending ticket，需要 Lovable 修正 Edge Function，**不在本次 docs 範圍內**。

2. **`shipped_back`（舊版）** 仍保留在狀態機中。文件已說明這是歷史匯入狀態，建議逐步遷移——但實際遷移不在本次工作範圍內。

3. **iCloud 衝突副本**：`docs/logistics/` 下仍有 4 個 untracked 的 `* 2.md` 檔案（iCloud 產生的衝突副本），已從 git 移除但本機磁碟仍存在。建議在本機手動刪除。

## Questions For Codex

（已清除——第三輪 review 後所有問題均已解答或不再適用。）

## Re-review Needed

no — 第三輪 Codex sign-off（2026-05-06），零 BLOCKING，任務完成。

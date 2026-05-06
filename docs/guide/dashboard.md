# Dashboard 總覽

登入後第一個看到的是 **Dashboard**（`/admin/dashboard`）。

![Dashboard 主控台上半](/screenshots/dashboard-top.jpg)

![Dashboard 主控台下半（RAG、AI 分析）](/screenshots/dashboard-bottom.jpg)

## 數字卡片區

畫面頂部排列數個統計卡片，即時反映系統現況：

| 卡片 | 說明 |
|------|------|
| 待處理 | `registered` 狀態的 RMA 數量，需要最優先關注 |
| 處理中 | 物流進行中的工單數量（`shipped` / `received` / `inspecting` / `contacting` / `quote_confirmed` / `paid`）|
| 已完成 | 已寄回或結案的工單數量（`shipped_back` / `shipped_back_*` / `follow_up` / `closed`）|
| 本月新增 | 當月新申請的 RMA 總數 |
| 逾期未處理 | 超過指定天數仍未完成的工單（需定期清零）|

> 點擊任一卡片可快速跳轉到 RMA 列表並套用對應的狀態篩選。

## 最近活動

Dashboard 下方列出最近更新的 RMA 工單，顯示：
- RMA 號碼
- 客戶名稱
- 產品型號 / 序號
- 目前狀態（帶顏色 Badge）
- 最後更新時間

## 快捷入口

| 按鈕 | 功能 |
|------|------|
| 新增 RMA | 開啟申請表單（供管理員代填）|
| 前往 RMA 列表 | 跳轉到完整的 `/admin/rma-list` |
| 前往物流作業 | 跳轉到 `/admin/logistics` |

## AI 分析報告

Dashboard 右側（或下方，依螢幕寬度）有一個 **AI 分析**區塊。  
選擇時間範圍後，點擊「產生報告」，系統會：
1. 查詢指定區間的 RMA 資料與統計
2. 將資料傳送給 Claude AI 分析
3. 以 Markdown 格式呈現趨勢分析、常見問題、建議事項

> AI 分析報告約需 10~30 秒，請耐心等待。費用依 AI 設定中的 token 上限計算。

## 上方導覽列

| 項目 | 路徑 |
|------|------|
| Dashboard | `/admin/dashboard` |
| RMA 列表 | `/admin/rma-list` |
| 物流作業 | `/admin/logistics` |
| Email 知識庫 | `/admin/email-knowledge` |
| CSV 匯入 | `/admin/csv-import` |
| 設定 | `/admin/settings` |

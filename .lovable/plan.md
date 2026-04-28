# 修正 Email 按鈕無法觸發「新增寄件資訊」彈窗的問題

## 問題診斷

URL `?rma=...&autoopen=1` 是正確的，`/shipping` 頁面也有 `useEffect` 處理。但目前邏輯中：

```ts
setShowModal(true);
performSearch(rmaParam);          // 立即執行
setSearchParams(next, ...);       // 同步馬上清除參數
```

三個 state 變更**在同一個 tick 內**發生，導致：
1. `setSearchParams` 觸發路由重新 render，可能在 modal 完成 mount 前就把 URL 清掉
2. 在 React StrictMode 下 effect 會跑兩次，第二次 `searchParams` 已空 → 看起來沒作用
3. `performSearch` 在 modal 還沒掛載時就跑，搜尋結果可能沒 reflect 到 modal 的 `step` 狀態上

## 修正方案

修改 `src/pages/Shipping.tsx` 的 `useEffect` (line 98-115)：

1. **先 setShowModal(true)** 開啟彈窗
2. **延遲 50ms 後** 再呼叫 `performSearch(rmaParam)` — 確保 modal DOM 已掛載
3. **延遲 400ms 後** 才清除 URL 參數 — 不干擾 modal 開啟與搜尋流程
4. 從 `window.location.search` 重新讀取參數做清除（避免使用過時的 closure 值）

這樣即可確保信件按鈕點擊後：
→ Modal 立即開啟  
→ 自動執行搜尋  
→ 搜尋成功後切到「填寫寄件資訊」表單（即您截圖期望的畫面）  
→ URL 清乾淨

## 不需要修改

- 信件範本（URL 已正確）
- `send-shipping-reminders` Edge Function
- `Tracking` / `Track` 頁面

只改 `src/pages/Shipping.tsx` 一個 `useEffect`，無需重新部署 Edge Function。

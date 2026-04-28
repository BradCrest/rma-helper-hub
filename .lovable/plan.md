# 修正 Email 範本地址 + 確認自動開窗機制

## 1. 修正 Email 範本中的收件地址

修改 `supabase/functions/_shared/transactional-email-templates/shipping-reminder.tsx`：

**舊地址（錯誤）：**
> 新北市汐止區康寧街169巷31號5樓 / CREST 保固服務中心

**新地址（正確）：**
> **中文：** 242039 新北市新莊區化成路11巷86號1樓
> **英文：** No. 86, Ln. 11, Huacheng Rd., Xinzhuang Dist., New Taipei City, Taiwan, 242039

採用兩段式呈現（中／英分行 + 粗體強調），與寄件視窗截圖中的「後續步驟」資訊一致。

部署：`send-transactional-email`（範本檔案是被它讀取的）

## 2. 關於藍色按鈕的連結 — 已經做到了 ✅

**完全沒有問題，這正是現在的運作方式：**

- 信件按鈕連結：`https://rma-helper-hub.lovable.app/shipping?rma=RC7EA057459&autoopen=1`
- `Shipping.tsx` 已實作 `useEffect` 偵測 URL 參數：
  - 讀到 `?rma=...` → 自動填入 RMA 編號
  - 讀到 `&autoopen=1` → 自動開啟「新增寄件資訊」視窗 + 自動執行搜尋
  - 搜尋成功 → 自動切到「填寫寄件資訊」表單（就是您截圖的畫面）
  - 處理完後自動清除 URL 參數，避免重複觸發

**您截圖的畫面就是按鈕點擊後的實際結果。** 客戶從信件點按鈕後，看到的是已經帶入 RMA 編號、跳到表單步驟、可直接填寫物流資訊的視窗 — 完全不需要客戶手動輸入 RMA。

## 3. 同步更新 Memory

更新 `mem://ui/shipping-address-and-policy`，記錄正確地址（中英對照），避免日後其他位置又出現舊地址。

---

**結果**：信件內容的地址改正、按鈕點擊體驗維持目前實作（已正確運作）。

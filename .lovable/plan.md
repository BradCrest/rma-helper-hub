## 問題根因

`claude@crestdiving.com` 的狀態：
- 帳號已存在、申請已 `approved`、已具有 `admin` 角色
- 但 `email_confirmed_at = null`，被 Auth 擋下（log: `400: Email not confirmed`）

換句話說：審核通過 ≠ 信箱驗證通過，所以還是登不進來。

## 修復計畫

### 1. 立即解開 Claude 帳號（一次性 migration）
用 service role 把 `claude@crestdiving.com` 的 `email_confirmed_at` 標記為現在時間，讓他可以馬上登入。
不關閉全站 email confirmation。

### 2. 修正管理員審核流程（避免再發生）
新增 Edge Function `approve-admin-registration`（service role），批准時一次完成：
- `INSERT user_roles (admin)`
- `UPDATE pending_admin_registrations → approved`
- 將該使用者 `email_confirmed_at` 標記為已驗證

`AdminSettings.tsx` 的 `handleApproveRegistration` 改為呼叫此函式，不再從前端直接寫入。

### 3. 改善登入錯誤提示（Admin.tsx 第 78 行）
依你給的 patch：
```ts
if (error.message.includes("Invalid login credentials")) {
  toast.error("帳號或密碼錯誤");
} else if (error.message.includes("Email not confirmed")) {
  toast.error("信箱尚未驗證。若已通過管理員審核，請聯繫管理員手動確認您的帳號。");
} else {
  toast.error("登入失敗，請稍後再試");
}
```

## 變更檔案
- `supabase/migrations/<new>.sql` — 確認 claude@crestdiving.com 的 email
- `supabase/functions/approve-admin-registration/index.ts` — 新建
- `supabase/config.toml` — 為新函式加上 `verify_jwt = true`
- `src/pages/AdminSettings.tsx` — `handleApproveRegistration` 改用新函式
- `src/pages/Admin.tsx` — 登入錯誤訊息分支

按下 Approve 後就可以一次套用。
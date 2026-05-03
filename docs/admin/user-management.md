# 使用者管理

**限制**：本章節功能僅 `super_admin` 可操作。

## 管理員角色說明

| 角色 | 說明 | 可額外執行 |
|------|------|-----------|
| `admin` | 一般管理員 | 所有 RMA 操作、物流、知識庫 |
| `super_admin` | 超級管理員 | 管理其他管理員、查看登入記錄、Gmail 授權設定 |

## 新增管理員流程

**管理員無法由 super_admin 直接建立帳號**，流程如下：

```
1. 新人員前往 /admin 頁面
2. 點擊「申請管理員帳號」（或直接用 Email 註冊）
3. Supabase Auth 建立帳號
4. 申請記錄進入 pending_admin_registrations
5. super_admin 在「設定 → 管理員申請」審核
6. 核准後，新管理員角色設定完成
```

**為什麼不能直接建立？**  
Supabase Auth 要求每個帳號必須由帳號所有人設定密碼，無法由管理員代為設定明文密碼。

## 角色升級（升為 super_admin）

目前需透過 **Supabase Dashboard** 手動修改 `user_roles` 表：

```sql
UPDATE user_roles
SET role = 'super_admin'
WHERE user_id = '...';
```

> 升級後，對方需要重新登入才會生效（Session 需刷新）。

## 撤銷管理員權限

1. 前往 `設定 → 管理員列表`
2. 找到目標管理員
3. 點擊「撤銷權限」
4. 確認後，從 `user_roles` 刪除記錄
5. **對方的 auth.users 帳號仍存在**，但無法進入後台

> 若需要完全刪除帳號，需透過 Supabase Dashboard 的「Auth → Users」頁面操作。

## 密碼重設

若管理員忘記密碼：
1. `super_admin` 前往 `設定 → 管理員列表`
2. 找到目標管理員，點擊「重設密碼」
3. 系統寄送重設連結（有效期限 1 小時）
4. 對方收到 Email，點擊連結設定新密碼

若連 `super_admin` 也忘記密碼：
1. 前往 Supabase Dashboard → Authentication → Users
2. 找到帳號，點擊「Send Password Reset Email」

## 安全建議

- 保持最少特權原則：一般日常操作不需要 `super_admin`
- 定期審查管理員列表，撤銷不再使用的帳號
- 若有人員離職，立即撤銷其管理員權限
- `super_admin` 帳號建議開啟 2FA（目前透過 Supabase Auth 設定）

## 登入記錄稽核

定期查看登入記錄（`設定 → 登入記錄`）：
- 每週確認無異常 IP 來源
- 發現異常立即重設對應帳號密碼並調查

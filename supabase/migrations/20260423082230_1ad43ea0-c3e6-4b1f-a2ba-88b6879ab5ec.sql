-- Fix privilege escalation: prevent admins from creating super_admin roles.
-- Only super_admins can grant super_admin; admins can only create 'admin' or 'user' roles.

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;

CREATE POLICY "Admins can insert non-super-admin roles"
ON public.user_roles
FOR INSERT
TO public
WITH CHECK (
  is_admin(auth.uid())
  AND role <> 'super_admin'::public.app_role
);

CREATE POLICY "Super admins can insert any role"
ON public.user_roles
FOR INSERT
TO public
WITH CHECK (
  is_super_admin(auth.uid())
);
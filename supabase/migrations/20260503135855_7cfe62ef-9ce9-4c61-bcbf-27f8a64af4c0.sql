INSERT INTO public.pending_admin_registrations (user_id, email, status)
SELECT id, email, 'pending'
FROM auth.users
WHERE email = 'claude@crestdiving.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.pending_admin_registrations p WHERE p.user_id = auth.users.id
  );
-- Create login_logs table to store authentication events
CREATE TABLE public.login_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  event_type text NOT NULL DEFAULT 'login',
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all login logs
CREATE POLICY "Admins can view all login logs"
ON public.login_logs
FOR SELECT
USING (is_admin(auth.uid()));

-- Super admins can delete login logs
CREATE POLICY "Super admins can delete login logs"
ON public.login_logs
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Allow edge function to insert logs (using service role)
CREATE POLICY "Service role can insert login logs"
ON public.login_logs
FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_login_logs_created_at ON public.login_logs(created_at DESC);
CREATE INDEX idx_login_logs_user_id ON public.login_logs(user_id);
-- Create pending admin registrations table
CREATE TABLE public.pending_admin_registrations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    email TEXT NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID,
    reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security
ALTER TABLE public.pending_admin_registrations ENABLE ROW LEVEL SECURITY;

-- Admins can view all pending registrations
CREATE POLICY "Admins can view pending registrations"
ON public.pending_admin_registrations
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update pending registrations (approve/reject)
CREATE POLICY "Admins can update pending registrations"
ON public.pending_admin_registrations
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Anyone authenticated can insert their own pending registration
CREATE POLICY "Users can register for admin"
ON public.pending_admin_registrations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can delete pending registrations
CREATE POLICY "Admins can delete pending registrations"
ON public.pending_admin_registrations
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));
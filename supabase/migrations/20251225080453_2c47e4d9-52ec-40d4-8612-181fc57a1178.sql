-- Add 'unknown' status to rma_status enum
ALTER TYPE public.rma_status ADD VALUE IF NOT EXISTS 'unknown';
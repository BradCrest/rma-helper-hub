-- Create new enum type with updated statuses
CREATE TYPE public.rma_status_new AS ENUM (
  'registered',      -- 已登記
  'shipped',         -- 已寄出（客戶寄出）
  'received',        -- 已收件
  'inspecting',      -- 檢修中
  'contacting',      -- 聯系中
  'quote_confirmed', -- 確認報價
  'paid',            -- 已付費
  'no_repair',       -- 不維修
  'repairing',       -- 維修中
  'shipped_back',    -- 已寄出（回寄）
  'follow_up',       -- 後續關懷
  'closed'           -- 已結案
);

-- Update rma_requests table
ALTER TABLE public.rma_requests 
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.rma_requests 
  ALTER COLUMN status TYPE public.rma_status_new 
  USING (
    CASE status::text
      WHEN 'pending' THEN 'registered'::public.rma_status_new
      WHEN 'processing' THEN 'inspecting'::public.rma_status_new
      WHEN 'shipped' THEN 'shipped'::public.rma_status_new
      WHEN 'received' THEN 'received'::public.rma_status_new
      WHEN 'repairing' THEN 'repairing'::public.rma_status_new
      WHEN 'completed' THEN 'closed'::public.rma_status_new
      WHEN 'cancelled' THEN 'no_repair'::public.rma_status_new
      ELSE 'registered'::public.rma_status_new
    END
  );

ALTER TABLE public.rma_requests 
  ALTER COLUMN status SET DEFAULT 'registered'::public.rma_status_new;

-- Update rma_status_history table
ALTER TABLE public.rma_status_history 
  ALTER COLUMN status TYPE public.rma_status_new 
  USING (
    CASE status::text
      WHEN 'pending' THEN 'registered'::public.rma_status_new
      WHEN 'processing' THEN 'inspecting'::public.rma_status_new
      WHEN 'shipped' THEN 'shipped'::public.rma_status_new
      WHEN 'received' THEN 'received'::public.rma_status_new
      WHEN 'repairing' THEN 'repairing'::public.rma_status_new
      WHEN 'completed' THEN 'closed'::public.rma_status_new
      WHEN 'cancelled' THEN 'no_repair'::public.rma_status_new
      ELSE 'registered'::public.rma_status_new
    END
  );

-- Drop old enum and rename new one
DROP TYPE public.rma_status;
ALTER TYPE public.rma_status_new RENAME TO rma_status;
-- Add three new shipped_back status values to rma_status enum
ALTER TYPE rma_status ADD VALUE IF NOT EXISTS 'shipped_back_refurbished';
ALTER TYPE rma_status ADD VALUE IF NOT EXISTS 'shipped_back_original';
ALTER TYPE rma_status ADD VALUE IF NOT EXISTS 'shipped_back_new';
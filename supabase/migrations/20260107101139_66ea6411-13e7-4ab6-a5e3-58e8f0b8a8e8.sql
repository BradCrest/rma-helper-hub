ALTER TABLE rma_requests ADD COLUMN repair_fee numeric DEFAULT NULL;
COMMENT ON COLUMN rma_requests.repair_fee IS '維修費用';
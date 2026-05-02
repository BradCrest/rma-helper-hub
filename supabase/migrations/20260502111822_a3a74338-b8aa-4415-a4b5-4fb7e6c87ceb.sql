-- A2 legacy status cleanup: 9 received → closed
-- A2-1 (7 manual confirm) + A2-2 (2 海世界)

-- A2-1: 7 筆 manual_confirm
UPDATE rma_requests
SET status = 'closed',
    customer_notes = COALESCE(customer_notes || E'\n\n', '') ||
      '[legacy_status_cleanup_2026_A2_manual_confirm] ' ||
      CASE rma_number
        WHEN 'RC20241112001' THEN '已協調用整新機價錢購買全新機,已結案'
        WHEN 'RC20241112002' THEN '已協調用整新機價錢購買全新機,已結案'
        WHEN 'RC20241112003' THEN '已結案'
        WHEN 'RC20250413001' THEN '已結案'
        WHEN 'RC20250430001' THEN '已結案'
        WHEN 'RC20250516001' THEN '已結案'
        WHEN 'RC20250602002' THEN '已結案'
      END,
    updated_at = now()
WHERE rma_number IN (
  'RC20241112001','RC20241112002','RC20241112003',
  'RC20250413001','RC20250430001','RC20250516001','RC20250602002'
)
AND status = 'received';

-- A2-1 explicit history (7)
INSERT INTO rma_status_history (rma_request_id, status, notes, changed_by)
SELECT id, 'closed'::rma_status,
       'legacy_status_cleanup_2026_A2_manual_confirm: ' ||
       CASE rma_number
         WHEN 'RC20241112001' THEN '已協調用整新機價錢購買全新機,已結案'
         WHEN 'RC20241112002' THEN '已協調用整新機價錢購買全新機,已結案'
         WHEN 'RC20241112003' THEN '已結案'
         WHEN 'RC20250413001' THEN '已結案'
         WHEN 'RC20250430001' THEN '已結案'
         WHEN 'RC20250516001' THEN '已結案'
         WHEN 'RC20250602002' THEN '已結案'
       END,
       NULL
FROM rma_requests
WHERE rma_number IN (
  'RC20241112001','RC20241112002','RC20241112003',
  'RC20250413001','RC20250430001','RC20250516001','RC20250602002'
);

-- A2-2: 2 筆海世界
UPDATE rma_requests
SET status = 'closed',
    customer_notes = COALESCE(customer_notes || E'\n\n', '') ||
      '[legacy_status_cleanup_2026_A2_haishijie] ' ||
      CASE rma_number
        WHEN 'RC20251013001' THEN '已寄回給客戶'
        WHEN 'RC20251013002' THEN 'CBK22100060 測試正常原錶寄回;CBK19250577 p sensor故障已過保,報價整新機 NT$2,980,結案'
      END,
    updated_at = now()
WHERE rma_number IN ('RC20251013001','RC20251013002')
AND status = 'received';

-- A2-2 explicit history (2)
INSERT INTO rma_status_history (rma_request_id, status, notes, changed_by)
SELECT id, 'closed'::rma_status,
       'legacy_status_cleanup_2026_A2_haishijie: ' ||
       CASE rma_number
         WHEN 'RC20251013001' THEN '已寄回給客戶'
         WHEN 'RC20251013002' THEN 'CBK22100060 測試正常原錶寄回;CBK19250577 p sensor故障已過保,報價整新機 NT$2,980,結案'
       END,
       NULL
FROM rma_requests
WHERE rma_number IN ('RC20251013001','RC20251013002');
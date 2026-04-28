UPDATE public.rma_requests
SET shipping_reminder_sent_at = now()
WHERE status = 'registered'
  AND shipping_reminder_sent_at IS NULL
  AND created_at <= now() - interval '48 hours';
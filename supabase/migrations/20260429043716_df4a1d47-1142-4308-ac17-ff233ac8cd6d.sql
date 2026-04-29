SELECT cron.schedule(
  'cleanup-rma-attachments-weekly',
  '0 3 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://xrbvyfoewbwywrwocrpf.supabase.co/functions/v1/cleanup-rma-attachments',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhyYnZ5Zm9ld2J3eXdyd29jcnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzODYxMTUsImV4cCI6MjA4MTk2MjExNX0.tPT9R-gyHwTiRR4Y6isluEke2CNZhZ--gvzFw5FcDJQ"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  );
  $$
);
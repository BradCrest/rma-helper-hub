DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-embedding-kickoff-every-minute') THEN
    PERFORM cron.unschedule('email-embedding-kickoff-every-minute');
  END IF;
END $$;

SELECT cron.schedule(
  'email-embedding-kickoff-every-minute',
  '* * * * *',
  $job$
  select net.http_post(
    url:='https://xrbvyfoewbwywrwocrpf.supabase.co/functions/v1/kickoff-email-embedding-job',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhyYnZ5Zm9ld2J3eXdyd29jcnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzODYxMTUsImV4cCI6MjA4MTk2MjExNX0.tPT9R-gyHwTiRR4Y6isluEke2CNZhZ--gvzFw5FcDJQ"}'::jsonb,
    body:='{"triggerSource":"cron"}'::jsonb
  ) as request_id;
  $job$
);

INSERT INTO public.ai_settings (setting_key, setting_value, updated_at)
VALUES (
  'email_embedding_scheduler',
  jsonb_build_object(
    'enabled', true,
    'schedule', '* * * * *',
    'jobName', 'email-embedding-kickoff-every-minute'
  ),
  now()
)
ON CONFLICT (setting_key)
DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = EXCLUDED.updated_at;
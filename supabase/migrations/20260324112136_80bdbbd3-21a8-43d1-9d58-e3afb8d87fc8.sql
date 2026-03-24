
SELECT cron.schedule(
  'quarterly-editorial-trends-scrape',
  '0 9 1 3,6,9,12 *',
  $$
  SELECT
    net.http_post(
        url:='https://vjnsophqfxiamgjxnlls.supabase.co/functions/v1/scrape-fashion-editorial',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqbnNvcGhxZnhpYW1nanhubGxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MjkyNjMsImV4cCI6MjA4OTUwNTI2M30.TBbIzMbSclL4QV41WZprLT17q9fE7Bxfwr7HcDqiXxk"}'::jsonb,
        body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);

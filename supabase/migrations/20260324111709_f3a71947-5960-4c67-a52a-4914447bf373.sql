
-- Schedule google-trends-integration to run quarterly at 9am on 1st of March, June, September, December
SELECT cron.schedule(
  'quarterly-google-trends-sync',
  '0 9 1 3,6,9,12 *',
  $$
  SELECT
    net.http_post(
        url:='https://vjnsophqfxiamgjxnlls.supabase.co/functions/v1/google-trends-integration',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqbnNvcGhxZnhpYW1nanhubGxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MjkyNjMsImV4cCI6MjA4OTUwNTI2M30.TBbIzMbSclL4QV41WZprLT17q9fE7Bxfwr7HcDqiXxk"}'::jsonb,
        body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);

-- Delete mock data from Pinterest, Instagram, and WGSN sources
DELETE FROM fashion_trends WHERE source IN ('Pinterest Business API', 'Instagram', 'WGSN') OR external_id LIKE 'pinterest_%' OR external_id LIKE 'instagram_%' OR external_id LIKE 'wgsn_%';

-- Delete WGSN seasonal forecasts (ones with WGSN in description)
DELETE FROM seasonal_forecasts WHERE description LIKE '%WGSN%';

-- Delete WGSN trend predictions
DELETE FROM trend_predictions WHERE description LIKE '%WGSN%' OR category IN ('Consumer Behavior', 'Technology') AND description LIKE '%Mock%';

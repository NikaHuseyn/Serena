import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';

const jsonWith = (corsHeaders: Record<string, string>) => (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function purgeBucket(admin: ReturnType<typeof createClient>, bucket: string, userId: string) {
  const prefix = `${userId}/`;
  const collected: string[] = [];

  async function walk(path: string) {
    const { data, error } = await admin.storage.from(bucket).list(path, { limit: 1000 });
    if (error) throw new Error(`list ${bucket}/${path}: ${error.message}`);
    if (!data) return;
    for (const entry of data) {
      const full = path ? `${path}/${entry.name}` : entry.name;
      // Folders have null id / no metadata in supabase-js listings
      if (entry.id === null || entry.metadata === null) {
        await walk(full);
      } else {
        collected.push(full);
      }
    }
  }

  await walk(prefix.replace(/\/$/, ''));

  if (collected.length > 0) {
    const { error } = await admin.storage.from(bucket).remove(collected);
    if (error) throw new Error(`remove ${bucket}: ${error.message}`);
  }
  return collected.length;
}

Deno.serve(async (req) => {
  const corsHeaders = { ...corsHeadersFor(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const json = jsonWith(corsHeaders);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authClient = createClient(supabaseUrl, anonKey);
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: 'Unauthorized' }, 401);
    const userId = claimsData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Storage
    let removed = 0;
    for (const bucket of ['profile-photos', 'community-photos']) {
      try {
        removed += await purgeBucket(admin, bucket, userId);
      } catch (e) {
        return json({ error: `storage: ${(e as Error).message}` }, 500);
      }
    }

    // 2. Purge DB
    const { error: purgeErr } = await admin.rpc('purge_user_data', { target_user: userId });
    if (purgeErr) return json({ error: `purge: ${purgeErr.message}` }, 500);

    // 3. Delete auth user
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ error: `auth: ${delErr.message}` }, 500);

    return json({ success: true, files_removed: removed });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

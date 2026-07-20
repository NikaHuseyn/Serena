import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Campaign {
  id: string;
  brand_name: string;
  brand_logo_url: string | null;
  title: string | null;
  description: string | null;
  prize_description: string | null;
  rules: string | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  entry_bonus_points: number;
}

export interface LeaderboardRow {
  entry_id: string;
  post_id: string;
  user_id: string;
  like_count: number;
  rank: number;
  display_name: string | null;
  avatar_url: string | null;
  thumbnail_url: string | null;
}

export const useActiveChallenges = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error('Failed to load challenges:', error);
        setCampaigns([]);
      } else {
        setCampaigns((data as Campaign[]) || []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { campaigns, loading };
};

export const useChallenge = (id: string | undefined) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else {
        setCampaign((data as Campaign) || null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { campaign, loading, error };
};

export const useChallengeLeaderboard = (campaignId: string | undefined) => {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('challenge_leaderboard')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('rank', { ascending: true });

    if (error) {
      console.error('Failed to load leaderboard:', error);
      setRows([]);
      setLoading(false);
      return;
    }

    const entries = (data || []) as any[];
    if (entries.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const userIds = Array.from(new Set(entries.map((e) => e.user_id).filter(Boolean)));
    const postIds = Array.from(new Set(entries.map((e) => e.post_id).filter(Boolean)));

    const [profilesRes, postsRes] = await Promise.all([
      userIds.length
        ? supabase.from('social_profiles').select('user_id, display_name, avatar_url').in('user_id', userIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      postIds.length
        ? supabase.from('posts').select('id, image_urls').in('id', postIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    const profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
    (profilesRes.data || []).forEach((p: any) => profileMap.set(p.user_id, p));
    const postMap = new Map<string, string | null>();
    (postsRes.data || []).forEach((p: any) =>
      postMap.set(p.id, Array.isArray(p.image_urls) && p.image_urls.length > 0 ? p.image_urls[0] : null),
    );

    const merged: LeaderboardRow[] = entries
      .filter((e) => e.entry_id && e.post_id && e.user_id)
      .map((e) => {
        const profile = profileMap.get(e.user_id);
        return {
          entry_id: e.entry_id,
          post_id: e.post_id,
          user_id: e.user_id,
          like_count: e.like_count ?? 0,
          rank: e.rank ?? 0,
          display_name: profile?.display_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
          thumbnail_url: postMap.get(e.post_id) ?? null,
        };
      });

    setRows(merged);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  return { rows, loading, refetch: fetchRows };
};

export const useUserChallengeEntry = (campaignId: string | undefined) => {
  const [entryPostId, setEntryPostId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEntry = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setEntryPostId(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('challenge_entries')
      .select('post_id')
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.error('Failed to check entry:', error);
    }
    setEntryPostId(data?.post_id ?? null);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    fetchEntry();
  }, [fetchEntry]);

  return { entryPostId, loading, refetch: fetchEntry };
};

export const getChallengeStatus = (
  campaign: Pick<Campaign, 'starts_at' | 'ends_at'>,
): { state: 'upcoming' | 'live' | 'ended'; target: string | null } => {
  const now = Date.now();
  const starts = campaign.starts_at ? new Date(campaign.starts_at).getTime() : null;
  const ends = campaign.ends_at ? new Date(campaign.ends_at).getTime() : null;
  if (starts && now < starts) return { state: 'upcoming', target: campaign.starts_at };
  if (ends && now > ends) return { state: 'ended', target: campaign.ends_at };
  return { state: 'live', target: campaign.ends_at ?? null };
};

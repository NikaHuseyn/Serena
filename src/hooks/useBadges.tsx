
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Badge {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  criteria: any;
  earned_at: string | null;
}

export const useBadges = (userId?: string) => {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBadges = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      const targetUserId = userId || user?.id;
      
      if (!targetUserId) return;

      const { data, error } = await supabase
        .from('user_badges')
        .select('*')
        .eq('user_id', targetUserId)
        .order('awarded_at', { ascending: false });

      if (error) throw error;

      const formattedBadges = data?.map(item => ({
        id: item.id,
        name: item.badge_name,
        description: item.description,
        icon: null, // Since the current schema doesn't have icon field
        criteria: { badge_type: item.badge_type },
        earned_at: item.awarded_at
      })) || [];

      setBadges(formattedBadges);
    } catch (err) {
      console.error('Error fetching badges:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch badges');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBadges();
  }, [userId]);

  return {
    badges,
    loading,
    error,
    refetch: fetchBadges
  };
};

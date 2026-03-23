
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface VoteCounts {
  [optionIndex: number]: number;
}

export const useOutfitVotes = (postId: string, optionCount: number) => {
  const [voteCounts, setVoteCounts] = useState<VoteCounts>({});
  const [userVote, setUserVote] = useState<number | null>(null);
  const [totalVotes, setTotalVotes] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchVotes = useCallback(async () => {
    try {
      const { data: votes, error } = await supabase
        .from('outfit_votes')
        .select('option_index, user_id')
        .eq('post_id', postId);

      if (error) throw error;

      const counts: VoteCounts = {};
      for (let i = 0; i < optionCount; i++) counts[i] = 0;

      const { data: { user } } = await supabase.auth.getUser();

      let myVote: number | null = null;
      (votes || []).forEach(v => {
        counts[v.option_index] = (counts[v.option_index] || 0) + 1;
        if (user && v.user_id === user.id) myVote = v.option_index;
      });

      setVoteCounts(counts);
      setUserVote(myVote);
      setTotalVotes(votes?.length || 0);
    } catch (err) {
      console.error('Error fetching votes:', err);
    } finally {
      setLoading(false);
    }
  }, [postId, optionCount]);

  useEffect(() => {
    fetchVotes();
  }, [fetchVotes]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`votes-${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'outfit_votes',
          filter: `post_id=eq.${postId}`,
        },
        () => {
          fetchVotes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId, fetchVotes]);

  const castVote = async (optionIndex: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = '/auth';
      return;
    }

    // Optimistic update
    const prevCounts = { ...voteCounts };
    const prevUserVote = userVote;
    const prevTotal = totalVotes;

    const newCounts = { ...voteCounts };
    if (userVote !== null) {
      newCounts[userVote] = Math.max(0, (newCounts[userVote] || 0) - 1);
    }
    newCounts[optionIndex] = (newCounts[optionIndex] || 0) + 1;
    
    setVoteCounts(newCounts);
    setUserVote(optionIndex);
    setTotalVotes(userVote !== null ? totalVotes : totalVotes + 1);

    try {
      if (prevUserVote !== null) {
        // Update existing vote
        const { error } = await supabase
          .from('outfit_votes')
          .update({ option_index: optionIndex })
          .eq('post_id', postId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        // Insert new vote
        const { error } = await supabase
          .from('outfit_votes')
          .insert({ post_id: postId, user_id: user.id, option_index: optionIndex });
        if (error) throw error;
      }

      // Create notification for post author
      const { data: post } = await supabase
        .from('posts')
        .select('user_id')
        .eq('id', postId)
        .single();

      if (post && post.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: post.user_id,
          related_post_id: postId,
          related_user_id: user.id,
          type: 'vote',
          message: `Someone voted on your outfit poll`,
        });
      }
    } catch (err) {
      // Revert optimistic update
      setVoteCounts(prevCounts);
      setUserVote(prevUserVote);
      setTotalVotes(prevTotal);
      console.error('Error casting vote:', err);
    }
  };

  // Compute winning status
  const getWinnerText = (): string => {
    if (totalVotes === 0) return 'No votes yet — be the first!';

    const maxCount = Math.max(...Object.values(voteCounts));
    const winners = Object.entries(voteCounts)
      .filter(([, count]) => count === maxCount)
      .map(([idx]) => `Option ${Number(idx) + 1}`);

    if (totalVotes === 1) {
      return `1 vote · ${winners[0]} is leading`;
    }

    if (winners.length > 1) {
      return `${totalVotes} total votes · ${winners.join(' and ')} are tied`;
    }

    return `${totalVotes} total votes · ${winners[0]} is winning`;
  };

  return {
    voteCounts,
    userVote,
    totalVotes,
    loading,
    castVote,
    getWinnerText,
  };
};

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import LikesListDialog from './LikesListDialog';

interface LikeButtonProps {
  postId: string;
  currentUserId?: string;
  count: number;
  liked?: boolean;
  variant?: 'default' | 'poll';
  compact?: boolean;
  onToggle: (postId: string) => void;
  className?: string;
}

const LikeButton: React.FC<LikeButtonProps> = ({
  postId,
  currentUserId,
  count,
  liked,
  variant = 'default',
  compact = false,
  onToggle,
  className,
}) => {
  const [isLiked, setIsLiked] = useState(liked ?? false);
  const [loading, setLoading] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  // On mount, determine initial state strictly from whether a likes row exists.
  useEffect(() => {
    let cancelled = false;
    const checkLike = async () => {
      if (!currentUserId) {
        if (!cancelled) setIsLiked(false);
        return;
      }
      const { data, error } = await supabase
        .from('likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', currentUserId)
        .maybeSingle();
      if (!cancelled) {
        setIsLiked(!!data && !error);
      }
    };
    checkLike();
    return () => {
      cancelled = true;
    };
  }, [postId, currentUserId]);

  // Sync with parent prop when not in the middle of a request.
  useEffect(() => {
    if (!loading) {
      setIsLiked(!!liked);
    }
  }, [liked, loading]);

  const handleClick = async () => {
    if (loading) return;
    if (!currentUserId) {
      onToggle(postId);
      return;
    }
    setLoading(true);
    try {
      await onToggle(postId);
    } finally {
      setLoading(false);
    }
  };

  const handleCountClick = () => {
    if (!currentUserId) {
      // Guests get the auth nudge, same as tapping the heart.
      onToggle(postId);
      return;
    }
    setListOpen(true);
  };

  const heartClasses =
    isLiked
      ? 'text-primary bg-primary/10 hover:bg-primary/20'
      : 'text-primary/70 hover:text-primary hover:bg-primary/5';
  const size = compact ? 'sm' : 'default';
  const countTextClass = compact || variant === 'poll' ? 'text-xs' : 'text-sm';

  return (
    <>
      <Button
        variant="ghost"
        size={size}
        onClick={handleClick}
        disabled={loading}
        aria-label={isLiked ? 'Unlike post' : 'Like post'}
        className={`rounded-full px-2.5 transition-colors ${heartClasses} ${className || ''}`}
      >
        <Heart className={`h-4 w-4 ${isLiked ? 'fill-current' : ''}`} />
      </Button>
      <button
        type="button"
        onClick={handleCountClick}
        aria-label={`View ${count} like${count === 1 ? '' : 's'}`}
        className={`rounded-full px-1.5 py-0.5 -ml-1 transition-colors hover:bg-primary/10 ${
          isLiked ? 'text-primary' : 'text-primary/80'
        } ${countTextClass}`}
      >
        {count}
      </button>
      <LikesListDialog postId={postId} open={listOpen} onOpenChange={setListOpen} />
    </>
  );
};

export default LikeButton;

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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
  className
}) => {
  const [isLiked, setIsLiked] = useState(liked ?? false);
  const [loading, setLoading] = useState(false);

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
    return () => { cancelled = true; };
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
      // Let the parent handle the auth nudge.
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

  if (variant === 'poll') {
    return (
      <Button
        variant="ghost"
        size={compact ? 'sm' : 'default'}
        onClick={handleClick}
        disabled={loading}
        className={`rounded-full px-3 transition-colors ${
          isLiked
            ? 'text-primary bg-primary/10 hover:bg-primary/20'
            : 'text-primary/70 hover:text-primary hover:bg-primary/5'
        } ${className || ''}`}
      >
        <Heart className={`h-4 w-4 mr-1.5 ${isLiked ? 'fill-current' : ''}`} />
        <span className="text-sm">{count}</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size={compact ? 'sm' : 'default'}
      onClick={handleClick}
      disabled={loading}
      className={`${
        isLiked
          ? 'text-destructive hover:text-destructive/80'
          : 'text-muted-foreground hover:text-destructive'
      } transition-colors ${className || ''}`}
    >
      <Heart className={`h-4 w-4 mr-1 ${isLiked ? 'fill-current' : ''}`} />
      <span className={compact ? 'text-xs' : 'text-sm'}>{count}</span>
    </Button>
  );
};

export default LikeButton;

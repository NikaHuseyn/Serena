
import React from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircle, Share2 } from 'lucide-react';
import LikeButton from './LikeButton';

interface PostInteractionsProps {
  post: {
    id: string;
    likes_count: number;
    comments_count: number;
    user_liked?: boolean;
  };
  currentUserId?: string;
  onToggleLike: (postId: string) => void;
  onShare: (postId: string) => void;
  compact?: boolean;
}

const PostInteractions = ({ post, currentUserId, onToggleLike, onShare, compact = false }: PostInteractionsProps) => {
  return (
    <div className={`flex items-center ${compact ? 'space-x-2' : 'space-x-3'} bg-primary/5 rounded-2xl px-4 py-2.5`}>
      <LikeButton
        postId={post.id}
        currentUserId={currentUserId}
        count={post.likes_count}
        liked={post.user_liked}
        onToggle={onToggleLike}
        compact={compact}
      />

      <Button
        variant="ghost"
        size={compact ? "sm" : "default"}
        className="rounded-full px-3 text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-colors"
      >
        <MessageCircle className="h-4 w-4 mr-1.5" />
        <span className={compact ? 'text-xs' : 'text-sm'}>
          {post.comments_count}
        </span>
      </Button>

      <Button
        variant="ghost"
        size={compact ? "sm" : "default"}
        onClick={() => onShare(post.id)}
        className="rounded-full px-3 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
      >
        <Share2 className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default PostInteractions;

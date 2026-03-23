
import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import PostInteractions from './PostInteractions';
import CommentSection from './CommentSection';
import FollowButton from './FollowButton';
import BadgeDisplay from './BadgeDisplay';
import ReportPostDialog from './ReportPostDialog';
import { useBadges } from '@/hooks/useBadges';

interface PostCardProps {
  post: {
    id: string;
    user_id: string;
    image_urls: string[];
    caption: string | null;
    tags: string[] | null;
    likes_count: number;
    comments_count: number;
    created_at: string;
    social_profiles: {
      display_name: string | null;
      avatar_url: string | null;
    } | null;
    user_liked?: boolean;
  };
  currentUserId?: string;
  onToggleLike: (postId: string) => void;
  onShare: (postId: string) => void;
  onDelete?: (postId: string) => void;
}

const PostCard = ({ post, currentUserId, onToggleLike, onShare, onDelete }: PostCardProps) => {
  const { badges } = useBadges(post.user_id);
  const isOwnPost = currentUserId === post.user_id;

  const formattedDate = useMemo(() => 
    new Date(post.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }), [post.created_at]);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        {/* User Info Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={post.social_profiles?.avatar_url || undefined} />
              <AvatarFallback>
                {post.social_profiles?.display_name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-sm">
                  {post.social_profiles?.display_name || 'Anonymous User'}
                </h3>
                {!isOwnPost && <FollowButton userId={post.user_id} />}
              </div>
              <BadgeDisplay badges={badges} limit={2} />
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isOwnPost && (
                <ReportPostDialog postId={post.id}>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    Report Post
                  </DropdownMenuItem>
                </ReportPostDialog>
              )}
              <DropdownMenuItem onClick={() => onShare(post.id)}>
                Share Post
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Post Images */}
        {post.image_urls && post.image_urls.length > 0 && (
          <div className={`mb-4 rounded-lg overflow-hidden ${
            post.image_urls.length === 1 ? '' : 'grid grid-cols-2 gap-2'
          }`}>
            {post.image_urls.slice(0, 4).map((url, index) => (
              <div key={index} className="relative aspect-square">
                <img
                  src={url}
                  alt={`Post image ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                {index === 3 && post.image_urls.length > 4 && (
                  <div className="absolute inset-0 bg-foreground/50 flex items-center justify-center">
                    <span className="text-background font-semibold">
                      +{post.image_urls.length - 4} more
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Post Content */}
        {post.caption && (
          <div className="mb-4">
            <p className="text-foreground whitespace-pre-wrap">{post.caption}</p>
          </div>
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag, index) => (
                <span
                  key={index}
                  className="inline-block bg-accent text-accent-foreground text-xs px-2 py-1 rounded-full"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Post Interactions */}
        <PostInteractions
          post={post}
          onToggleLike={onToggleLike}
          onShare={onShare}
        />

        {/* Comments */}
        <CommentSection postId={post.id} commentsCount={post.comments_count} />

        {/* Post Date */}
        <div className="mt-4 text-xs text-muted-foreground">
          {formattedDate}
        </div>
      </CardContent>
    </Card>
  );
};

export default PostCard;

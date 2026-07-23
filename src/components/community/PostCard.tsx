
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import PostInteractions from './PostInteractions';
import CommentSection from './CommentSection';
import FollowButton from './FollowButton';
import BadgeDisplay from './BadgeDisplay';
import ReportPostDialog from './ReportPostDialog';
import EditPostDialog from './EditPostDialog';
import CaptionRenderer from './CaptionRenderer';
import ImageLightbox from './ImageLightbox';
import CampaignBadge from './CampaignBadge';
import { MapPin, Tag as TagIcon } from 'lucide-react';
import { useBadges } from '@/hooks/useBadges';

interface PostCardProps {
  post: {
    id: string;
    user_id: string;
    image_urls: string[];
    caption: string | null;
    tags: string[] | null;
    brand_tags?: string[] | null;
    mentioned_user_ids?: string[] | null;
    location?: string | null;
    campaign_id?: string | null;
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
  onUpdate?: (
    postId: string,
    updates: {
      caption: string;
      image_urls: string[];
      tags: string[];
      mentioned_user_ids: string[];
      brand_tags: string[];
      location: string | null;
    }
  ) => Promise<void>;
  onTagClick?: (tag: string) => void;
  onBrandClick?: (brand: string) => void;
}

const PostCard = ({ post, currentUserId, onToggleLike, onShare, onDelete, onUpdate, onTagClick, onBrandClick }: PostCardProps) => {
  const { badges } = useBadges(post.user_id);
  const isOwnPost = currentUserId === post.user_id;
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

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
            <Link to={`/profile/${post.user_id}`} className="flex-shrink-0">
              <Avatar className="h-10 w-10 hover:opacity-90 transition-opacity">
                <AvatarImage src={post.social_profiles?.avatar_url || undefined} />
                <AvatarFallback>
                  {post.social_profiles?.display_name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Link
                  to={`/profile/${post.user_id}`}
                  className="font-semibold text-sm hover:underline"
                >
                  {post.social_profiles?.display_name || 'Anonymous User'}
                </Link>
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
              {isOwnPost && onUpdate && (
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Post
                </DropdownMenuItem>
              )}
              {isOwnPost && onDelete && (
                <DropdownMenuItem
                  onClick={() => setDeleteOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Post
                </DropdownMenuItem>
              )}
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
              <button
                type="button"
                key={index}
                onClick={() => { setLightboxIndex(index); setLightboxOpen(true); }}
                className="relative aspect-square block w-full overflow-hidden cursor-zoom-in"
                aria-label={`Open image ${index + 1}`}
              >
                <img
                  src={url}
                  alt={`Post image ${index + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                <CampaignBadge campaignId={post.campaign_id} />
                {index === 3 && post.image_urls.length > 4 && (
                  <div className="absolute inset-0 bg-foreground/50 flex items-center justify-center">
                    <span className="text-background font-semibold">
                      +{post.image_urls.length - 4} more
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Post Content */}
        {post.caption && (
          <div className="mb-4">
            <CaptionRenderer caption={post.caption} />
          </div>
        )}

        {/* Location */}
        {post.location && (
          <div className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span>{post.location}</span>
          </div>
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="mb-3">
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag, index) => (
                <button
                  type="button"
                  key={`tag-${index}`}
                  onClick={() => onTagClick?.(tag)}
                  className="inline-block bg-accent text-accent-foreground text-xs px-2 py-1 rounded-full hover:bg-accent/80 transition-colors"
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Brand tags */}
        {post.brand_tags && post.brand_tags.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {post.brand_tags.map((brand, index) => (
                <button
                  type="button"
                  key={`brand-${index}`}
                  onClick={() => onBrandClick?.(brand)}
                  className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded-full hover:bg-secondary/80 transition-colors"
                >
                  <TagIcon className="h-3 w-3" />
                  {brand.replace(/-/g, ' ')}
                </button>
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
        <CommentSection postId={post.id} commentsCount={post.comments_count} postOwnerId={post.user_id} />

        {/* Post Date */}
        <div className="mt-4 text-xs text-muted-foreground">
          {formattedDate}
        </div>
      </CardContent>
      {isOwnPost && onUpdate && (
        <EditPostDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          post={{
            id: post.id,
            user_id: post.user_id,
            caption: post.caption,
            image_urls: post.image_urls,
            brand_tags: post.brand_tags,
            location: post.location,
            mentioned_user_ids: post.mentioned_user_ids,
          }}
          onSave={onUpdate}
        />
      )}
      {isOwnPost && onDelete && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this post?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the post and its images. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(post.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <ImageLightbox
        images={(post.image_urls || []).map((url, i) => ({ url, label: undefined }))}
        startIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </Card>
  );
};

export default PostCard;

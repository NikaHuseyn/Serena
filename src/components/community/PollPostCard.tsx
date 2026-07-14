
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, Trash2, ChevronLeft, ChevronRight, Check } from 'lucide-react';
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
import FollowButton from './FollowButton';
import BadgeDisplay from './BadgeDisplay';
import ReportPostDialog from './ReportPostDialog';
import PollCommentSection from './PollCommentSection';
import OracleSummary from './OracleSummary';
import ImageLightbox from './ImageLightbox';
import { useBadges } from '@/hooks/useBadges';
import { useOutfitVotes } from '@/hooks/useOutfitVotes';
import type { SocialPost } from '@/hooks/useSocialPosts';

interface PollPostCardProps {
  post: SocialPost;
  currentUserId?: string;
  onShare: (postId: string) => void;
  onDelete?: (postId: string) => void;
}

const PollPostCard = ({ post, currentUserId, onShare, onDelete }: PollPostCardProps) => {
  const { badges } = useBadges(post.user_id);
  const isOwnPost = currentUserId === post.user_id;
  const optionCount = post.image_urls.length;
  const { voteCounts, userVote, totalVotes, castVote, getWinnerText } = useOutfitVotes(post.id, optionCount);
  const hasVoted = userVote !== null;
  const showResults = isOwnPost || hasVoted;
  const [currentSlide, setCurrentSlide] = useState(0);
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

  const prevSlide = () => setCurrentSlide(i => Math.max(0, i - 1));
  const nextSlide = () => setCurrentSlide(i => Math.min(optionCount - 1, i + 1));

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        {/* Header */}
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

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              👗 Which one?
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
        </div>

        {/* Occasion badge */}
        {post.occasion_context && (
          <div className="mb-3">
            <span className="text-sm text-muted-foreground">
              👗 {post.occasion_context}
            </span>
          </div>
        )}

        {/* Poll question */}
        {post.poll_question && (
          <h4 className="text-lg font-semibold text-foreground mb-4">
            {post.poll_question}
          </h4>
        )}

        {/* Carousel */}
        <div className="relative mb-3">
          <div className="overflow-hidden rounded-lg">
            <div
              className="flex transition-transform duration-300 ease-in-out"
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
              {post.image_urls.map((url, index) => {
                const count = voteCounts[index] || 0;
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                return (
                <div key={index} className="w-full flex-shrink-0 relative">
                  <div className="relative aspect-[3/4]">
                    <button
                      type="button"
                      onClick={() => { setLightboxIndex(index); setLightboxOpen(true); }}
                      className="absolute inset-0 w-full h-full cursor-zoom-in"
                      aria-label={`Open Option ${index + 1} image`}
                    >
                      <img
                        src={url}
                        alt={`Option ${index + 1}`}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </button>
                    {/* Option label */}
                    <div className="absolute top-3 left-3 pointer-events-none">
                      <span className="bg-background/80 backdrop-blur-sm text-foreground text-xs font-medium px-2 py-1 rounded">
                        Option {index + 1}
                      </span>
                    </div>
                    {/* Vote count — only visible after voting or to author */}
                    {showResults && (
                      <div className="absolute bottom-3 right-3 pointer-events-none">
                        <span className="bg-background/80 backdrop-blur-sm text-foreground text-xs font-medium px-2 py-1 rounded">
                          {count} vote{count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Vote button */}
                  <div className="p-3 space-y-2">
                    <Button
                      onClick={() => castVote(index)}
                      variant={userVote === index ? 'default' : 'outline'}
                      className="w-full"
                      size="sm"
                    >
                      {userVote === index ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Your vote
                        </>
                      ) : (
                        `Vote for Option ${index + 1} 👗`
                      )}
                    </Button>
                    {showResults && (
                      <div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {pct}% · {count} vote{count !== 1 ? 's' : ''}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </div>


          {/* Navigation arrows */}
          {currentSlide > 0 && (
            <button
              onClick={prevSlide}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm hover:bg-background rounded-full p-2 transition-colors shadow-sm z-10"
            >
              <ChevronLeft className="h-5 w-5 text-foreground" />
            </button>
          )}
          {currentSlide < optionCount - 1 && (
            <button
              onClick={nextSlide}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm hover:bg-background rounded-full p-2 transition-colors shadow-sm z-10"
            >
              <ChevronRight className="h-5 w-5 text-foreground" />
            </button>
          )}
        </div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-1.5 mb-3">
          {post.image_urls.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`h-2 rounded-full transition-all ${
                i === currentSlide
                  ? 'w-6 bg-primary'
                  : 'w-2 bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>

        {/* Winner text — only visible after voting or to author */}
        {showResults && (
          <p className="text-sm text-muted-foreground text-center mb-4">
            {getWinnerText()}
          </p>
        )}

        {/* Caption */}
        {post.caption && (
          <p className="text-foreground text-sm mb-4 whitespace-pre-wrap">{post.caption}</p>
        )}

        {/* Comments */}
        <PollCommentSection postId={post.id} optionCount={optionCount} />

        {/* Oracle Summary */}
        <OracleSummary
          postId={post.id}
          postUserId={post.user_id}
          currentUserId={currentUserId}
          oracleSummary={post.oracle_summary}
          oracleSummaryPublic={post.oracle_summary_public}
          occasionContext={post.occasion_context}
          pollQuestion={post.poll_question}
          voteCounts={voteCounts}
          optionCount={optionCount}
        />

        {/* Date */}
        <div className="mt-4 text-xs text-muted-foreground">
          {formattedDate}
        </div>
      </CardContent>
      {isOwnPost && onDelete && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this post?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the poll and its images. This action cannot be undone.
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
    </Card>
  );
};

export default PollPostCard;

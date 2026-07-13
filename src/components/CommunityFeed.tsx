
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Users, UserCircle, Lightbulb, X } from 'lucide-react';
import { useSocialPosts } from '@/hooks/useSocialPosts';
import PostCreationForm from './community/PostCreationForm';
import PostCard from './community/PostCard';
import PollPostCard from './community/PollPostCard';
import EmptyState from './community/EmptyState';
import LoadingState from './community/LoadingState';
import ErrorState from './community/ErrorState';

import Leaderboard from './community/Leaderboard';
import GuestNudgeBanner from './community/GuestNudgeBanner';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCommunityNotifications } from '@/hooks/useCommunityNotifications';
import { useGuestNudge } from '@/hooks/useGuestNudge';

// Feature flag: hide Style Leaderboard while community is small. Component and data remain intact.
const SHOW_LEADERBOARD = false;

const CommunityFeed = () => {
  const { posts, loading, loadingMore, error, hasMore, createPost, toggleLike, deletePost, updatePost, loadMore } = useSocialPosts();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { markAsRead } = useCommunityNotifications();
  const { requireAuth } = useGuestNudge();
  const [showPostForm, setShowPostForm] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [stats, setStats] = useState({
    totalPosts: 0,
    totalLikes: 0,
    totalComments: 0,
    activeUsers: 0
  });
  const prevPostsLength = useRef(posts.length);

  // Fetch current user once & mark notifications as read
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id);
    });
    markAsRead();
  }, [markAsRead]);

  // One-time hint for users who haven't posted yet
  useEffect(() => {
    const dismissed = localStorage.getItem('community-hint-dismissed') === 'true';
    setHintDismissed(dismissed);
  }, []);

  const dismissHint = () => {
    localStorage.setItem('community-hint-dismissed', 'true');
    setHintDismissed(true);
  };

  const hasUserPosted = currentUserId ? posts.some(p => p.user_id === currentUserId) : true;
  const showHint = Boolean(currentUserId) && posts.length > 0 && !hasUserPosted && !hintDismissed;

  const fetchCommunityStats = useCallback(async () => {
    try {
      const [postsRes, likesRes, commentsRes, usersRes] = await Promise.all([
        supabase.from('posts').select('*', { count: 'exact', head: true }),
        supabase.from('likes').select('*', { count: 'exact', head: true }),
        supabase.from('comments').select('*', { count: 'exact', head: true }),
        supabase.from('social_profiles').select('*', { count: 'exact', head: true }).gt('posts_count', 0),
      ]);

      setStats({
        totalPosts: postsRes.count || 0,
        totalLikes: likesRes.count || 0,
        totalComments: commentsRes.count || 0,
        activeUsers: usersRes.count || 0,
      });
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (posts.length !== prevPostsLength.current || prevPostsLength.current === 0) {
      prevPostsLength.current = posts.length;
      fetchCommunityStats();
    }
  }, [posts.length, fetchCommunityStats]);

  const handleShare = async (postId: string) => {
    try {
      const post = posts.find(p => p.id === postId);
      if (!post) return;

      const shareUrl = `${window.location.origin}/community?post=${postId}`;
      const shareText = `Check out this stylish outfit post!${post.caption ? ' ' + post.caption : ''}`;

      if (navigator.share) {
        await navigator.share({ title: 'Style Community Post', text: shareText, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        toast({ title: "Link Copied!", description: "Share link has been copied to your clipboard." });
      }
    } catch {
      try {
        const shareUrl = `${window.location.origin}/community?post=${postId}`;
        await navigator.clipboard.writeText(shareUrl);
        toast({ title: "Link Copied!", description: "Share link has been copied to your clipboard." });
      } catch {
        toast({ title: "Share Failed", description: "Unable to share this post.", variant: "destructive" });
      }
    }
  };

  const handleCreatePost = async (postData: {
    caption: string;
    tags?: string[];
    image_urls: string[];
    post_type?: string;
    occasion_context?: string;
    poll_question?: string;
  }): Promise<void> => {
    const ok = await requireAuth('share outfits');
    if (!ok) return;
    await createPost(postData);
    setShowPostForm(false);
  };

  const handleShowPostForm = async () => {
    if (showPostForm) {
      setShowPostForm(false);
      return;
    }
    const ok = await requireAuth('share outfits');
    if (!ok) return;
    setShowPostForm(true);
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className={`grid grid-cols-1 gap-6 ${SHOW_LEADERBOARD ? 'lg:grid-cols-3' : ''}`}>
      {/* Main Feed */}
      <div className={`space-y-6 ${SHOW_LEADERBOARD ? 'lg:col-span-2' : ''}`}>
        <div className="flex items-center justify-between">
          <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center">
            <Users className="h-6 w-6 mr-2" />
            Feed
          </h2>
          <p className="text-muted-foreground">Let's get inspired, share our styles and support each other</p>
          </div>
          <div className="flex items-center gap-2">
            {currentUserId && (
              <Button variant="outline" onClick={() => navigate(`/profile/${currentUserId}`)}>
                <UserCircle className="h-4 w-4 mr-2" />
                My profile
              </Button>
            )}
            <Button onClick={handleShowPostForm}>
              <Camera className="h-4 w-4 mr-2" />
              Share Outfit
            </Button>
          </div>
        </div>

        {!currentUserId && <GuestNudgeBanner />}

        

        {showPostForm && (
          <PostCreationForm
            onCreatePost={handleCreatePost}
            onClose={() => setShowPostForm(false)}
          />
        )}

        {showHint && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 flex items-start gap-3">
              <Lightbulb className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="flex-1 text-sm text-foreground">
                Can't decide what to wear? Ask. Someone's deciding too — help her back.
              </p>
              <button
                onClick={dismissHint}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Dismiss hint"
              >
                <X className="h-4 w-4" />
              </button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          {posts.length === 0 ? (
            <EmptyState onShareClick={handleShowPostForm} />
          ) : (
            posts.map((post) => {
              if (post.post_type === 'poll') {
                return (
                  <PollPostCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUserId}
                    onShare={handleShare}
                    onDelete={async (postId) => {
                      try {
                        await deletePost(postId);
                        toast({ title: "Post deleted", description: "Your post has been removed." });
                      } catch {
                        toast({ title: "Error", description: "Failed to delete post.", variant: "destructive" });
                      }
                    }}
                  />
                );
              }

              return (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUserId={currentUserId}
                  onToggleLike={toggleLike}
                  onShare={handleShare}
                  onDelete={async (postId) => {
                    try {
                      await deletePost(postId);
                      toast({ title: "Post deleted", description: "Your post has been removed." });
                    } catch {
                      toast({ title: "Error", description: "Failed to delete post.", variant: "destructive" });
                    }
                  }}
                  onUpdate={async (postId, updates) => {
                    await updatePost(postId, updates);
                  }}
                />
              );
            })
          )}

          {hasMore && posts.length > 0 && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </div>

      </div>


      {/* Sidebar */}
      {SHOW_LEADERBOARD && (
        <div className="space-y-6">
          <Leaderboard />
        </div>
      )}
    </div>
  );
};

export default CommunityFeed;

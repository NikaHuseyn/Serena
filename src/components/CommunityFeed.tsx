
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Users } from 'lucide-react';
import { useSocialPosts } from '@/hooks/useSocialPosts';
import PostCreationForm from './community/PostCreationForm';
import PostCard from './community/PostCard';
import EmptyState from './community/EmptyState';
import LoadingState from './community/LoadingState';
import ErrorState from './community/ErrorState';
import CommunityStats from './community/CommunityStats';
import Leaderboard from './community/Leaderboard';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const CommunityFeed = () => {
  const { posts, loading, error, createPost, toggleLike, deletePost } = useSocialPosts();
  const { toast } = useToast();
  const [showPostForm, setShowPostForm] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [stats, setStats] = useState({
    totalPosts: 0,
    totalLikes: 0,
    totalComments: 0,
    activeUsers: 0
  });
  const prevPostsLength = useRef(posts.length);

  // Fetch current user once
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id);
    });
  }, []);

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

  // Only re-fetch stats when posts count actually changes
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

  const handleCreatePost = async (postData: { caption: string; tags?: string[]; image_urls: string[] }): Promise<void> => {
    if (!currentUserId) {
      window.location.href = '/auth';
      return;
    }
    await createPost(postData);
    setShowPostForm(false);
  };

  const handleShowPostForm = () => {
    if (!currentUserId) {
      window.location.href = '/auth';
      return;
    }
    setShowPostForm(!showPostForm);
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Feed */}
      <div className="lg:col-span-2 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center">
              <Users className="h-6 w-6 mr-2" />
              Community Feed
            </h2>
            <p className="text-muted-foreground">Get inspired by the community and share your style</p>
          </div>
          <Button onClick={handleShowPostForm}>
            <Camera className="h-4 w-4 mr-2" />
            Share Outfit
          </Button>
        </div>

        <CommunityStats stats={stats} />

        {showPostForm && (
          <PostCreationForm
            onCreatePost={handleCreatePost}
            onClose={() => setShowPostForm(false)}
          />
        )}

        <div className="space-y-6">
          {posts.length === 0 ? (
            <EmptyState />
          ) : (
            posts.map((post) => (
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
              />
            ))
          )}
        </div>

        {posts.length > 0 && (
          <div className="text-center py-8">
            <Button variant="outline">
              Load More Posts
            </Button>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        <Leaderboard />
      </div>
    </div>
  );
};

export default CommunityFeed;

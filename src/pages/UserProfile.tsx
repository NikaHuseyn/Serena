import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import BottomNav from '@/components/BottomNav';
import FollowButton from '@/components/community/FollowButton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import LoadingState from '@/components/community/LoadingState';
import CampaignBadge from '@/components/community/CampaignBadge';

interface ProfileData {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  posts_count: number;
  followers_count: number;
  following_count: number;
}

interface PostThumb {
  id: string;
  image_urls: string[];
  created_at: string;
  campaign_id: string | null;
}

const PAGE_SIZE = 20;

const UserProfile = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<PostThumb[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id));
  }, []);

  const fetchPosts = useCallback(async (pageNum: number, append: boolean) => {
    if (!userId) return;
    if (append) setLoadingMore(true);
    const from = pageNum * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from('posts')
      .select('id, image_urls, created_at, campaign_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);
    const newPosts = (data || []) as PostThumb[];
    setHasMore(newPosts.length === PAGE_SIZE);
    setPage(pageNum);
    setPosts(prev => append ? [...prev, ...newPosts] : newPosts);
    setLoadingMore(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setNotFound(false);
    (async () => {
      const { data } = await supabase
        .from('social_profiles')
        .select('user_id, display_name, avatar_url, bio, posts_count, followers_count, following_count')
        .eq('user_id', userId)
        .maybeSingle();
      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setProfile(data as ProfileData);
      await fetchPosts(0, false);
      setLoading(false);
    })();
  }, [userId, fetchPosts]);

  if (loading) return (
    <div className="min-h-screen bg-background pt-14">
      <LoadingState />
      <BottomNav />
    </div>
  );

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-background pt-14">
        <main className="max-w-3xl mx-auto px-4 py-8 text-center">
          <p className="text-muted-foreground">Profile not found.</p>
        </main>
        <BottomNav />
      </div>
    );
  }

  const isOwn = currentUserId === profile.user_id;

  return (
    <div className="min-h-screen bg-background pt-14">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-start gap-6 sm:gap-10 mb-8">
          <Avatar className="h-20 w-20 sm:h-28 sm:w-28 flex-shrink-0">
            <AvatarImage src={profile.avatar_url || undefined} />
            <AvatarFallback className="text-2xl">
              {profile.display_name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
                {profile.display_name || 'Anonymous User'}
              </h1>
              {!isOwn && currentUserId && <FollowButton userId={profile.user_id} />}
            </div>
            <div className="flex gap-6 mb-3 text-sm">
              <div><span className="font-semibold">{profile.posts_count}</span> <span className="text-muted-foreground">posts</span></div>
              <div><span className="font-semibold">{profile.followers_count}</span> <span className="text-muted-foreground">followers</span></div>
              <div><span className="font-semibold">{profile.following_count}</span> <span className="text-muted-foreground">following</span></div>
            </div>
            {profile.bio && (
              <p className="text-sm text-foreground whitespace-pre-wrap">{profile.bio}</p>
            )}
          </div>
        </div>

        {/* Grid */}
        {posts.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">No posts yet.</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1 sm:gap-2">
              {posts.map(post => {
                const thumb = post.image_urls?.[0];
                return (
                  <button
                    key={post.id}
                    onClick={() => navigate(`/community?post=${post.id}`)}
                    className="relative aspect-square overflow-hidden bg-muted group"
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt="Post"
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                    <CampaignBadge campaignId={post.campaign_id} />
                  </button>
                );
              })}
            </div>
            {hasMore && (
              <div className="flex justify-center pt-6">
                <Button variant="outline" onClick={() => fetchPosts(page + 1, true)} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

export default UserProfile;

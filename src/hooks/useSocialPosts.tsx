
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBehaviorAnalytics } from './useBehaviorAnalytics';
import { useGuestNudge } from './useGuestNudge';

export interface SocialPost {
  id: string;
  user_id: string;
  image_urls: string[];
  caption: string | null;
  tags: string[] | null;
  brand_tags: string[] | null;
  mentioned_user_ids: string[] | null;
  location: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  post_type: string;
  occasion_context: string | null;
  poll_question: string | null;
  oracle_summary: string | null;
  oracle_summary_public: boolean;
  campaign_id: string | null;
  social_profiles: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  user_liked?: boolean;
}

export interface CreatePostData {
  caption: string;
  tags?: string[];
  image_urls: string[];
  post_type?: string;
  occasion_context?: string;
  poll_question?: string;
  mentioned_user_ids?: string[];
  brand_tags?: string[];
  location?: string | null;
}

export interface PostFilter {
  tag?: string;
  brand?: string;
}

const PAGE_SIZE = 20;

export const useSocialPosts = (filter?: PostFilter) => {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const { trackEvent } = useBehaviorAnalytics();
  const { requireAuth } = useGuestNudge();

  // Refs to remember what we've already loaded so loadMore doesn't re-query
  // the same profiles/likes for posts from earlier pages.
  const knownUserIdsRef = useRef<Set<string>>(new Set());
  const knownLikeStatusRef = useRef<Map<string, boolean>>(new Map());

  const fetchPage = useCallback(async (pageNum: number, append: boolean) => {
    const isReset = !append && pageNum === 0;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);
      if (filter?.tag) query = query.contains('tags', [filter.tag]);
      if (filter?.brand) query = query.contains('brand_tags', [filter.brand]);

      const { data: postsData, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const newPosts = postsData || [];
      const isLastPage = newPosts.length < PAGE_SIZE;

      // Reset bookkeeping on a fresh first-page load so filter changes start clean
      if (isReset) {
        knownUserIdsRef.current.clear();
        knownLikeStatusRef.current.clear();
      }

      // Only fetch profiles for users we haven't seen yet
      const missingUserIds = newPosts
        .map(p => p.user_id)
        .filter(uid => !knownUserIdsRef.current.has(uid));

      const profilesMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
      if (missingUserIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('social_profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', missingUserIds);

        profilesData?.forEach(profile => {
          profilesMap.set(profile.user_id, {
            display_name: profile.display_name,
            avatar_url: profile.avatar_url
          });
        });
      }

      // Only fetch likes for posts whose like-status we don't already know
      const postsNeedingLikeQuery = user
        ? newPosts.filter(p => !knownLikeStatusRef.current.has(p.id))
        : [];

      let likedPostIds = new Set<string>();
      if (user && postsNeedingLikeQuery.length > 0) {
        const postIds = postsNeedingLikeQuery.map(p => p.id);
        const { data: likesData } = await supabase
          .from('likes')
          .select('post_id')
          .in('post_id', postIds)
          .eq('user_id', user.id);
        likedPostIds = new Set(likesData?.map(like => like.post_id) || []);
      }

      const postsWithLikeStatus: SocialPost[] = newPosts.map(post => {
        let user_liked: boolean;
        if (knownLikeStatusRef.current.has(post.id)) {
          user_liked = knownLikeStatusRef.current.get(post.id)!;
        } else {
          user_liked = likedPostIds.has(post.id);
          knownLikeStatusRef.current.set(post.id, user_liked);
        }

        knownUserIdsRef.current.add(post.user_id);

        return {
          id: post.id,
          user_id: post.user_id,
          image_urls: post.image_urls || [],
          caption: post.caption,
          tags: post.tags,
          brand_tags: (post as any).brand_tags || [],
          mentioned_user_ids: (post as any).mentioned_user_ids || [],
          location: (post as any).location || null,
          likes_count: post.likes_count || 0,
          comments_count: post.comments_count || 0,
          created_at: post.created_at || new Date().toISOString(),
          post_type: (post as any).post_type || 'single',
          occasion_context: (post as any).occasion_context || null,
          poll_question: (post as any).poll_question || null,
          oracle_summary: (post as any).oracle_summary || null,
          oracle_summary_public: (post as any).oracle_summary_public || false,
          campaign_id: (post as any).campaign_id ?? null,
          social_profiles: profilesMap.get(post.user_id) || null,
          user_liked
        };
      });

      if (append) {
        setPosts(prev => [...prev, ...postsWithLikeStatus]);
      } else {
        setPosts(postsWithLikeStatus);
      }

      setHasMore(!isLastPage);
      setPage(pageNum);
      setError(null);
    } catch (err) {
      console.error('Error fetching posts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch posts');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter?.tag, filter?.brand]);

  const createPost = async (postData: CreatePostData): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const insertData: any = {
        user_id: user.id,
        caption: postData.caption,
        tags: postData.tags || [],
        image_urls: postData.image_urls,
        mentioned_user_ids: postData.mentioned_user_ids || [],
        brand_tags: postData.brand_tags || [],
        location: postData.location || null,
      };

      if (postData.post_type) insertData.post_type = postData.post_type;
      if (postData.occasion_context) insertData.occasion_context = postData.occasion_context;
      if (postData.poll_question) insertData.poll_question = postData.poll_question;

      const { data, error } = await supabase
        .from('posts')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      trackEvent({
        event_type: 'community_post_create',
        event_data: {
          post_id: data.id,
          post_type: postData.post_type || 'single',
          has_images: postData.image_urls.length > 0,
          caption_length: postData.caption.length
        }
      });

      fetchPage(0, false);
    } catch (err) {
      console.error('Error creating post:', err);
      throw err;
    }
  };

  const toggleLike = async (postId: string) => {
    try {
      const ok = await requireAuth('like posts');
      if (!ok) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const post = posts.find(p => p.id === postId);
      if (!post) return;

      if (post.user_liked) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .match({ post_id: postId, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('likes')
          .insert({ post_id: postId, user_id: user.id });
        if (error) throw error;
      }

      trackEvent({
        event_type: 'community_post_like',
        event_data: {
          post_id: postId,
          action: post.user_liked ? 'unlike' : 'like'
        }
      });

      const newLiked = !post.user_liked;
      knownLikeStatusRef.current.set(postId, newLiked);

      setPosts(prev => prev.map(p =>
        p.id === postId
          ? {
              ...p,
              user_liked: newLiked,
              likes_count: p.user_liked ? p.likes_count - 1 : p.likes_count + 1
            }
          : p
      ));
    } catch (err) {
      console.error('Error toggling like:', err);
    }
  };

  const deletePost = async (postId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Best-effort cleanup of the post's images in storage before deleting the row.
      // A storage failure here must NOT block the database deletion.
      const post = posts.find(p => p.id === postId);
      if (post?.image_urls?.length) {
        try {
          const marker = '/community-photos/';
          const paths = post.image_urls
            .map(url => {
              const idx = url.indexOf(marker);
              return idx >= 0 ? url.substring(idx + marker.length) : null;
            })
            .filter((p): p is string => Boolean(p));

          if (paths.length > 0) {
            const { error: storageError } = await supabase.storage
              .from('community-photos')
              .remove(paths);
            if (storageError) {
              console.error('Error removing post images from storage:', storageError);
            }
          }
        } catch (storageErr) {
          console.error('Storage cleanup threw during post delete:', storageErr);
        }
      }

      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', user.id);

      if (error) throw error;

      knownLikeStatusRef.current.delete(postId);
      knownUserIdsRef.current.delete(post.user_id);

      setPosts(prev => prev.filter(p => p.id !== postId));

      trackEvent({
        event_type: 'community_post_delete',
        event_data: { post_id: postId }
      });
    } catch (err) {
      console.error('Error deleting post:', err);
      throw err;
    }
  };

  const updatePost = async (
    postId: string,
    updates: {
      caption?: string;
      image_urls?: string[];
      tags?: string[];
      mentioned_user_ids?: string[];
      brand_tags?: string[];
      location?: string | null;
    }
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const patch: Record<string, unknown> = {};
      if (updates.caption !== undefined) patch.caption = updates.caption;
      if (updates.image_urls !== undefined) patch.image_urls = updates.image_urls;
      if (updates.tags !== undefined) patch.tags = updates.tags;
      if (updates.mentioned_user_ids !== undefined) patch.mentioned_user_ids = updates.mentioned_user_ids;
      if (updates.brand_tags !== undefined) patch.brand_tags = updates.brand_tags;
      if (updates.location !== undefined) patch.location = updates.location;

      const { error } = await supabase
        .from('posts')
        .update(patch)
        .eq('id', postId)
        .eq('user_id', user.id);

      if (error) throw error;

      setPosts(prev =>
        prev.map(p =>
          p.id === postId
            ? {
                ...p,
                caption: updates.caption !== undefined ? updates.caption : p.caption,
                image_urls: updates.image_urls !== undefined ? updates.image_urls : p.image_urls,
                tags: updates.tags !== undefined ? updates.tags : p.tags,
                mentioned_user_ids: updates.mentioned_user_ids !== undefined ? updates.mentioned_user_ids : p.mentioned_user_ids,
                brand_tags: updates.brand_tags !== undefined ? updates.brand_tags : p.brand_tags,
                location: updates.location !== undefined ? updates.location : p.location,
              }
            : p
        )
      );

      trackEvent({
        event_type: 'community_post_edit',
        event_data: {
          post_id: postId,
          caption_changed: updates.caption !== undefined,
          images_changed: updates.image_urls !== undefined,
        },
      });
    } catch (err) {
      console.error('Error updating post:', err);
      throw err;
    }
  };

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return;
    await fetchPage(page + 1, true);
  }, [fetchPage, loadingMore, loading, hasMore, page]);

  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  return {
    posts,
    loading,
    loadingMore,
    error,
    hasMore,
    createPost,
    toggleLike,
    deletePost,
    updatePost,
    refetch: () => fetchPage(0, false),
    loadMore,
  };
};

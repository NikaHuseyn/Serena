
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useGuestNudge } from '@/hooks/useGuestNudge';
import RichCaptionInput from './RichCaptionInput';
import { extractMentionedUserIds, type MentionMap } from '@/lib/captionParsing';

interface Comment {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface CommentSectionProps {
  postId: string;
  commentsCount: number;
}

const CommentSection = ({ postId, commentsCount }: CommentSectionProps) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [mentionMap, setMentionMap] = useState<MentionMap>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { requireAuth } = useGuestNudge();

  const fetchComments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch profiles for comment authors
      const userIds = [...new Set(data?.map(c => c.user_id) || [])];
      const { data: profiles } = await supabase
        .from('social_profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      setComments(
        (data || []).map(c => ({
          ...c,
          profile: profileMap.get(c.user_id) || null,
        }))
      );
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!expanded) return;
    fetchComments();

    const channel = supabase
      .channel(`comments:${postId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` },
        () => {
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [expanded, postId]);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    const ok = await requireAuth('post comments');
    if (!ok) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('comments')
        .insert({ post_id: postId, user_id: user.id, content: newComment.trim() })
        .select()
        .single();

      if (error) throw error;

      // Get profile for display
      const { data: profile } = await supabase
        .from('social_profiles')
        .select('user_id, display_name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();

      setComments(prev => [...prev, { ...data, profile }]);
      setNewComment('');
    } catch {
      toast.error('Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {commentsCount > 0
          ? `View ${commentsCount} comment${commentsCount !== 1 ? 's' : ''}`
          : 'Add a comment'}
      </button>
    );
  }

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      {loading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3 max-h-60 overflow-y-auto">
          {comments.map(comment => (
            <div key={comment.id} className="flex items-start gap-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={comment.profile?.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {comment.profile?.display_name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <span className="text-xs font-semibold text-foreground">
                    {comment.profile?.display_name || 'Anonymous'}
                  </span>
                  <p className="text-sm text-foreground">{comment.content}</p>
                </div>
                <span className="text-xs text-muted-foreground ml-1">
                  {new Date(comment.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
          {comments.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground text-center py-2">No comments yet</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder="Write a comment..."
          className="text-sm"
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
          disabled={submitting}
        />
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={submitting || !newComment.trim()}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

export default CommentSection;

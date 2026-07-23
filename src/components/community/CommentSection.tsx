
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useGuestNudge } from '@/hooks/useGuestNudge';
import RichCaptionInput from './RichCaptionInput';
import { extractMentionedUserIds, type MentionMap } from '@/lib/captionParsing';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const safeMentionMap = (value: unknown): MentionMap => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as MentionMap;
};

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
  postOwnerId?: string;
}

const CommentSection = ({ postId, commentsCount, postOwnerId }: CommentSectionProps) => {
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
    try {
      if (!newComment.trim()) return;
      const ok = await requireAuth('post comments');
      if (!ok) return;
      setSubmitting(true);

      let userId: string | undefined;
      let mentionedIds: string[] = [];

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        userId = user.id;

        try {
          mentionedIds = extractMentionedUserIds(newComment, safeMentionMap(mentionMap)).slice(0, 10);
        } catch (mentionError) {
          console.error('[CommentSection] failed to extract mentioned_user_ids; posting without tags:', mentionError);
          mentionedIds = [];
        }

        const { data, error } = await supabase
          .from('comments')
          .insert({
            post_id: postId,
            user_id: userId,
            content: newComment.trim(),
            mentioned_user_ids: mentionedIds,
          })
          .select()
          .single();

        if (error) throw error;

        // Get profile for display
        const { data: profile } = await supabase
          .from('social_profiles')
          .select('user_id, display_name, avatar_url')
          .eq('user_id', userId)
          .maybeSingle();

        setComments(prev => [...prev, { ...data, profile }]);
        setNewComment('');
        setMentionMap({});
      } catch (error: any) {
        const payload = { post_id: postId, user_id: userId, content: newComment.trim(), mentioned_user_ids: mentionedIds };
        console.error('Comment insert failed:', {
          message: error?.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
          payload,
          rawError: error,
        });
        toast.error('Failed to post comment');
      } finally {
        setSubmitting(false);
      }
    } catch (err) {
      console.error('[CommentSection] handleSubmit outer exception:', err, {
        newComment,
        mentionMap,
      });
      setSubmitting(false);
      toast.error('Failed to post comment');
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

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <RichCaptionInput
            value={newComment}
            onChange={(v, m) => {
              setNewComment(v);
              setMentionMap(safeMentionMap(m));
            }}
            mentionMap={safeMentionMap(mentionMap)}
            placeholder="Write a comment… try @username"
            rows={2}
          />
        </div>
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

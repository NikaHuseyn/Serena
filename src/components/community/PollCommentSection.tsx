
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, Loader2, ChevronDown, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

interface PollComment {
  id: string;
  content: string;
  user_id: string;
  option_index: number | null;
  created_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface PollCommentSectionProps {
  postId: string;
  optionCount: number;
  postOwnerId?: string;
}

const PollCommentSection = ({ postId, optionCount, postOwnerId }: PollCommentSectionProps) => {
  const [comments, setComments] = useState<PollComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [mentionMap, setMentionMap] = useState<MentionMap>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const handleDelete = async (commentId: string) => {
    try {
      const { error } = await supabase.from('outfit_comments').delete().eq('id', commentId);
      if (error) throw error;
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err: any) {
      console.error('Poll comment delete failed:', err);
      toast.error('Failed to delete comment');
    }
  };

  useEffect(() => {
    fetchComments();

    const channel = supabase
      .channel(`outfit_comments:${postId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'outfit_comments', filter: `post_id=eq.${postId}` },
        () => {
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId]);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('outfit_comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const userIds = [...new Set(data?.map(c => c.user_id) || [])];
      const { data: profiles } = await supabase
        .from('social_profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      setComments(
        (data || []).map(c => ({
          ...c,
          profile: profileMap.get(c.user_id) || undefined,
        }))
      );
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      if (!newComment.trim()) return;
      setSubmitting(true);

      let userId: string | undefined;
      const optionIdx: number | null = null;
      let mentionedIds: string[] = [];

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Please sign in to comment');
          return;
        }
        userId = user.id;

        try {
          mentionedIds = extractMentionedUserIds(newComment, safeMentionMap(mentionMap)).slice(0, 10);
        } catch (mentionError) {
          console.error('[PollCommentSection] failed to extract mentioned_user_ids; posting without tags:', mentionError);
          mentionedIds = [];
        }

        const { data, error } = await supabase
          .from('outfit_comments')
          .insert({
            post_id: postId,
            user_id: userId,
            content: newComment.trim(),
            option_index: optionIdx,
            mentioned_user_ids: mentionedIds,
          })
          .select()
          .single();

        if (error) throw error;

        const { data: profile } = await supabase
          .from('social_profiles')
          .select('user_id, display_name, avatar_url')
          .eq('user_id', userId)
          .maybeSingle();

        setComments(prev => [...prev, { ...data, profile: profile || undefined }]);
        setNewComment('');
        setMentionMap({});
        
      } catch (error: any) {
        const payload = { post_id: postId, user_id: userId, content: newComment.trim(), option_index: optionIdx, mentioned_user_ids: mentionedIds };
        console.error('Poll comment insert failed:', {
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
      console.error('[PollCommentSection] handleSubmit outer exception:', err, {
        newComment,
        mentionMap,
        selectedOption,
      });
      setSubmitting(false);
      toast.error('Failed to post comment');
    }
  };

  const visibleComments = showAll ? comments : comments.slice(0, 3);

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      {loading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {visibleComments.map(comment => {
              const canDelete = !!currentUserId && currentUserId === comment.user_id;
              return (
              <div key={comment.id} className="flex items-start gap-2 group">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={comment.profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">
                    {comment.profile?.display_name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {comment.profile?.display_name || 'Anonymous'}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{comment.content}</p>
                  </div>
                  <span className="text-xs text-muted-foreground ml-1">
                    {new Date(comment.created_at).toLocaleDateString()}
                  </span>
                </div>
                {canDelete && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        className="text-muted-foreground hover:text-destructive p-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
                        <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(comment.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
              );
            })}
            {comments.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground text-center py-2">No comments yet</p>
            )}
          </div>

          {!showAll && comments.length > 3 && (
            <button
              onClick={() => setShowAll(true)}
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              <ChevronDown className="h-3 w-3" />
              View all {comments.length} comments
            </button>
          )}
        </>
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

export default PollCommentSection;

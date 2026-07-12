
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Lock, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface OracleSummaryProps {
  postId: string;
  postUserId: string;
  currentUserId?: string;
  oracleSummary: string | null;
  oracleSummaryPublic: boolean;
  occasionContext: string | null;
  pollQuestion: string | null;
  voteCounts: Record<number, number>;
  optionCount: number;
}

const OracleSummary = ({
  postId,
  postUserId,
  currentUserId,
  oracleSummary,
  oracleSummaryPublic,
  occasionContext,
  voteCounts,
  optionCount,
}: OracleSummaryProps) => {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(oracleSummary);
  const [isPublic, setIsPublic] = useState(oracleSummaryPublic);

  const isAuthor = currentUserId === postUserId;

  // Non-authors only see public summaries
  if (!isAuthor && (!summary || !isPublic)) return null;

  const requestSummary = async () => {
    setLoading(true);
    try {
      // Fetch comments for context
      const { data: comments } = await supabase
        .from('outfit_comments')
        .select('content, option_index')
        .eq('post_id', postId);

      const votesSummary = Array.from({ length: optionCount }, (_, i) =>
        `Option ${i + 1}: ${voteCounts[i] || 0} votes`
      ).join(', ');

      const commentsSummary = (comments || [])
        .map(c => `${c.option_index !== null ? `[Option ${c.option_index + 1}] ` : ''}${c.content}`)
        .join('\n');

      const { data, error } = await supabase.functions.invoke('oracle-styling', {
        body: {
          action: 'community_summary',
          occasion: occasionContext || '',
          vote_summary: votesSummary,
          comments_text: commentsSummary,
          option_count: optionCount,
        },
      });

      if (error) throw error;

      const generatedSummary = data?.summary || 'Unable to generate summary at this time.';

      await supabase
        .from('posts')
        .update({ oracle_summary: generatedSummary })
        .eq('id', postId);

      setSummary(generatedSummary);
      toast.success('Serena summary generated!');
    } catch (err) {
      console.error('Error generating summary:', err);
      toast.error('Failed to generate summary');
    } finally {
      setLoading(false);
    }
  };

  const toggleVisibility = async (makePublic: boolean) => {
    try {
      await supabase
        .from('posts')
        .update({ oracle_summary_public: makePublic })
        .eq('id', postId);
      setIsPublic(makePublic);
      toast.success(makePublic ? 'Summary shared with community' : 'Summary set to private');
    } catch {
      toast.error('Failed to update visibility');
    }
  };

  if (!summary && isAuthor) {
    return (
      <div className="mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={requestSummary}
          disabled={loading}
          className="text-sm"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Ask Oracle to summarise feedback
            </>
          )}
        </Button>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="mt-3 p-4 rounded-lg bg-accent/30 border border-border">
      <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 text-primary" />
        Oracle says:
      </p>
      <p className="text-sm text-foreground leading-relaxed">{summary}</p>

      {isAuthor && (
        <div className="mt-3">
          {isPublic ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Globe className="h-3 w-3" />
              ✨ Shared with community
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <Button size="sm" variant="default" onClick={() => toggleVisibility(true)} className="text-xs h-7">
                Share with community
              </Button>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Visible only to you
                <button
                  onClick={() => toggleVisibility(true)}
                  className="text-primary hover:underline ml-1"
                >
                  Make public
                </button>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OracleSummary;

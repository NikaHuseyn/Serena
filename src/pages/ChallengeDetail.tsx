import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import BottomNav from '@/components/BottomNav';
import LoadingState from '@/components/LoadingState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Trophy } from 'lucide-react';
import PostCreationForm from '@/components/community/PostCreationForm';
import ChallengeCountdown from '@/components/community/ChallengeCountdown';
import ChallengeLeaderboard from '@/components/community/ChallengeLeaderboard';
import {
  getChallengeStatus,
  useChallenge,
  useUserChallengeEntry,
} from '@/hooks/useChallenges';
import { useGuestNudge } from '@/hooks/useGuestNudge';

const ChallengeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { campaign, loading } = useChallenge(id);
  const { entryPostId, refetch: refetchEntry } = useUserChallengeEntry(id);
  const { requireAuth } = useGuestNudge();
  const [showForm, setShowForm] = useState(false);
  const [submittingEntry, setSubmittingEntry] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-background pt-14">
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <LoadingState message="Loading challenge…" />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-background pt-14">
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-sm text-muted-foreground">Challenge not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/community')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to community
          </Button>
        </main>
        <BottomNav />
      </div>
    );
  }

  const status = getChallengeStatus(campaign);
  const canEnter = status.state === 'live';

  const handleEnterClick = async () => {
    if (entryPostId) {
      navigate(`/community?post=${entryPostId}`);
      return;
    }
    const ok = await requireAuth('enter this challenge');
    if (!ok) return;
    setShowForm(true);
  };

  const handleCreateEntry = async (postData: {
    caption: string;
    tags?: string[];
    image_urls: string[];
    post_type?: string;
    occasion_context?: string;
    poll_question?: string;
    mentioned_user_ids?: string[];
    brand_tags?: string[];
    location?: string | null;
  }) => {
    if (submittingEntry) return;
    setSubmittingEntry(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to enter');
        return;
      }

      const insertPayload: any = {
        user_id: user.id,
        caption: postData.caption,
        tags: postData.tags || [],
        image_urls: postData.image_urls,
        mentioned_user_ids: postData.mentioned_user_ids || [],
        brand_tags: postData.brand_tags || [],
        location: postData.location || null,
      };
      if (postData.post_type) insertPayload.post_type = postData.post_type;
      if (postData.occasion_context) insertPayload.occasion_context = postData.occasion_context;
      if (postData.poll_question) insertPayload.poll_question = postData.poll_question;

      const { data: postRow, error: postError } = await supabase
        .from('posts')
        .insert(insertPayload)
        .select('id')
        .single();
      if (postError) throw postError;

      const { error: entryError } = await supabase
        .from('challenge_entries')
        .insert({
          campaign_id: campaign.id,
          user_id: user.id,
          post_id: postRow.id,
        });

      if (entryError) {
        const msg = (entryError.message || '').toLowerCase();
        const isUnique = (entryError as any).code === '23505' || msg.includes('duplicate') || msg.includes('unique');
        if (isUnique) {
          toast.error("You've already entered this challenge");
        } else {
          toast.error('Failed to submit entry. Please try again.');
          console.error('Challenge entry insert failed:', entryError);
        }
        return;
      }

      toast.success('Entry submitted!');
      setShowForm(false);
      await refetchEntry();
    } catch (err) {
      console.error('Failed to create challenge entry:', err);
      toast.error('Failed to submit entry. Please try again.');
    } finally {
      setSubmittingEntry(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pt-14">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/community')} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Community
        </Button>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              {campaign.brand_logo_url ? (
                <img
                  src={campaign.brand_logo_url}
                  alt={campaign.brand_name}
                  className="h-10 w-10 rounded object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                  <Trophy className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {campaign.brand_name}
                </p>
                {campaign.title && (
                  <h1 className="text-xl font-bold text-foreground">{campaign.title}</h1>
                )}
              </div>
            </div>

            <ChallengeCountdown campaign={campaign} />

            {campaign.description && (
              <p className="text-sm text-foreground whitespace-pre-line">{campaign.description}</p>
            )}

            {campaign.prize_description && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-medium text-primary uppercase tracking-wide">Prize</p>
                <p className="text-sm text-foreground mt-1">{campaign.prize_description}</p>
              </div>
            )}

            {campaign.rules && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Rules
                </p>
                <p className="text-sm text-foreground whitespace-pre-line">{campaign.rules}</p>
              </div>
            )}

            <Button
              onClick={handleEnterClick}
              disabled={!canEnter && !entryPostId}
              className="w-full"
            >
              {entryPostId
                ? 'View my entry'
                : status.state === 'upcoming'
                ? 'Challenge not started yet'
                : status.state === 'ended'
                ? 'Challenge ended'
                : 'Enter challenge'}
            </Button>
          </CardContent>
        </Card>

        {showForm && !entryPostId && (
          <PostCreationForm onCreatePost={handleCreateEntry} onClose={() => setShowForm(false)} />
        )}

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Leaderboard
          </h2>
          <ChallengeLeaderboard campaignId={campaign.id} />
        </div>
      </main>
      <BottomNav />
    </div>
  );
};

export default ChallengeDetail;

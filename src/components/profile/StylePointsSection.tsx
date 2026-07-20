import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Sparkles, Gift, Trophy, Lock } from 'lucide-react';

const StylePointsSection = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['stylePointsSection'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const [profileRes, milestonesRes, achievementsRes] = await Promise.all([
        supabase.from('social_profiles').select('points_balance').eq('user_id', user.id).maybeSingle(),
        supabase.from('milestones_public').select('*').order('sort_order', { ascending: true }),
        supabase.from('milestone_achievements').select('milestone_id, achieved_at').eq('user_id', user.id),
      ]);

      return {
        balance: profileRes.data?.points_balance ?? 0,
        milestones: milestonesRes.data ?? [],
        achievements: achievementsRes.data ?? [],
      };
    },
  });

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="p-4 animate-pulse">
          <div className="h-6 bg-muted rounded w-1/4 mb-3" />
          <div className="h-3 bg-muted rounded w-full" />
        </CardContent>
      </Card>
    );
  }

  const { balance, milestones, achievements } = data;
  const achievedIds = new Set(achievements.map((a: any) => a.milestone_id));

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Style Points</span>
          </div>
          <span className="text-lg font-semibold text-foreground">{balance.toLocaleString()}</span>
        </div>

        <div className="space-y-3">
          {milestones.length === 0 && (
            <p className="text-sm text-muted-foreground">No milestones yet.</p>
          )}
          {milestones.map((m: any) => {
            const achieved = achievedIds.has(m.id);
            const pct = Math.min(100, Math.round((balance / Math.max(m.threshold, 1)) * 100));
            return (
              <div key={m.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    {achieved ? (
                      <Trophy className="h-3.5 w-3.5 text-primary" />
                    ) : m.revealed ? (
                      <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className={achieved ? 'text-primary font-medium' : 'text-foreground'}>
                      {m.name}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {balance.toLocaleString()} / {m.threshold.toLocaleString()}
                  </span>
                </div>

                <Progress value={pct} className="h-1.5" />

                <div className="text-xs text-muted-foreground">
                  {achieved ? (
                    <span className="text-primary font-medium">Achieved — reward coming</span>
                  ) : m.revealed ? (
                    <span>{Math.max(m.threshold - balance, 0).toLocaleString()} points to go</span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Gift className="h-3.5 w-3.5" />
                      Reward revealed soon
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default StylePointsSection;

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
        <CardContent className="p-6 animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-4" />
          <div className="h-4 bg-muted rounded w-2/3" />
        </CardContent>
      </Card>
    );
  }

  const { balance, milestones, achievements } = data;
  const achievedIds = new Set(achievements.map((a: any) => a.milestone_id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Style Points
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center py-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
          <div className="text-5xl font-bold text-foreground">{balance.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground mt-1">points earned</div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Milestones</h3>
          {milestones.length === 0 && (
            <p className="text-sm text-muted-foreground">No milestones yet.</p>
          )}
          {milestones.map((m: any) => {
            const achieved = achievedIds.has(m.id);
            const pct = Math.min(100, Math.round((balance / Math.max(m.threshold, 1)) * 100));
            return (
              <div
                key={m.id}
                className={`p-4 rounded-lg border ${
                  achieved
                    ? 'bg-primary/5 border-primary/30'
                    : 'bg-card border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {achieved ? (
                      <Trophy className="h-4 w-4 text-primary" />
                    ) : m.revealed ? (
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium text-foreground">{m.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {balance.toLocaleString()} / {m.threshold.toLocaleString()}
                  </span>
                </div>

                <Progress value={pct} className="h-2" />

                <div className="mt-3 flex items-center gap-2 text-sm">
                  {achieved ? (
                    <span className="text-primary font-medium">
                      🎉 Achieved — reward coming
                    </span>
                  ) : m.revealed ? (
                    <span className="text-muted-foreground">
                      {Math.max(m.threshold - balance, 0).toLocaleString()} points to go
                    </span>
                  ) : (
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Gift className="h-4 w-4" />
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

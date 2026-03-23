
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Award } from 'lucide-react';
import { useLeaderboard } from '@/hooks/useLeaderboard';

const Leaderboard = () => {
  const { leaderboard, loading, error } = useLeaderboard();

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 1:
        return <Medal className="h-5 w-5 text-muted-foreground" />;
      case 2:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="text-sm font-bold text-muted-foreground">#{index + 1}</span>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Style Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">Loading leaderboard...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Style Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-destructive">Failed to load leaderboard</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Style Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {leaderboard.map((entry, index) => (
            <div
              key={entry.user_id}
              className={`flex items-center justify-between p-3 rounded-lg ${
                index < 3 ? 'bg-accent/50 border border-border' : 'bg-muted'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8">
                  {getRankIcon(index)}
                </div>
                <Avatar className="h-10 w-10">
                  <AvatarImage src={entry.avatar_url || undefined} />
                  <AvatarFallback>
                    {entry.display_name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium text-foreground">
                    {entry.display_name || 'Anonymous User'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {entry.posts_count} posts • {entry.total_likes} likes
                  </div>
                </div>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="mb-1">
                  {entry.score} points
                </Badge>
                {entry.badge_count > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {entry.badge_count} badges
                  </div>
                )}
              </div>
            </div>
          ))}
          {leaderboard.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No users on the leaderboard yet. Be the first to post!
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default Leaderboard;

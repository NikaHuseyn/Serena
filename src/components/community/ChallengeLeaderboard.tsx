import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, Trophy } from 'lucide-react';
import { useChallengeLeaderboard } from '@/hooks/useChallenges';

interface Props {
  campaignId: string;
}

const ChallengeLeaderboard: React.FC<Props> = ({ campaignId }) => {
  const { rows, loading } = useChallengeLeaderboard(campaignId);
  const navigate = useNavigate();

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading leaderboard…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No entries yet. Be the first to enter this challenge.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const isTop3 = row.rank <= 3;
        return (
          <button
            key={row.entry_id}
            type="button"
            onClick={() => navigate(`/community?post=${row.post_id}`)}
            className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
              isTop3
                ? 'bg-primary/5 border-primary/30 hover:border-primary/50'
                : 'bg-background border-border hover:border-primary/40'
            }`}
          >
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm shrink-0 ${
                isTop3 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              }`}
            >
              {row.rank <= 3 ? <Trophy className="h-4 w-4" /> : row.rank}
            </div>
            {row.thumbnail_url ? (
              <img
                src={row.thumbnail_url}
                alt="Entry"
                className="h-12 w-12 rounded-md object-cover shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="h-12 w-12 rounded-md bg-muted shrink-0" />
            )}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={row.avatar_url ?? undefined} />
                <AvatarFallback>
                  {(row.display_name || '?').slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-foreground truncate">
                {row.display_name || 'Anonymous'}
              </span>
            </div>
            <div className="inline-flex items-center gap-1 text-sm text-muted-foreground shrink-0">
              <Heart className="h-4 w-4" />
              {row.like_count}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default ChallengeLeaderboard;

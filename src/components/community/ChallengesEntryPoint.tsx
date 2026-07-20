import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy } from 'lucide-react';
import { useActiveChallenges } from '@/hooks/useChallenges';
import ChallengeCountdown from './ChallengeCountdown';

const ChallengesEntryPoint: React.FC = () => {
  const { campaigns, loading } = useActiveChallenges();
  const navigate = useNavigate();

  if (loading || campaigns.length === 0) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Trophy className="h-4 w-4 text-primary" />
          Challenges
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate(`/community/challenges/${c.id}`)}
              className="text-left rounded-lg border border-border bg-background p-3 hover:border-primary/50 transition-colors space-y-2"
            >
              <div className="flex items-center gap-2">
                {c.brand_logo_url ? (
                  <img
                    src={c.brand_logo_url}
                    alt={c.brand_name}
                    className="h-6 w-6 rounded object-cover"
                  />
                ) : null}
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {c.brand_name}
                </span>
              </div>
              {c.title && <p className="text-sm font-semibold text-foreground">{c.title}</p>}
              {c.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>
              )}
              {c.prize_description && (
                <p className="text-xs text-foreground">
                  <span className="font-medium">Prize: </span>
                  {c.prize_description}
                </p>
              )}
              <ChallengeCountdown campaign={c} />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default ChallengesEntryPoint;

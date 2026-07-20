import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { getChallengeStatus, type Campaign } from '@/hooks/useChallenges';

interface Props {
  campaign: Pick<Campaign, 'starts_at' | 'ends_at'>;
  className?: string;
}

const formatRemaining = (ms: number): string => {
  if (ms <= 0) return '0m';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const ChallengeCountdown: React.FC<Props> = ({ campaign, className }) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const { state, target } = getChallengeStatus(campaign);
  if (state === 'ended') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground ${className || ''}`}>
        <Clock className="h-3.5 w-3.5" />
        Ended
      </span>
    );
  }
  if (!target) return null;
  const diff = new Date(target).getTime() - Date.now();
  const label = state === 'upcoming' ? `Starts in ${formatRemaining(diff)}` : `Ends in ${formatRemaining(diff)}`;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground ${className || ''}`}>
      <Clock className="h-3.5 w-3.5" />
      {label}
    </span>
  );
};

export default ChallengeCountdown;

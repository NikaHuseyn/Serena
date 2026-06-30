import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

const GuestNudgeBanner = () => {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
      <div className="flex items-start gap-2 text-sm">
        <Sparkles className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        <p className="text-muted-foreground">
          <span className="text-foreground font-medium">Browsing as a guest.</span>{' '}
          Sign in to like, vote, comment and share your own outfits.
        </p>
      </div>
      <Button size="sm" onClick={() => navigate('/auth')}>
        Sign in
      </Button>
    </div>
  );
};

export default GuestNudgeBanner;

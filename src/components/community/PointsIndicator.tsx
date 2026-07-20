import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

const PointsIndicator = () => {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('social_profiles')
        .select('points_balance')
        .eq('user_id', user.id)
        .maybeSingle();
      if (active) setBalance(data?.points_balance ?? 0);
    })();
    return () => { active = false; };
  }, []);

  if (balance === null) return null;

  return (
    <Badge variant="secondary" className="flex items-center gap-1">
      <Sparkles className="h-3 w-3 text-primary" />
      <span className="font-medium">{balance.toLocaleString()}</span>
    </Badge>
  );
};

export default PointsIndicator;

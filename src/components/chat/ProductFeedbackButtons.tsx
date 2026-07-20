import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { Heart, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

export type Verdict = 'save' | 'not_for_me';

interface FeedbackCtxValue {
  userId: string | null;
  verdicts: Record<string, Verdict>;
  setVerdict: (productRef: string, verdict: Verdict) => void;
}

const FeedbackCtx = createContext<FeedbackCtxValue>({
  userId: null,
  verdicts: {},
  setVerdict: () => {},
});

/** Extract the raw retailer URL from a product_url. If it's a tracked
 *  /functions/v1/go link, return the pid query param; else return as-is. */
export const extractProductRef = (productUrl?: string): string | null => {
  if (!productUrl) return null;
  try {
    const u = new URL(productUrl);
    if (u.pathname.includes('/functions/v1/go') || u.pathname.endsWith('/go')) {
      const pid = u.searchParams.get('pid');
      if (pid) return pid;
    }
  } catch {
    /* not a valid URL, fall through */
  }
  return productUrl;
};

export const ProductFeedbackProvider: React.FC<{ children: React.ReactNode; productRefs: string[] }> = ({
  children,
  productRefs,
}) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});

  // Stabilise the refs list so effects don't loop on every render
  const refsKey = useMemo(() => Array.from(new Set(productRefs)).sort().join('|'), [productRefs]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (!uid || !refsKey) return;
      const refs = refsKey.split('|').filter(Boolean);
      if (refs.length === 0) return;
      const { data, error } = await supabase
        .from('product_feedback')
        .select('product_ref, verdict')
        .eq('user_id', uid)
        .in('product_ref', refs);
      if (cancelled || error || !data) return;
      const map: Record<string, Verdict> = {};
      for (const row of data) {
        if (row.verdict === 'save' || row.verdict === 'not_for_me') {
          map[row.product_ref] = row.verdict;
        }
      }
      setVerdicts(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [refsKey]);

  const setVerdict = useCallback(
    (productRef: string, verdict: Verdict) => {
      if (!userId || !productRef) return;
      setVerdicts((prev) => ({ ...prev, [productRef]: verdict }));
      supabase
        .from('product_feedback')
        .upsert(
          { user_id: userId, product_ref: productRef, verdict },
          { onConflict: 'user_id,product_ref' },
        )
        .then(({ error }) => {
          if (error) console.warn('product_feedback upsert failed:', error);
        });
    },
    [userId],
  );

  return (
    <FeedbackCtx.Provider value={{ userId, verdicts, setVerdict }}>{children}</FeedbackCtx.Provider>
  );
};

interface ButtonsProps {
  productUrl?: string;
  variant?: 'overlay' | 'inline';
}

export const ProductFeedbackButtons: React.FC<ButtonsProps> = ({ productUrl, variant = 'inline' }) => {
  const { userId, verdicts, setVerdict } = useContext(FeedbackCtx);
  const productRef = extractProductRef(productUrl);
  if (!userId || !productRef) return null;

  const current = verdicts[productRef];

  const handle = (e: React.MouseEvent, v: Verdict) => {
    e.preventDefault();
    e.stopPropagation();
    setVerdict(productRef, v);
  };

  const containerCls =
    variant === 'overlay'
      ? 'absolute top-1.5 right-1.5 flex items-center gap-1 z-10'
      : 'flex items-center gap-1 flex-shrink-0';

  const btnBase =
    variant === 'overlay'
      ? 'h-7 w-7 rounded-full bg-background/90 backdrop-blur border border-border flex items-center justify-center hover:bg-background transition-colors'
      : 'h-6 w-6 rounded-md flex items-center justify-center hover:bg-muted transition-colors';

  return (
    <div className={containerCls}>
      <button
        type="button"
        aria-label="Save"
        aria-pressed={current === 'save'}
        onClick={(e) => handle(e, 'save')}
        className={cn(btnBase, current === 'save' && 'text-rose-500')}
      >
        <Heart className={cn('h-3.5 w-3.5', current === 'save' && 'fill-current')} />
      </button>
      <button
        type="button"
        aria-label="Not for me"
        aria-pressed={current === 'not_for_me'}
        onClick={(e) => handle(e, 'not_for_me')}
        className={cn(btnBase, current === 'not_for_me' && 'text-foreground bg-muted')}
      >
        <X className="h-3.5 w-3.5" strokeWidth={current === 'not_for_me' ? 3 : 2} />
      </button>
    </div>
  );
};

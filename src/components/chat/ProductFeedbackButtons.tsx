import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Heart, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

export type Verdict = 'save' | 'not_for_me';

interface FeedbackCtxValue {
  userId: string | null;
  verdicts: Record<string, Verdict | null>;
  loadVerdict: (productRef: string) => void;
  setVerdict: (productRef: string, verdict: Verdict) => void;
}

const FeedbackCtx = createContext<FeedbackCtxValue>({
  userId: null,
  verdicts: {},
  loadVerdict: () => {},
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
    /* not a URL — fall through */
  }
  return productUrl;
};

export const ProductFeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict | null>>({});
  const [requested, setRequested] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setUserId(session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loadVerdict = useCallback(
    (productRef: string) => {
      if (!userId || !productRef) return;
      if (requested.has(productRef)) return;
      requested.add(productRef);
      setRequested(new Set(requested));
      supabase
        .from('product_feedback')
        .select('verdict')
        .eq('user_id', userId)
        .eq('product_ref', productRef)
        .maybeSingle()
        .then(({ data }) => {
          const v = (data?.verdict === 'save' || data?.verdict === 'not_for_me') ? data.verdict : null;
          setVerdicts((prev) => ({ ...prev, [productRef]: v }));
        });
    },
    [userId, requested],
  );

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
    <FeedbackCtx.Provider value={{ userId, verdicts, loadVerdict, setVerdict }}>
      {children}
    </FeedbackCtx.Provider>
  );
};

interface ButtonsProps {
  productUrl?: string;
  variant?: 'overlay' | 'inline';
}

export const ProductFeedbackButtons: React.FC<ButtonsProps> = ({ productUrl, variant = 'inline' }) => {
  const { userId, verdicts, loadVerdict, setVerdict } = useContext(FeedbackCtx);
  const productRef = extractProductRef(productUrl);

  useEffect(() => {
    if (userId && productRef) loadVerdict(productRef);
  }, [userId, productRef, loadVerdict]);

  if (!userId || !productRef) return null;

  const current = verdicts[productRef] ?? null;

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

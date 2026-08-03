import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { normaliseHandle } from '@/lib/captionParsing';
import { useGuestNudge } from '@/hooks/useGuestNudge';

interface Person {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface PeopleSearchProps {
  isSignedIn: boolean;
}

const PeopleSearch = ({ isSignedIn }: PeopleSearchProps) => {
  const navigate = useNavigate();
  const { requireAuth } = useGuestNudge();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const bare = q.replace(/[._\s-]+/g, '');
      const escape = (s: string) => s.replace(/[,()]/g, '');
      const { data, error } = await supabase
        .from('social_profiles')
        .select('user_id, display_name, avatar_url')
        .not('display_name', 'is', null)
        .or(`display_name.ilike.%${escape(q)}%,display_name.ilike.%${escape(bare)}%`)
        .limit(8);
      if (cancelled) return;
      if (error) console.warn('people search failed:', error);
      const bareQ = bare.toLowerCase();
      setResults(
        (data || []).filter((p) => {
          const dn = (p.display_name || '').toLowerCase();
          const handle = normaliseHandle(p.display_name || '').toLowerCase();
          return dn.includes(q.toLowerCase()) || handle.includes(bareQ);
        }),
      );
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setLoading(false);
    };
  }, [query, isSignedIn]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (!isSignedIn) void requireAuth('search for people');
          }}
          readOnly={!isSignedIn}
          placeholder={isSignedIn ? 'Search people by name' : 'Sign in to search people'}
          aria-label="Search people"
          className="pl-9 rounded-full bg-muted/40 border-border/60"
        />
      </div>

      {isSignedIn && query.trim() && (
        <div className="absolute z-30 mt-2 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          {loading && results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">No people found.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto p-1">
              {results.map((p) => (
                <button
                  key={p.user_id}
                  type="button"
                  onClick={() => {
                    setQuery('');
                    navigate(`/profile/${p.user_id}`);
                  }}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-left hover:bg-accent"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={p.avatar_url || undefined} />
                    <AvatarFallback>{(p.display_name || 'U').charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">{p.display_name || 'User'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PeopleSearch;

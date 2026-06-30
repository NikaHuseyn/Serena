import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';

interface LocationInputProps {
  value: string;
  onChange: (v: string) => void;
}

interface Suggestion {
  display: string;
  short: string;
}

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;

const LocationInput = ({ value, onChange }: LocationInputProps) => {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(!!value);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const [dropdownWidth, setDropdownWidth] = useState<number>();

  const syncDropdownWidth = useCallback(() => {
    setDropdownWidth(boxRef.current?.getBoundingClientRect().width);
  }, []);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    syncDropdownWidth();
    window.addEventListener('resize', syncDropdownWidth);
    return () => window.removeEventListener('resize', syncDropdownWidth);
  }, [syncDropdownWidth]);

  useEffect(() => {
    if (picked) {
      setLoading(false);
      return;
    }

    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      abortRef.current?.abort();
      setSuggestions([]);
      setLoading(false);
      setOpen(false);
      return;
    }

    syncDropdownWidth();
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();

    const handle = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setOpen(true);
      try {
        // Server-side proxy to Photon (Komoot) — bypasses any client CSP/CORS quirks.
        const { data, error } = await supabase.functions.invoke('geocode-location', {
          body: { q },
        });
        if (ctrl.signal.aborted) return;
        if (requestId !== requestIdRef.current) return;
        if (error) throw error;
        const incoming: Suggestion[] = Array.isArray(data?.suggestions)
          ? data!.suggestions
          : [];
        const seen = new Set<string>();
        const deduped = incoming.filter((i) =>
          seen.has(i.short) ? false : (seen.add(i.short), true),
        );
        setSuggestions(deduped);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Location search failed:', err);
          setSuggestions([]);
          setOpen(true);
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(handle);
      abortRef.current?.abort();
    };
  }, [query, picked, syncDropdownWidth]);

  const select = (s: Suggestion) => {
    onChange(s.short);
    setQuery(s.short);
    setPicked(true);
    setOpen(false);
  };

  const clear = () => {
    onChange('');
    setQuery('');
    setPicked(false);
    setSuggestions([]);
    setOpen(false);
  };

  const trimmedQuery = query.trim();
  const showDropdown = open && !picked && trimmedQuery.length >= MIN_QUERY_LENGTH;

  return (
    <Popover open={showDropdown} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={boxRef} className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => {
              const v = e.target.value.slice(0, 100);
              setQuery(v);
              setPicked(false);
              onChange(v);
              syncDropdownWidth();
              setOpen(v.trim().length >= MIN_QUERY_LENGTH);
            }}
            onFocus={() => {
              syncDropdownWidth();
              if (trimmedQuery.length >= MIN_QUERY_LENGTH && !picked) setOpen(true);
            }}
            placeholder="Add location (start typing…)"
            className="pl-9 pr-9"
            maxLength={100}
            autoComplete="off"
          />
          {loading && (
            <Loader2 className="absolute right-9 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
          )}
          {query && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Clear location"
              onClick={clear}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="z-[80] p-0 overflow-hidden shadow-lg"
        style={{ width: dropdownWidth }}
      >
        <div className="max-h-64 overflow-y-auto py-1">
          {loading && suggestions.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching locations…
            </div>
          )}

          {suggestions.map((s, i) => (
            <button
              key={s.display + i}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                select(s);
              }}
              className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-start gap-2"
            >
              <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.short}</div>
                <div className="truncate text-xs text-muted-foreground">{s.display}</div>
              </div>
            </button>
          ))}

          {!loading && suggestions.length === 0 && (
            <div className="px-3 py-3 text-sm text-muted-foreground">No locations found</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default LocationInput;

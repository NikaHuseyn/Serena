import React, { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LocationInputProps {
  value: string;
  onChange: (v: string) => void;
}

interface Suggestion {
  display: string;
  short: string;
}

const LocationInput = ({ value, onChange }: LocationInputProps) => {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(!!value);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (picked) return;
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        // Photon (Komoot) — CORS-friendly, no preflight, no API key
        const res = await fetch(
          `https://photon.komoot.io/api/?lang=en&limit=6&q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal }
        );
        if (!res.ok) throw new Error('search failed');
        const json = await res.json();
        const features: Array<{ properties: Record<string, string> }> = json.features || [];
        const items: Suggestion[] = features.map((f) => {
          const p = f.properties || {};
          const venue = p.name;
          const city = p.city || p.town || p.village || p.locality || p.county;
          const region = p.state;
          const country = p.country;
          const parts = [venue, city, region, country].filter(Boolean);
          const unique = Array.from(new Set(parts));
          const short = unique.slice(0, 3).join(', ') || (venue ?? '');
          const display = unique.join(', ');
          return { display: display || short, short: short || display };
        }).filter((i) => i.short);
        const seen = new Set<string>();
        const deduped = items.filter((i) => (seen.has(i.short) ? false : (seen.add(i.short), true)));
        setSuggestions(deduped);
        setOpen(deduped.length > 0);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Location search failed:', err);
          setSuggestions([]);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, picked]);

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
  };

  return (
    <div ref={boxRef} className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        value={query}
        onChange={(e) => {
          const v = e.target.value.slice(0, 100);
          setQuery(v);
          setPicked(false);
          onChange(v);
          if (v.trim().length >= 2) setOpen(true);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder="Add location (start typing…)"
        className="pl-9 pr-9"
        maxLength={100}
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
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md max-h-64 overflow-y-auto">
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
        </div>
      )}
    </div>
  );
};

export default LocationInput;

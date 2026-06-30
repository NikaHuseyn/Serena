import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tag, X, Plus, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Brand {
  id: string;
  name: string;
  slug: string;
}

interface BrandPickerProps {
  value: string[]; // slugs
  onChange: (slugs: string[]) => void;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const BrandPicker = ({ value, onChange }: BrandPickerProps) => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('brands').select('id, name, slug').order('name');
      setBrands(data || []);
    })();
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const bySlug = useMemo(() => new Map(brands.map((b) => [b.slug, b])), [brands]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return brands.filter((b) => !value.includes(b.slug)).slice(0, 8);
    return brands
      .filter((b) => !value.includes(b.slug) && b.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [brands, query, value]);

  const exactExists = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const s = slugify(q);
    return brands.some((b) => b.slug === s) || value.includes(s);
  }, [query, brands, value]);

  const add = (slug: string) => {
    if (!value.includes(slug)) onChange([...value, slug]);
    setQuery('');
    inputRef.current?.focus();
  };

  const remove = (slug: string) => onChange(value.filter((s) => s !== slug));

  const addCustom = async () => {
    const name = query.trim();
    if (!name) return;
    const slug = slugify(name);
    if (!slug) return;
    // Try to persist; ignore failures (e.g. guests) and still tag locally
    const { data } = await supabase
      .from('brands')
      .upsert({ name, slug }, { onConflict: 'slug' })
      .select('id, name, slug')
      .maybeSingle();
    if (data) {
      setBrands((prev) => (prev.some((b) => b.slug === data.slug) ? prev : [...prev, data].sort((a, b) => a.name.localeCompare(b.name))));
    }
    add(slug);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[0]) add(filtered[0].slug);
      else if (query.trim()) addCustom();
    } else if (e.key === 'Backspace' && !query && value.length > 0) {
      remove(value[value.length - 1]);
    }
  };

  return (
    <div ref={boxRef} className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Tag className="h-3.5 w-3.5" />
        Tag brands
        {value.length > 0 && <span className="text-muted-foreground font-normal">({value.length})</span>}
      </div>

      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5 min-h-10 px-2 py-1.5 rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
          {value.map((slug) => {
            const b = bySlug.get(slug);
            return (
              <Badge key={slug} variant="secondary" className="gap-1">
                {b?.name || slug}
                <button
                  type="button"
                  aria-label={`Remove ${b?.name || slug}`}
                  onClick={() => remove(slug)}
                  className="hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
          <div className="relative flex-1 min-w-[120px] flex items-center">
            <Search className="h-3.5 w-3.5 text-muted-foreground mr-1.5 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder={value.length === 0 ? 'Search or add a brand…' : 'Add another…'}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground py-0.5"
            />
          </div>
        </div>

        {open && (filtered.length > 0 || (query.trim() && !exactExists)) && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md max-h-56 overflow-y-auto">
            {filtered.map((b) => (
              <button
                key={b.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(b.slug);
                }}
                className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center justify-between"
              >
                <span>{b.name}</span>
                <span className="text-xs text-muted-foreground">Tag</span>
              </button>
            ))}
            {query.trim() && !exactExists && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addCustom();
                }}
                className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center gap-2 border-t border-border"
              >
                <Plus className="h-3.5 w-3.5" />
                Add "<span className="font-medium">{query.trim()}</span>" as a new brand
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BrandPicker;

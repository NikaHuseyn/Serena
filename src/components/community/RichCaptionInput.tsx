import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Smile } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { normaliseHandle, type MentionMap } from '@/lib/captionParsing';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

interface Suggestion {
  id: string;
  label: string;
  sublabel?: string;
  avatar_url?: string | null;
}

interface RichCaptionInputProps {
  value: string;
  onChange: (value: string, mentionMap: MentionMap) => void;
  mentionMap: MentionMap;
  placeholder?: string;
  rows?: number;
}

const RichCaptionInput = ({
  value,
  onChange,
  mentionMap,
  placeholder,
  rows = 3,
}: RichCaptionInputProps) => {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [trigger, setTrigger] = useState<{ kind: '@' | '#'; query: string; start: number } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const detectTrigger = useCallback((text: string, caret: number) => {
    // walk back from caret looking for '@' or '#' delimited by whitespace/start
    let i = caret - 1;
    while (i >= 0) {
      const ch = text[i];
      if (ch === '@' || ch === '#') {
        const before = i === 0 ? ' ' : text[i - 1];
        if (/\s/.test(before) || i === 0) {
          const query = text.slice(i + 1, caret);
          if (/^[\p{L}\p{N}_.]*$/u.test(query)) {
            return { kind: ch as '@' | '#', query, start: i };
          }
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
      i--;
    }
    return null;
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next, mentionMap);
    const caret = e.target.selectionStart ?? next.length;
    setTrigger(detectTrigger(next, caret));
    setActiveIndex(0);
  };

  const handleSelectChange = () => {
    const ta = taRef.current;
    if (!ta) return;
    setTrigger(detectTrigger(ta.value, ta.selectionStart ?? ta.value.length));
  };

  // Fetch suggestions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!trigger) {
        setSuggestions([]);
        return;
      }
      if (trigger.kind === '@') {
        const q = trigger.query.trim();
        const builder = supabase
          .from('social_profiles')
          .select('user_id, display_name, avatar_url')
          .not('display_name', 'is', null)
          .limit(6);
        if (q) builder.ilike('display_name', `${q}%`);
        const { data } = await builder;
        if (cancelled) return;
        setSuggestions(
          (data || []).map((p) => ({
            id: p.user_id,
            label: p.display_name || 'User',
            sublabel: '@' + normaliseHandle(p.display_name || ''),
            avatar_url: p.avatar_url,
          })),
        );
      } else {
        // hashtag suggestions from existing posts.tags
        const { data } = await supabase
          .from('posts')
          .select('tags')
          .not('tags', 'is', null)
          .limit(200);
        if (cancelled) return;
        const counts = new Map<string, number>();
        (data || []).forEach((row: { tags: string[] | null }) => {
          (row.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
        });
        const q = trigger.query.trim().toLowerCase();
        const items = [...counts.entries()]
          .filter(([t]) => (q ? t.startsWith(q) : true))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([t, n]) => ({ id: t, label: '#' + t, sublabel: `${n} post${n === 1 ? '' : 's'}` }));
        setSuggestions(items);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trigger]);

  const applySuggestion = (s: Suggestion) => {
    if (!trigger || !taRef.current) return;
    const ta = taRef.current;
    const before = value.slice(0, trigger.start);
    const after = value.slice((ta.selectionStart ?? value.length));
    let insertText: string;
    let nextMap = mentionMap;
    if (trigger.kind === '@') {
      const handle = normaliseHandle(s.label);
      insertText = '@' + handle + ' ';
      nextMap = { ...mentionMap, [handle]: s.id };
    } else {
      insertText = '#' + s.id + ' ';
    }
    const next = before + insertText + after;
    onChange(next, nextMap);
    setTrigger(null);
    setSuggestions([]);
    requestAnimationFrame(() => {
      const pos = (before + insertText).length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!trigger || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      applySuggestion(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setTrigger(null);
    }
  };

  const insertAtCaret = (text: string) => {
    const ta = taRef.current;
    if (!ta) {
      onChange(value + text, mentionMap);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next, mentionMap);
    requestAnimationFrame(() => {
      const pos = start + text.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const showPopover = !!trigger && suggestions.length > 0;

  return (
    <div className="relative">
      <Popover open={showPopover}>
        <PopoverTrigger asChild>
          <div>
            <Textarea
              ref={taRef}
              value={value}
              onChange={handleChange}
              onKeyDown={onKeyDown}
              onSelect={handleSelectChange}
              onClick={handleSelectChange}
              placeholder={placeholder}
              rows={rows}
              maxLength={2000}
            />
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="p-1 w-72"
          align="start"
          side="bottom"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-64 overflow-y-auto">
            {suggestions.map((s, i) => (
              <button
                key={s.id + i}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(s);
                }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover:bg-accent ${
                  i === activeIndex ? 'bg-accent' : ''
                }`}
              >
                {trigger?.kind === '@' && (
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={s.avatar_url || undefined} />
                    <AvatarFallback>{s.label.charAt(0)}</AvatarFallback>
                  </Avatar>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.label}</div>
                  {s.sublabel && (
                    <div className="truncate text-xs text-muted-foreground">{s.sublabel}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="mt-1.5 flex justify-end">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-foreground" aria-label="Add emoji">
              <Smile className="h-4 w-4 mr-1" />
              <span className="text-xs">Emoji</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="p-0 border-0 w-auto shadow-lg"
            align="end"
            side="top"
            sideOffset={6}
            collisionPadding={12}
          >
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading…</div>}>
              <EmojiPicker
                onEmojiClick={(d) => insertAtCaret(d.emoji)}
                width={280}
                height={320}
                searchDisabled={false}
                skinTonesDisabled
                previewConfig={{ showPreview: false }}
                lazyLoadEmojis
              />
            </Suspense>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default RichCaptionInput;

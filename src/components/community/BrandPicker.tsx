import React, { useEffect, useState } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tag, X, ChevronsUpDown } from 'lucide-react';
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

const BrandPicker = ({ value, onChange }: BrandPickerProps) => {
  const [open, setOpen] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('brands').select('id, name, slug').order('name');
      setBrands(data || []);
    })();
  }, []);

  const byslug = new Map(brands.map((b) => [b.slug, b]));
  const toggle = (slug: string) => {
    if (value.includes(slug)) onChange(value.filter((s) => s !== slug));
    else onChange([...value, slug]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5" />
          Tag brands {value.length > 0 && <span className="text-muted-foreground">({value.length})</span>}
        </span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-primary">
              <ChevronsUpDown className="h-3.5 w-3.5 mr-1" />
              {value.length === 0 ? 'Add brands' : 'Edit'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-72" align="end">
            <Command>
              <CommandInput placeholder="Search brands…" />
              <CommandList>
                <CommandEmpty>No brand found.</CommandEmpty>
                <CommandGroup>
                  {brands.map((b) => {
                    const selected = value.includes(b.slug);
                    return (
                      <CommandItem
                        key={b.id}
                        value={b.name}
                        onSelect={() => toggle(b.slug)}
                      >
                        <span className="flex-1">{b.name}</span>
                        {selected && <span className="text-xs text-primary">Selected</span>}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((slug) => {
            const b = byslug.get(slug);
            return (
              <Badge key={slug} variant="secondary" className="gap-1">
                {b?.name || slug}
                <button
                  type="button"
                  aria-label={`Remove ${b?.name || slug}`}
                  onClick={() => toggle(slug)}
                  className="hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BrandPicker;

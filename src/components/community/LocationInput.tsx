import React from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LocationInputProps {
  value: string;
  onChange: (v: string) => void;
}

const LocationInput = ({ value, onChange }: LocationInputProps) => {
  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 100))}
        placeholder="Add location (e.g. London, UK)"
        className="pl-9 pr-9"
        maxLength={100}
      />
      {value && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Clear location"
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
};

export default LocationInput;

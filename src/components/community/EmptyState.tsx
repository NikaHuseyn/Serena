
import React from 'react';
import { Users } from 'lucide-react';

interface EmptyStateProps {
  onShareClick?: () => void;
}

const EmptyState = ({ onShareClick }: EmptyStateProps) => {
  return (
    <div className="text-center py-12">
      <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="text-lg font-medium text-foreground mb-2">Can't decide what to wear? Ask. Someone's deciding too — help her back.</h3>
      {onShareClick && (
        <button
          onClick={onShareClick}
          className="text-sm font-medium text-primary hover:underline"
        >
          Share your outfits →
        </button>
      )}
    </div>
  );
};

export default EmptyState;


import React from 'react';
import { Users } from 'lucide-react';

interface EmptyStateProps {
  onShareClick?: () => void;
}

const EmptyState = ({ onShareClick }: EmptyStateProps) => {
  return (
    <div className="text-center py-12">
      <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="text-lg font-medium text-foreground mb-2">No outfits shared yet</h3>
      <p className="text-muted-foreground mb-4">Be the first to ask the community for feedback on your next look</p>
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

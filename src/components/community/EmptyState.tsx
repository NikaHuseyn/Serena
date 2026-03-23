
import React from 'react';
import { Users } from 'lucide-react';

const EmptyState = () => {
  return (
    <div className="text-center py-12">
      <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="text-lg font-medium text-foreground mb-2">No posts yet</h3>
      <p className="text-muted-foreground">Be the first to share your style with the community!</p>
    </div>
  );
};

export default EmptyState;

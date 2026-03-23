
import React from 'react';

import BottomNav from '@/components/BottomNav';
import CommunityFeed from '@/components/CommunityFeed';

const Community = () => {
  return (
    <div className="min-h-screen bg-background pt-14">
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Community</h1>
          <p className="text-muted-foreground">
            Connect with fellow style enthusiasts, share your outfits, and get inspired
          </p>
        </div>

        <CommunityFeed />
      </main>
      <BottomNav />
    </div>
  );
};

export default Community;

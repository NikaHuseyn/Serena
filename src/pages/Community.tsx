
import React from 'react';

import BottomNav from '@/components/BottomNav';
import CommunityFeed from '@/components/CommunityFeed';
import ChallengesEntryPoint from '@/components/community/ChallengesEntryPoint';

const Community = () => {
  return (
    <div className="min-h-screen bg-background pt-14">
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-5">
          <p className="text-sm text-muted-foreground max-w-[65ch]">
            Share your outfit, say where you're going, and get honest feedback from women who get it. This is where "which one should I wear?" gets answered.
          </p>
        </div>

        <div className="mb-6">
          <ChallengesEntryPoint />
        </div>

        <CommunityFeed />
      </main>
      <BottomNav />
    </div>
  );
};

export default Community;



import React, { useState } from 'react';
import BottomNav from '@/components/BottomNav';
import WardrobeManager from '@/components/WardrobeManager';
import CapsuleManager from '@/components/CapsuleManager';
import AuthGuard from '@/components/AuthGuard';
import { Button } from '@/components/ui/button';
import { Package, Shirt } from 'lucide-react';

const Wardrobe = () => {
  const [activeTab, setActiveTab] = useState<'items' | 'capsules'>('items');

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-pink-50 pt-14">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <div className="flex space-x-1 bg-white rounded-lg p-1 shadow-sm border">
              <Button
                variant={activeTab === 'items' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('items')}
                className="flex items-center space-x-2"
              >
                <Shirt className="h-4 w-4" />
                <span>Wardrobe Items</span>
              </Button>
              <Button
                variant={activeTab === 'capsules' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('capsules')}
                className="flex items-center space-x-2"
              >
                <Package className="h-4 w-4" />
                <span>Capsule Wardrobes</span>
              </Button>
            </div>
          </div>

          {activeTab === 'items' ? <WardrobeManager /> : <CapsuleManager />}
        </main>
      </div>
    </AuthGuard>
  );
};

export default Wardrobe;

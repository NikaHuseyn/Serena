import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

import BottomNav from '@/components/BottomNav';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, Settings, Shield } from 'lucide-react';
import LoadingState from '@/components/LoadingState';
import PersonalInfoForm from '@/components/profile/PersonalInfoForm';
import StylePreferencesForm from '@/components/profile/StylePreferencesForm';
import SizePreferencesForm from '@/components/profile/SizePreferencesForm';
import ColorAnalysisSection from '@/components/profile/ColorAnalysisSection';
import OutfitHistory from '@/components/profile/OutfitHistory';
import UserWishlist from '@/components/profile/UserWishlist';
import PurchaseHistory from '@/components/profile/PurchaseHistory';
import PrivacySettingsForm from '@/components/profile/PrivacySettingsForm';



const Profile = () => {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [analysisImage, setAnalysisImage] = useState<File | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('user_style_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching profile:', profileError);
      } else {
        setProfile(profileData);
      }


    } catch (error) {
      console.error('Error loading profile data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalysisImageChange = (file: File) => {
    setAnalysisImage(file);
  };

  const handleProfileUpdate = () => {
    loadProfile();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-pink-50">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <LoadingState message="Loading your profile..." />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-pink-50 pt-14">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Profile Settings</h1>
          <p className="text-gray-600">
            Manage your personal information and style preferences
          </p>
        </div>

        <Tabs defaultValue="personal" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
            <TabsTrigger value="personal" className="flex items-center space-x-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Personal</span>
            </TabsTrigger>
            <TabsTrigger value="style" className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Style</span>
            </TabsTrigger>
            <TabsTrigger value="sizes" className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Sizes</span>
            </TabsTrigger>
            <TabsTrigger value="colors" className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Colors</span>
            </TabsTrigger>
            <TabsTrigger value="privacy" className="flex items-center space-x-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Privacy</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="space-y-6">
            <PersonalInfoForm profile={profile} onUpdate={handleProfileUpdate} />
          </TabsContent>

          <TabsContent value="style">
            <StylePreferencesForm profile={profile} onUpdate={handleProfileUpdate} />
          </TabsContent>

          <TabsContent value="sizes">
            <SizePreferencesForm profile={profile} onUpdate={handleProfileUpdate} />
          </TabsContent>

          <TabsContent value="colors">
            <ColorAnalysisSection 
              profile={profile} 
              analysisImage={analysisImage}
              onAnalysisImageChange={handleAnalysisImageChange}
            />
          </TabsContent>


          <TabsContent value="privacy">
            <PrivacySettingsForm profile={profile} onUpdate={handleProfileUpdate} />
          </TabsContent>
        </Tabs>
      </main>
      <BottomNav />
    </div>
  );
};

export default Profile;
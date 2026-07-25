
import React, { useEffect, useState } from 'react';

import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useGDPRCompliance } from '@/hooks/useGDPRCompliance';
import { Download, Trash2 } from 'lucide-react';

interface PrivacySettingsFormProps {
  profile: any;
  onUpdate: () => void;
}

const PrivacySettingsForm = ({ profile, onUpdate }: PrivacySettingsFormProps) => {
  const { toast } = useToast();
  const { exportUserData, deleteAllUserData, loading: gdprLoading } = useGDPRCompliance();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [consentDataSharing, setConsentDataSharing] = useState<boolean>(!!profile?.consent_data_sharing);
  const [consentBrandContent, setConsentBrandContent] = useState<boolean>(!!profile?.consent_brand_content);
  const [savingConsent, setSavingConsent] = useState<'data_sharing' | 'brand_content' | null>(null);

  useEffect(() => {
    setConsentDataSharing(!!profile?.consent_data_sharing);
    setConsentBrandContent(!!profile?.consent_brand_content);
  }, [profile?.consent_data_sharing, profile?.consent_brand_content]);

  const updateConsent = async (
    field: 'consent_data_sharing' | 'consent_brand_content',
    timestampField: 'consent_data_sharing_at' | 'consent_brand_content_at',
    value: boolean,
    setLocal: (v: boolean) => void,
    key: 'data_sharing' | 'brand_content',
  ) => {
    const prev = key === 'data_sharing' ? consentDataSharing : consentBrandContent;
    setLocal(value);
    setSavingConsent(key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const payload: any = {
        user_id: user.id,
        [field]: value,
        updated_at: new Date().toISOString(),
      };
      if (value) payload[timestampField] = new Date().toISOString();

      const { error } = await (supabase.from('user_style_profiles') as any)
        .upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;
      onUpdate();
    } catch (e: any) {
      console.error('Error updating consent:', e);
      setLocal(prev);
      toast({
        title: 'Error',
        description: 'Failed to update your preference. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingConsent(null);
    }
  };

  
  
  const { register, handleSubmit, formState: { isSubmitting }, watch, setValue } = useForm({
    defaultValues: {
      public_profile_enabled: profile?.public_profile_enabled || false,
      data_export_requested: profile?.data_export_requested || false,
      notification_preferences: profile?.notification_preferences || {
        likes: true,
        comments: true,
        follows: true,
        events: true,
      },
    }
  });

  const watchedValues = watch();

  const handleNotificationChange = (key: string, value: boolean) => {
    setValue('notification_preferences', {
      ...watchedValues.notification_preferences,
      [key]: value,
    });
  };

  const handleGDPRConsent = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const { error } = await supabase
        .from('user_style_profiles')
        .upsert({
          user_id: user.id,
          gdpr_consent_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      toast({
        title: "GDPR Consent Recorded",
        description: "Your consent has been recorded successfully.",
      });
      onUpdate();
    } catch (error) {
      console.error('Error recording GDPR consent:', error);
      toast({
        title: "Error",
        description: "Failed to record consent. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDataExport = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      setValue('data_export_requested', true);

      const { error } = await supabase
        .from('user_style_profiles')
        .upsert({
          user_id: user.id,
          data_export_requested: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      toast({
        title: "Data Export Requested",
        description: "Your data export request has been submitted. You'll receive an email within 30 days.",
      });
      onUpdate();
    } catch (error) {
      console.error('Error requesting data export:', error);
      toast({
        title: "Error",
        description: "Failed to request data export. Please try again.",
        variant: "destructive",
      });
    }
  };

  const onSubmit = async (data: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const profileData = {
        user_id: user.id,
        public_profile_enabled: data.public_profile_enabled,
        notification_preferences: data.notification_preferences,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('user_style_profiles')
        .upsert(profileData, { onConflict: 'user_id' });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Privacy settings updated successfully!",
      });
      onUpdate();
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      toast({
        title: "Error",
        description: "Failed to update privacy settings. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy & Data Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Public Profile</Label>
                <p className="text-sm text-muted-foreground">
                  Allow others to see your style profile and preferences
                </p>
              </div>
              <Switch
                checked={watchedValues.public_profile_enabled}
                onCheckedChange={(checked) => setValue('public_profile_enabled', checked)}
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-base font-semibold">Notification Preferences</Label>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Likes & Reactions</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when someone likes your posts
                    </p>
                  </div>
                  <Switch
                    checked={watchedValues.notification_preferences?.likes}
                    onCheckedChange={(checked) => handleNotificationChange('likes', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Comments</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when someone comments on your posts
                    </p>
                  </div>
                  <Switch
                    checked={watchedValues.notification_preferences?.comments}
                    onCheckedChange={(checked) => handleNotificationChange('comments', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>New Followers</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when someone follows you
                    </p>
                  </div>
                  <Switch
                    checked={watchedValues.notification_preferences?.follows}
                    onCheckedChange={(checked) => handleNotificationChange('follows', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Events & Updates</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified about platform updates and special events
                    </p>
                  </div>
                  <Switch
                    checked={watchedValues.notification_preferences?.events}
                    onCheckedChange={(checked) => handleNotificationChange('events', checked)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-base font-semibold">Data & privacy</Label>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label>Help improve fashion recommendations</Label>
                  <p className="text-sm text-muted-foreground">
                    Include my activity in anonymised, aggregated trend reports shared with retail partners. Never includes your name, photos, or identifiable data.
                  </p>
                </div>
                <Switch
                  checked={consentDataSharing}
                  disabled={savingConsent === 'data_sharing'}
                  onCheckedChange={(checked) =>
                    updateConsent('consent_data_sharing', 'consent_data_sharing_at', checked, setConsentDataSharing, 'data_sharing')
                  }
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label>Allow brands to feature my challenge photos</Label>
                  <p className="text-sm text-muted-foreground">
                    Brands running challenges may reshare your entry photos in their marketing. You can withdraw this any time.
                  </p>
                </div>
                <Switch
                  checked={consentBrandContent}
                  disabled={savingConsent === 'brand_content'}
                  onCheckedChange={(checked) =>
                    updateConsent('consent_brand_content', 'consent_brand_content_at', checked, setConsentBrandContent, 'brand_content')
                  }
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-base font-semibold">Data management</Label>

              
              <div className="space-y-4">
                <div className="p-4 border rounded-lg space-y-3">
                  <div>
                    <Label className="text-sm font-medium">GDPR Compliance</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      We respect your privacy rights under GDPR. 
                      {profile?.gdpr_consent_date ? 
                        ` Consent recorded on ${new Date(profile.gdpr_consent_date).toLocaleDateString()}.` :
                        ' Click to provide consent for data processing.'
                      }
                    </p>
                  </div>
                  {!profile?.gdpr_consent_date && (
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={handleGDPRConsent}
                      className="w-full"
                    >
                      Provide GDPR Consent
                    </Button>
                  )}
                </div>

                <div className="p-4 border rounded-lg space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Data Export</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Download a complete copy of all your personal data in JSON format.
                    </p>
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={exportUserData}
                    disabled={gdprLoading}
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {gdprLoading ? 'Preparing Export...' : 'Download My Data'}
                  </Button>
                </div>

                <div className="p-4 border border-red-200 rounded-lg space-y-3">
                  <div>
                    <Label className="text-sm font-medium text-red-700">Delete Account</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                  </div>
                  <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                    <AlertDialogTrigger asChild>
                      <Button 
                        type="button" 
                        variant="destructive" 
                        className="w-full"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete My Account
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete your account and remove all your data from our servers, including:
                          <br />• Your profile and style preferences
                          <br />• All wardrobe items and outfit combinations
                          <br />• AI recommendations and feedback
                          <br />• Social posts, comments, and likes
                          <br />• Purchase history and wishlist items
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            const success = await deleteAllUserData();
                            if (success) {
                              setShowDeleteConfirm(false);
                            }
                          }}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Yes, delete everything
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Updating...' : 'Update Privacy Settings'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default PrivacySettingsForm;

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, Camera } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface PersonalInfoFormProps {
  profile: any;
  onUpdate: () => void;
}

const PersonalInfoForm = ({ profile, onUpdate }: PersonalInfoFormProps) => {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(profile?.profile_photo_url || null);
  
  const { register, handleSubmit, formState: { isSubmitting }, setValue } = useForm({
    defaultValues: {
      display_name: profile?.display_name || '',
      height_cm: profile?.height_cm || '',
      weight_kg: profile?.weight_kg || '',
      face_shape: profile?.face_shape || '',
      body_type: profile?.body_type || '',
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file.",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select an image smaller than 5MB.",
          variant: "destructive",
        });
        return;
      }

      setProfilePhotoFile(file);
      
      // Create preview URL
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const uploadProfilePhoto = async (file: File): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/profile-photo.${fileExt}`;

      // Delete existing profile photo if it exists
      if (profile?.profile_photo_url) {
        const oldPath = profile.profile_photo_url.split('/').pop();
        if (oldPath) {
          await supabase.storage
            .from('profile-photos')
            .remove([`${user.id}/${oldPath}`]);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(fileName);

      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload profile photo. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const removeProfilePhoto = () => {
    setProfilePhotoFile(null);
    setPreviewUrl(null);
    // Reset file input
    const fileInput = document.getElementById('profile_photo') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const onSubmit = async (data: any) => {
    try {
      setIsUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      let profilePhotoUrl = profile?.profile_photo_url;

      // Upload new profile photo if one was selected
      if (profilePhotoFile) {
        profilePhotoUrl = await uploadProfilePhoto(profilePhotoFile);
        if (!profilePhotoUrl) {
          setIsUploading(false);
          return; // Upload failed, don't continue
        }
      }

      const profileData = {
        user_id: user.id,
        ...data,
        profile_photo_url: profilePhotoUrl,
        height_cm: data.height_cm ? parseInt(data.height_cm) : null,
        weight_kg: data.weight_kg ? parseFloat(data.weight_kg) : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('user_style_profiles')
        .upsert(profileData, { onConflict: 'user_id' });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Personal information updated successfully!",
      });
      
      // Reset file state
      setProfilePhotoFile(null);
      onUpdate();
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: "Failed to update personal information. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Information</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                {...register('display_name')}
                placeholder="How should we call you?"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Profile Photo</Label>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  {previewUrl ? (
                    <AvatarImage src={previewUrl} alt="Profile" />
                  ) : null}
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    <Camera className="h-6 w-6" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="profile-photo-input"
                    className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-primary hover:underline"
                  >
                    <Upload className="h-4 w-4" />
                    {previewUrl ? 'Change photo' : 'Upload photo'}
                  </label>
                  <input
                    id="profile-photo-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) {
                        toast({ title: 'Error', description: 'Photo must be under 5 MB', variant: 'destructive' });
                        return;
                      }
                      setProfilePhotoFile(file);
                      setPreviewUrl(URL.createObjectURL(file));
                    }}
                  />
                  {previewUrl && (
                    <button
                      type="button"
                      onClick={() => { setPreviewUrl(null); setProfilePhotoFile(null); }}
                      className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                    >
                      <X className="h-3 w-3" /> Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="height_cm">Height, cm <span className="text-sm text-gray-500">(optional)</span></Label>
              <Input
                id="height_cm"
                type="number"
                {...register('height_cm')}
                min="100"
                max="250"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="weight_kg">Weight, kg <span className="text-sm text-gray-500">(optional)</span></Label>
              <Input
                id="weight_kg"
                type="number"
                step="0.1"
                {...register('weight_kg')}
                min="30"
                max="200"
              />
            </div>


            <div className="space-y-2">
              <Label htmlFor="face_shape">Face Shape <span className="text-sm text-gray-500">(Optional)</span></Label>
              <Input
                id="face_shape"
                {...register('face_shape')}
                placeholder="Round, Oval, Square, etc."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body_type">Body Type <span className="text-sm text-gray-500">(Optional)</span></Label>
              <Input
                id="body_type"
                {...register('body_type')}
                placeholder="Apple, Pear, Hourglass, Rectangle, etc."
              />
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={isSubmitting || isUploading} 
            className="w-full"
          >
            {isUploading ? 'Uploading...' : isSubmitting ? 'Updating...' : 'Update Personal Information'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default PersonalInfoForm;


import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import SizeGuide from './SizeGuide';

interface SizePreferencesFormProps {
  profile: any;
  onUpdate: () => void;
}

const SizePreferencesForm = ({ profile, onUpdate }: SizePreferencesFormProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newSizeCategory, setNewSizeCategory] = useState('');
  const [newSizeValue, setNewSizeValue] = useState('');
  const [newSizeBrand, setNewSizeBrand] = useState('');

  const { register, handleSubmit, formState: { isSubmitting }, setValue, watch } = useForm({
    defaultValues: {
      standard_size_top: profile?.standard_size_top || '',
      standard_size_bottom: profile?.standard_size_bottom || '',
      standard_size_shoes: profile?.standard_size_shoes || '',
      fit_preference: profile?.fit_preference || '',
    }
  });

  const fitPreference = watch('fit_preference');
  const topSize = watch('standard_size_top');
  const bottomSize = watch('standard_size_bottom');
  const shoeSize = watch('standard_size_shoes');

  const ukTopSizes = ['4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24', '26', '28'];
  const ukBottomSizes = ['4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24', '26', '28'];
  const ukShoeSizes = ['2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13'];

  const { data: userSizes } = useQuery({
    queryKey: ['userSizes'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const { data, error } = await supabase
        .from('user_sizes')
        .select('*')
        .eq('user_id', user.id)
        .order('category');

      if (error) throw error;
      return data;
    },
  });

  const addSizeMutation = useMutation({
    mutationFn: async ({ category, size_value, brand }: { category: string; size_value: string; brand?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const { error } = await supabase
        .from('user_sizes')
        .upsert({
          user_id: user.id,
          category,
          size_value,
          brand: brand || null,
        }, { onConflict: 'user_id,category,brand' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSizes'] });
      setNewSizeCategory('');
      setNewSizeValue('');
      setNewSizeBrand('');
      toast({
        title: "Success",
        description: "Size preference added successfully!",
      });
    },
  });

  const deleteSizeMutation = useMutation({
    mutationFn: async (sizeId: string) => {
      const { error } = await supabase
        .from('user_sizes')
        .delete()
        .eq('id', sizeId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSizes'] });
      toast({
        title: "Success",
        description: "Size preference removed successfully!",
      });
    },
  });

  const onSubmit = async (data: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const profileData = {
        user_id: user.id,
        ...data,
        // Convert empty string to null for fit_preference to avoid constraint violation
        fit_preference: data.fit_preference || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('user_style_profiles')
        .upsert(profileData, { onConflict: 'user_id' });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Size preferences updated successfully!",
      });
      onUpdate();
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: "Failed to update size preferences. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleAddSize = () => {
    if (newSizeCategory && newSizeValue) {
      addSizeMutation.mutate({
        category: newSizeCategory,
        size_value: newSizeValue,
        brand: newSizeBrand,
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Standard Sizes</CardTitle>
          <SizeGuide />
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="standard_size_top">Top Size</Label>
                <Select 
                  value={topSize} 
                  onValueChange={(value) => setValue('standard_size_top', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select UK top size" />
                  </SelectTrigger>
                  <SelectContent>
                    {ukTopSizes.map((size) => (
                      <SelectItem key={size} value={size}>UK {size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  UK clothing sizes from smallest to largest
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="standard_size_bottom">Bottom Size</Label>
                <Select 
                  value={bottomSize} 
                  onValueChange={(value) => setValue('standard_size_bottom', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select UK bottom size" />
                  </SelectTrigger>
                  <SelectContent>
                    {ukBottomSizes.map((size) => (
                      <SelectItem key={size} value={size}>UK {size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  UK clothing sizes from smallest to largest
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="standard_size_shoes">Shoe Size</Label>
                <Select 
                  value={shoeSize} 
                  onValueChange={(value) => setValue('standard_size_shoes', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select UK shoe size" />
                  </SelectTrigger>
                  <SelectContent>
                    {ukShoeSizes.map((size) => (
                      <SelectItem key={size} value={size}>UK {size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  UK shoe sizes from smallest to largest
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fit_preference">Fit Preference</Label>
              <Select 
                value={fitPreference} 
                onValueChange={(value) => setValue('fit_preference', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select your preferred fit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tight">Tight Fit</SelectItem>
                  <SelectItem value="regular">Regular Fit</SelectItem>
                  <SelectItem value="loose">Loose Fit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update Standard Sizes'}
            </Button>
          </form>
        </CardContent>
      </Card>

    </div>
  );
};

export default SizePreferencesForm;

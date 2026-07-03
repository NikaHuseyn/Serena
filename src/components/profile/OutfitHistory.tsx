
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, Camera, CloudSun } from 'lucide-react';
import { format } from 'date-fns';

const OutfitHistory = () => {
  const { data: outfitHistory, isLoading } = useQuery({
    queryKey: ['outfitHistory'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const { data, error } = await supabase
        .from('outfit_history')
        .select(`
          *,
          outfit_combinations (
            id,
            name,
            image_url
          )
        `)
        .eq('user_id', user.id)
        .order('worn_date', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Outfit History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-gray-200 h-32 rounded-lg"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Outfit History ({outfitHistory?.length || 0} outfits)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!outfitHistory || outfitHistory.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No outfit history yet</h3>
            <p className="text-gray-600">
              Start tracking your outfits to build your personal style history!
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {outfitHistory.map((entry) => (
              <div key={entry.id} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span className="font-medium">
                        {format(new Date(entry.worn_date), 'MMMM d, yyyy')}
                      </span>
                    </div>
                    
                    {entry.outfit_combinations && (
                      <div>
                        <h3 className="font-medium text-gray-900">
                          {entry.outfit_combinations.name}
                        </h3>
                      </div>
                    )}

                    {entry.occasion && (
                      <Badge variant="secondary">{entry.occasion}</Badge>
                    )}
                  </div>

                  {entry.outfit_combinations?.image_url && (
                    <img
                      src={entry.outfit_combinations.image_url}
                      alt="Outfit"
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {entry.weather_data && (
                    <div className="flex items-start gap-2">
                      <CloudSun className="h-4 w-4 text-gray-500 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium">Weather</p>
                        <p className="text-gray-600">
                          {typeof entry.weather_data === 'object' && entry.weather_data
                            ? JSON.stringify(entry.weather_data)
                            : 'Weather data available'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {entry.user_notes && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-700">{entry.user_notes}</p>
                  </div>
                )}

                {entry.photo_url && (
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-gray-500" />
                    <img
                      src={entry.photo_url}
                      alt="Outfit photo"
                      className="w-24 h-24 rounded-lg object-cover cursor-pointer"
                      onClick={() => window.open(entry.photo_url, '_blank')}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OutfitHistory;

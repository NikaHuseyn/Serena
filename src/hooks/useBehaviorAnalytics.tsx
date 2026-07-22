
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface BehaviorEvent {
  event_type: string;
  event_data?: any;
  outfit_id?: string;
  shopping_item_id?: string;
}

export const useBehaviorAnalytics = () => {
  const trackEvent = useCallback(async (event: BehaviorEvent) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('user_behavior_analytics')
        .insert({
          user_id: user.id,
          event_type: event.event_type,
          event_data: {
            ...(event.event_data || {}),
            outfit_id: event.outfit_id,
            shopping_item_id: event.shopping_item_id,
          },
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error tracking behavior event:', error);
      }
    } catch (error) {
      console.error('Error tracking behavior event:', error);
    }
  }, []);

  const trackOutfitView = useCallback((outfitId: string, additionalData?: any) => {
    trackEvent({
      event_type: 'outfit_view',
      outfit_id: outfitId,
      event_data: additionalData
    });
  }, [trackEvent]);

  const trackOutfitLike = useCallback((outfitId: string) => {
    trackEvent({
      event_type: 'outfit_like',
      outfit_id: outfitId
    });
  }, [trackEvent]);

  const trackShoppingItemView = useCallback((itemId: string, additionalData?: any) => {
    trackEvent({
      event_type: 'shopping_item_view',
      shopping_item_id: itemId,
      event_data: additionalData
    });
  }, [trackEvent]);

  const trackShoppingItemFavorite = useCallback((itemId: string) => {
    trackEvent({
      event_type: 'shopping_item_favorite',
      shopping_item_id: itemId
    });
  }, [trackEvent]);

  const trackStyleSearch = useCallback((searchTerm: string, filters?: any) => {
    trackEvent({
      event_type: 'style_search',
      event_data: { search_term: searchTerm, filters }
    });
  }, [trackEvent]);

  const trackRecommendationInteraction = useCallback((recommendationId: string, action: 'accept' | 'reject' | 'view') => {
    trackEvent({
      event_type: 'recommendation_interaction',
      event_data: { recommendation_id: recommendationId, action }
    });
  }, [trackEvent]);

  return {
    trackEvent,
    trackOutfitView,
    trackOutfitLike,
    trackShoppingItemView,
    trackShoppingItemFavorite,
    trackStyleSearch,
    trackRecommendationInteraction
  };
};

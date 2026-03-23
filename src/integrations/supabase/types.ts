export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_recommendations: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          expires_at: string | null
          feedback_timestamp: string | null
          id: string
          is_accepted: boolean | null
          occasion: string | null
          reasoning: string | null
          recommendation_type: string
          recommended_items: Json | null
          user_feedback: string | null
          user_id: string
          user_rating: number | null
          was_worn: boolean | null
          wear_context: string | null
          wear_date: string | null
          weather_context: Json | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          expires_at?: string | null
          feedback_timestamp?: string | null
          id?: string
          is_accepted?: boolean | null
          occasion?: string | null
          reasoning?: string | null
          recommendation_type?: string
          recommended_items?: Json | null
          user_feedback?: string | null
          user_id: string
          user_rating?: number | null
          was_worn?: boolean | null
          wear_context?: string | null
          wear_date?: string | null
          weather_context?: Json | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          expires_at?: string | null
          feedback_timestamp?: string | null
          id?: string
          is_accepted?: boolean | null
          occasion?: string | null
          reasoning?: string | null
          recommendation_type?: string
          recommended_items?: Json | null
          user_feedback?: string | null
          user_id?: string
          user_rating?: number | null
          was_worn?: boolean | null
          wear_context?: string | null
          wear_date?: string | null
          weather_context?: Json | null
        }
        Relationships: []
      }
      capsule_wardrobes: {
        Row: {
          color_scheme: Json | null
          created_at: string | null
          description: string | null
          id: string
          max_items: number | null
          name: string
          occasion: string | null
          season: string | null
          updated_at: string | null
          user_id: string
          wardrobe_item_ids: string[] | null
        }
        Insert: {
          color_scheme?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          max_items?: number | null
          name: string
          occasion?: string | null
          season?: string | null
          updated_at?: string | null
          user_id: string
          wardrobe_item_ids?: string[] | null
        }
        Update: {
          color_scheme?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          max_items?: number | null
          name?: string
          occasion?: string | null
          season?: string | null
          updated_at?: string | null
          user_id?: string
          wardrobe_item_ids?: string[] | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          created_at: string | null
          id: string
          post_id: string | null
          report_reason: string | null
          report_type: string
          reporter_id: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id?: string | null
          report_reason?: string | null
          report_type: string
          reporter_id: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string | null
          report_reason?: string | null
          report_type?: string
          reporter_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      cultural_dress_norms: {
        Row: {
          city: string | null
          context_type: string
          country: string
          created_at: string | null
          guidance: string
          id: string
          last_updated: string | null
          source_url: string | null
        }
        Insert: {
          city?: string | null
          context_type: string
          country: string
          created_at?: string | null
          guidance: string
          id?: string
          last_updated?: string | null
          source_url?: string | null
        }
        Update: {
          city?: string | null
          context_type?: string
          country?: string
          created_at?: string | null
          guidance?: string
          id?: string
          last_updated?: string | null
          source_url?: string | null
        }
        Relationships: []
      }
      fashion_trends: {
        Row: {
          category: string
          colors: string[] | null
          created_at: string | null
          description: string | null
          external_id: string | null
          growth_rate: string | null
          id: string
          image_url: string | null
          name: string
          occasions: string[] | null
          popularity_rank: number | null
          season: string | null
          source: string | null
          trend_score: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string
          colors?: string[] | null
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          growth_rate?: string | null
          id?: string
          image_url?: string | null
          name: string
          occasions?: string[] | null
          popularity_rank?: number | null
          season?: string | null
          source?: string | null
          trend_score?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          colors?: string[] | null
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          growth_rate?: string | null
          id?: string
          image_url?: string | null
          name?: string
          occasions?: string[] | null
          popularity_rank?: number | null
          season?: string | null
          source?: string | null
          trend_score?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      followers: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      likes: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          related_post_id: string | null
          related_user_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          related_post_id?: string | null
          related_user_id?: string | null
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          related_post_id?: string | null
          related_user_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_related_post_id_fkey"
            columns: ["related_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      outfit_combinations: {
        Row: {
          created_at: string | null
          id: string
          image_url: string | null
          name: string | null
          user_id: string
          wardrobe_item_ids: string[] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          name?: string | null
          user_id: string
          wardrobe_item_ids?: string[] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          name?: string | null
          user_id?: string
          wardrobe_item_ids?: string[] | null
        }
        Relationships: []
      }
      outfit_history: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          occasion: string | null
          outfit_combination_id: string | null
          photo_url: string | null
          synced_calendar_event_id: string | null
          user_id: string
          weather_conditions: Json | null
          worn_date: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          occasion?: string | null
          outfit_combination_id?: string | null
          photo_url?: string | null
          synced_calendar_event_id?: string | null
          user_id: string
          weather_conditions?: Json | null
          worn_date?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          occasion?: string | null
          outfit_combination_id?: string | null
          photo_url?: string | null
          synced_calendar_event_id?: string | null
          user_id?: string
          weather_conditions?: Json | null
          worn_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_outfit_combination"
            columns: ["outfit_combination_id"]
            isOneToOne: false
            referencedRelation: "outfit_combinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outfit_history_synced_calendar_event_id_fkey"
            columns: ["synced_calendar_event_id"]
            isOneToOne: false
            referencedRelation: "synced_calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          caption: string | null
          comments_count: number | null
          created_at: string | null
          flag_reason: string | null
          id: string
          image_urls: string[] | null
          is_flagged: boolean | null
          likes_count: number | null
          tags: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          comments_count?: number | null
          created_at?: string | null
          flag_reason?: string | null
          id?: string
          image_urls?: string[] | null
          is_flagged?: boolean | null
          likes_count?: number | null
          tags?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          caption?: string | null
          comments_count?: number | null
          created_at?: string | null
          flag_reason?: string | null
          id?: string
          image_urls?: string[] | null
          is_flagged?: boolean | null
          likes_count?: number | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recommendation_feedback: {
        Row: {
          alternative_preferences: string | null
          comfort_rating: number | null
          created_at: string | null
          disliked_aspects: string[] | null
          feedback_type: string | null
          id: string
          improvement_suggestions: string | null
          liked_aspects: string[] | null
          occasion_appropriateness: number | null
          rating: number | null
          recommendation_id: string
          style_satisfaction: number | null
          user_id: string
          would_wear_again: boolean | null
        }
        Insert: {
          alternative_preferences?: string | null
          comfort_rating?: number | null
          created_at?: string | null
          disliked_aspects?: string[] | null
          feedback_type?: string | null
          id?: string
          improvement_suggestions?: string | null
          liked_aspects?: string[] | null
          occasion_appropriateness?: number | null
          rating?: number | null
          recommendation_id: string
          style_satisfaction?: number | null
          user_id: string
          would_wear_again?: boolean | null
        }
        Update: {
          alternative_preferences?: string | null
          comfort_rating?: number | null
          created_at?: string | null
          disliked_aspects?: string[] | null
          feedback_type?: string | null
          id?: string
          improvement_suggestions?: string | null
          liked_aspects?: string[] | null
          occasion_appropriateness?: number | null
          rating?: number | null
          recommendation_id?: string
          style_satisfaction?: number | null
          user_id?: string
          would_wear_again?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_feedback_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "ai_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      seasonal_forecasts: {
        Row: {
          color_palette: Json | null
          confidence_score: number | null
          created_at: string | null
          description: string | null
          id: string
          influencing_factors: string[] | null
          key_trends: string[] | null
          must_have_items: string[] | null
          season: string
          updated_at: string | null
          year: number
        }
        Insert: {
          color_palette?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          influencing_factors?: string[] | null
          key_trends?: string[] | null
          must_have_items?: string[] | null
          season: string
          updated_at?: string | null
          year: number
        }
        Update: {
          color_palette?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          influencing_factors?: string[] | null
          key_trends?: string[] | null
          must_have_items?: string[] | null
          season?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: []
      }
      shopping_items: {
        Row: {
          affiliate_url: string | null
          brand: string
          category: string
          colors: string[] | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          in_stock: boolean | null
          name: string
          price: number | null
          rental_price: number | null
          retailer_name: string | null
          retailer_url: string | null
          sizes: string[] | null
          updated_at: string | null
        }
        Insert: {
          affiliate_url?: string | null
          brand?: string
          category?: string
          colors?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          in_stock?: boolean | null
          name: string
          price?: number | null
          rental_price?: number | null
          retailer_name?: string | null
          retailer_url?: string | null
          sizes?: string[] | null
          updated_at?: string | null
        }
        Update: {
          affiliate_url?: string | null
          brand?: string
          category?: string
          colors?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          in_stock?: boolean | null
          name?: string
          price?: number | null
          rental_price?: number | null
          retailer_name?: string | null
          retailer_url?: string | null
          sizes?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      social_profiles: {
        Row: {
          avatar_url: string | null
          badge_count: number | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          followers_count: number | null
          following_count: number | null
          id: string
          posts_count: number | null
          total_likes: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          badge_count?: number | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          followers_count?: number | null
          following_count?: number | null
          id?: string
          posts_count?: number | null
          total_likes?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          badge_count?: number | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          followers_count?: number | null
          following_count?: number | null
          id?: string
          posts_count?: number | null
          total_likes?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      synced_calendar_events: {
        Row: {
          created_at: string | null
          description: string | null
          dress_code: string | null
          end_time: string | null
          event_type: string | null
          google_event_id: string | null
          id: string
          location: string | null
          start_time: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          dress_code?: string | null
          end_time?: string | null
          event_type?: string | null
          google_event_id?: string | null
          id?: string
          location?: string | null
          start_time: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          dress_code?: string | null
          end_time?: string | null
          event_type?: string | null
          google_event_id?: string | null
          id?: string
          location?: string | null
          start_time?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      trend_predictions: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          key_drivers: string[] | null
          probability: number | null
          risk_level: string | null
          timeframe: string | null
          trend_name: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          key_drivers?: string[] | null
          probability?: number | null
          risk_level?: string | null
          timeframe?: string | null
          trend_name: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          key_drivers?: string[] | null
          probability?: number | null
          risk_level?: string | null
          timeframe?: string | null
          trend_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          awarded_at: string | null
          badge_name: string
          badge_type: string
          description: string | null
          id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string | null
          badge_name: string
          badge_type: string
          description?: string | null
          id?: string
          user_id: string
        }
        Update: {
          awarded_at?: string | null
          badge_name?: string
          badge_type?: string
          description?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_behavior_analytics: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_calendar_connections: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          provider: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          provider?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          provider?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_oauth_connections: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          provider: string
          provider_user_id: string | null
          scope: string[] | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          provider: string
          provider_user_id?: string | null
          scope?: string[] | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          provider?: string
          provider_user_id?: string | null
          scope?: string[] | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_preference_insights: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          id: string
          insight_type: string
          insight_value: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          insight_type: string
          insight_value?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          insight_type?: string
          insight_value?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_purchases: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          price_paid: number | null
          purchase_date: string | null
          retailer: string | null
          shopping_item_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          price_paid?: number | null
          purchase_date?: string | null
          retailer?: string | null
          shopping_item_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          price_paid?: number | null
          purchase_date?: string | null
          retailer?: string | null
          shopping_item_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_purchases_shopping_item_id_fkey"
            columns: ["shopping_item_id"]
            isOneToOne: false
            referencedRelation: "shopping_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sizes: {
        Row: {
          brand: string | null
          category: string
          created_at: string | null
          id: string
          size_value: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          category: string
          created_at?: string | null
          id?: string
          size_value: string
          user_id: string
        }
        Update: {
          brand?: string | null
          category?: string
          created_at?: string | null
          id?: string
          size_value?: string
          user_id?: string
        }
        Relationships: []
      }
      user_style_profiles: {
        Row: {
          analysis_image_url: string | null
          body_type: string | null
          budget_currency: string | null
          budget_max: number | null
          budget_min: number | null
          color_analysis: Json | null
          created_at: string | null
          data_export_requested: boolean | null
          default_budget: number | null
          disliked_colors: string[] | null
          disliked_styles: string[] | null
          display_name: string | null
          face_shape: string | null
          fit_preference: string | null
          gdpr_consent_date: string | null
          height_cm: number | null
          home_city: string | null
          id: string
          items_to_avoid: string[] | null
          notification_preferences: Json | null
          onboarding_completed: boolean | null
          onboarding_completed_at: string | null
          preferred_brands: string[] | null
          preferred_colors: string[] | null
          preferred_fabrics: string[] | null
          preferred_patterns: string[] | null
          preferred_retailers: string[] | null
          primary_occasions: string[] | null
          profile_photo_url: string | null
          public_profile_enabled: boolean | null
          shopping_preference: string | null
          skin_tone: string | null
          standard_size_bottom: string | null
          standard_size_shoes: string | null
          standard_size_top: string | null
          style_confidence_score: number | null
          style_personality: string[] | null
          updated_at: string | null
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          analysis_image_url?: string | null
          body_type?: string | null
          budget_currency?: string | null
          budget_max?: number | null
          budget_min?: number | null
          color_analysis?: Json | null
          created_at?: string | null
          data_export_requested?: boolean | null
          default_budget?: number | null
          disliked_colors?: string[] | null
          disliked_styles?: string[] | null
          display_name?: string | null
          face_shape?: string | null
          fit_preference?: string | null
          gdpr_consent_date?: string | null
          height_cm?: number | null
          home_city?: string | null
          id?: string
          items_to_avoid?: string[] | null
          notification_preferences?: Json | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          preferred_brands?: string[] | null
          preferred_colors?: string[] | null
          preferred_fabrics?: string[] | null
          preferred_patterns?: string[] | null
          preferred_retailers?: string[] | null
          primary_occasions?: string[] | null
          profile_photo_url?: string | null
          public_profile_enabled?: boolean | null
          shopping_preference?: string | null
          skin_tone?: string | null
          standard_size_bottom?: string | null
          standard_size_shoes?: string | null
          standard_size_top?: string | null
          style_confidence_score?: number | null
          style_personality?: string[] | null
          updated_at?: string | null
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          analysis_image_url?: string | null
          body_type?: string | null
          budget_currency?: string | null
          budget_max?: number | null
          budget_min?: number | null
          color_analysis?: Json | null
          created_at?: string | null
          data_export_requested?: boolean | null
          default_budget?: number | null
          disliked_colors?: string[] | null
          disliked_styles?: string[] | null
          display_name?: string | null
          face_shape?: string | null
          fit_preference?: string | null
          gdpr_consent_date?: string | null
          height_cm?: number | null
          home_city?: string | null
          id?: string
          items_to_avoid?: string[] | null
          notification_preferences?: Json | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          preferred_brands?: string[] | null
          preferred_colors?: string[] | null
          preferred_fabrics?: string[] | null
          preferred_patterns?: string[] | null
          preferred_retailers?: string[] | null
          primary_occasions?: string[] | null
          profile_photo_url?: string | null
          public_profile_enabled?: boolean | null
          shopping_preference?: string | null
          skin_tone?: string | null
          standard_size_bottom?: string | null
          standard_size_shoes?: string | null
          standard_size_top?: string | null
          style_confidence_score?: number | null
          style_personality?: string[] | null
          updated_at?: string | null
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      user_wishlist: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          priority: number | null
          shopping_item_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          priority?: number | null
          shopping_item_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          priority?: number | null
          shopping_item_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_wishlist_shopping_item_id_fkey"
            columns: ["shopping_item_id"]
            isOneToOne: false
            referencedRelation: "shopping_items"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string | null
          email: string
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      wardrobe_items: {
        Row: {
          brand: string | null
          category: string
          color: string | null
          created_at: string | null
          id: string
          image_url: string | null
          name: string
          notes: string | null
          size: string | null
          tags: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          brand?: string | null
          category?: string
          color?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          name: string
          notes?: string | null
          size?: string | null
          tags?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          brand?: string | null
          category?: string
          color?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          name?: string
          notes?: string | null
          size?: string | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_ai_rate_limit: { Args: { user_id_param: string }; Returns: Json }
      get_style_leaderboard: {
        Args: never
        Returns: {
          avatar_url: string
          badge_count: number
          display_name: string
          posts_count: number
          style_score: number
          total_likes: number
          user_id: string
        }[]
      }
      is_admin: {
        Args: { required_role?: string; target_user_id: string }
        Returns: boolean
      }
      log_security_event: {
        Args: { event_data?: Json; event_type: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

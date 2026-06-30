import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Soft sign-in nudge for guests attempting authenticated actions
 * (like, vote, comment, post). Returns a function that:
 *  - resolves true if the user is signed in (caller proceeds)
 *  - resolves false if guest, after firing a toast with a "Sign in" action
 */
export const useGuestNudge = () => {
  const navigate = useNavigate();

  const requireAuth = useCallback(
    async (action: string = 'continue'): Promise<boolean> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) return true;

      toast.info(`Sign in to ${action}`, {
        description: 'Create a free account to join the community.',
        action: {
          label: 'Sign in',
          onClick: () => navigate('/auth'),
        },
      });
      return false;
    },
    [navigate]
  );

  return { requireAuth };
};

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Oracle v2: which mode the model responded in */
  mode?: 'wardrobe_only' | 'shop_new';
  /** Oracle v2: sticky rental preference for the conversation */
  rental_preference?: 'both' | 'buy_only' | 'rent_only';
  /** Oracle v2: option cards rendered below the reply */
  outfit_options?: any[];
  /** Active "Style this" anchor for this conversation. */
  anchor_item_id?: string | null;
  timestamp: Date;
}

/**
 * Silently check if geolocation permission is already granted, and if so,
 * return coarse coordinates. Never prompts the user. Returns null otherwise.
 */
async function getAssumedCoordsIfGranted(): Promise<{ lat: number; lon: number } | null> {
  try {
    if (!('geolocation' in navigator) || !('permissions' in navigator)) return null;
    // @ts-ignore — 'geolocation' is a valid PermissionName in modern browsers
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    if (status.state !== 'granted') return null;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 3000, maximumAge: 10 * 60 * 1000 },
      );
    });
  } catch {
    return null;
  }
}

export const useStylingChat = () => {
  // Restore guest conversation from sessionStorage on mount
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = sessionStorage.getItem('guest_chat_messages');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
      }
    } catch { /* ignore */ }
    return [];
  });
  const [isLoading, setIsLoading] = useState(false);

  // Anchor item ("Style this" from wardrobe). Persists for the whole
  // conversation until Oracle judges the user has moved on
  // (release_anchor === true) or clearChat is called.
  const [anchorItemId, setAnchorItemIdState] = useState<string | null>(null);
  const anchorItemIdRef = useRef<string | null>(null);
  const setAnchorItemId = useCallback((id: string | null) => {
    anchorItemIdRef.current = id;
    setAnchorItemIdState(id);
  }, []);

  // Track whether we've already migrated in this hook instance
  const hasMigratedRef = useRef(false);

  // Persist guest messages to sessionStorage whenever they change
  useEffect(() => {
    const checkAndPersist = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session && messages.length > 0) {
        sessionStorage.setItem('guest_chat_messages', JSON.stringify(messages));
      }
    };
    checkAndPersist();
  }, [messages]);

  // Listen for auth state change to migrate guest conversation
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN') && session && !hasMigratedRef.current) {
        const storedMessages = sessionStorage.getItem('guest_chat_messages');
        if (!storedMessages) return;

        hasMigratedRef.current = true;
        try {
          const guestMessages: ChatMessage[] = JSON.parse(storedMessages);
          if (guestMessages.length === 0) return;

          setMessages(guestMessages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })));

          const userMessages = guestMessages.filter(m => m.role === 'user').map(m => m.content);

          await supabase.from('ai_recommendations').insert({
            user_id: session.user.id,
            recommendation_type: 'migrated_guest_session',
            occasion: userMessages[0] || 'Guest conversation',
            reasoning: `Migrated guest conversation (${guestMessages.length} messages): ${userMessages.join(' | ')}`,
            recommended_items: [],
            weather_context: { migrated: true, message_count: guestMessages.length },
          });

          console.log('Migrated guest conversation to authenticated account');
        } catch (err) {
          console.warn('Failed to migrate guest conversation:', err);
        } finally {
          sessionStorage.removeItem('guest_chat_messages');
          sessionStorage.removeItem('guest_chat_context');
          sessionStorage.removeItem('guest_session_id');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const sendMessage = useCallback(async (userMessage: string) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session ? { Authorization: `Bearer ${session.access_token}` } : {};

      // Last 10 user/assistant messages for context
      const conversationHistory = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const assumed = await getAssumedCoordsIfGranted();

      const invokePromise = supabase.functions.invoke('oracle-styling', {
        body: {
          message: userMessage,
          conversationHistory,
          anchor_item_id: anchorItemIdRef.current,
          assumed_current_location: assumed,
        },
        headers,
      });

      // Overall 90s ceiling — if oracle-styling hangs, surface the honest
      // error instead of spinning forever.
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('oracle_styling_timeout_90s')), 90_000);
      });

      const { data: resp, error } = await Promise.race([
        invokePromise,
        timeoutPromise,
      ]) as Awaited<typeof invokePromise>;

      if (error) throw new Error(error.message || 'Failed to get recommendation');

      // Edge function returns { success: true, data: parsed }; accept the
      // bare parsed shape too.
      const parsed = resp?.data ?? resp ?? {};

      // Snapshot the anchor the response was generated for.
      const anchorForMessage = anchorItemIdRef.current ?? null;

      // Oracle can release the anchor when the user has moved on.
      if (parsed?.release_anchor === true && anchorItemIdRef.current) {
        setAnchorItemId(null);
      }

      const replyText = parsed.reply_text || '';
      const followUp = parsed.follow_up_question;
      const content = followUp && !replyText.trim().endsWith(String(followUp).trim())
        ? `${replyText}\n\n${followUp}`.trim()
        : replyText;

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: content || "Here's what I'd suggest for you.",
        mode: parsed.mode,
        rental_preference: parsed.rental_preference,
        outfit_options: parsed.outfit_options,
        anchor_item_id: anchorForMessage,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      console.error('Error in styling chat:', error);
      toast.error('Something went wrong. Please try again.');

      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "I'm sorry, I couldn't process your request. Please try again or rephrase your question.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, setAnchorItemId]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setAnchorItemId(null);
    sessionStorage.removeItem('guest_chat_messages');
    sessionStorage.removeItem('guest_chat_context');
    sessionStorage.removeItem('guest_session_id');
  }, [setAnchorItemId]);

  /**
   * Start a new "Style this" conversation anchored on a wardrobe item.
   */
  const startAnchoredConversation = useCallback(
    async (itemId: string, itemName: string) => {
      setMessages([]);
      setAnchorItemId(itemId);
      await Promise.resolve();
      await sendMessage(`Build an outfit around my ${itemName}`);
    },
    [sendMessage, setAnchorItemId],
  );

  return {
    messages,
    isLoading,
    sendMessage,
    clearChat,
    anchorItemId,
    startAnchoredConversation,
  };
};

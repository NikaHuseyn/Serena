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
  /** Whether every option contains the anchor item (false if enforcement failed). Absent means true. */
  anchor_enforced?: boolean;
  timestamp: Date;
}

/**
 * Silently check if geolocation permission is already granted, and if so,
 * return coarse coordinates. Never prompts the user. Returns null otherwise.
 */
async function getAssumedCoordsIfGranted(): Promise<{ lat: number; lon: number } | null> {
  try {
    if (typeof navigator === 'undefined') return null;
    if (!('geolocation' in navigator)) return null;
    // @ts-ignore
    if (!navigator.permissions || typeof navigator.permissions.query !== 'function') return null;

    let status: PermissionStatus | null = null;
    try {
      // @ts-ignore
      status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    } catch {
      return null;
    }
    if (!status || status.state !== 'granted') return null;

    return await new Promise((resolve) => {
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: false, timeout: 3000, maximumAge: 10 * 60 * 1000 },
        );
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}


export const useStylingChat = () => {
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

  // Persistent conversation ID for authenticated users. Null until first
  // message is sent (or when a saved conversation is loaded).
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const setConversationId = useCallback((id: string | null) => {
    conversationIdRef.current = id;
    setConversationIdState(id);
  }, []);

  const [anchorItemId, setAnchorItemIdState] = useState<string | null>(null);
  const anchorItemIdRef = useRef<string | null>(null);
  const setAnchorItemId = useCallback((id: string | null) => {
    anchorItemIdRef.current = id;
    setAnchorItemIdState(id);
  }, []);

  const hasMigratedRef = useRef(false);

  // Persist guest messages to sessionStorage (guests only).
  useEffect(() => {
    const checkAndPersist = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session && messages.length > 0) {
        sessionStorage.setItem('guest_chat_messages', JSON.stringify(messages));
      }
    };
    checkAndPersist();
  }, [messages]);

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

  const persistMessage = useCallback(async (
    convId: string,
    role: 'user' | 'assistant',
    content: string,
    outfit_options?: any[],
  ) => {
    try {
      const { error } = await supabase.from('oracle_messages').insert({
        conversation_id: convId,
        role,
        content,
        outfit_options: outfit_options ?? null,
      });
      if (error) console.warn('[oracle-history] insert message failed:', error);
      // Touch parent conversation updated_at
      await supabase
        .from('oracle_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convId);
    } catch (e) {
      console.warn('[oracle-history] persistMessage error:', e);
    }
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
      let headers: Record<string, string> = {};
      let userId: string | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) headers = { Authorization: `Bearer ${token}` };
        userId = data?.session?.user?.id ?? null;
      } catch (e) {
        console.warn('[useStylingChat] getSession failed, proceeding as guest:', e);
      }

      // For authenticated users: ensure a conversation row exists.
      let activeConvId = conversationIdRef.current;
      if (userId && !activeConvId) {
        try {
          const title = userMessage.trim().slice(0, 40);
          const { data: conv, error: convErr } = await supabase
            .from('oracle_conversations')
            .insert({ user_id: userId, title })
            .select('id')
            .single();
          if (convErr) {
            console.warn('[oracle-history] create conversation failed:', convErr);
          } else if (conv?.id) {
            activeConvId = conv.id;
            setConversationId(conv.id);
          }
        } catch (e) {
          console.warn('[oracle-history] create conversation threw:', e);
        }
      }

      // Persist the user message.
      if (userId && activeConvId) {
        persistMessage(activeConvId, 'user', userMessage);
      }

      let conversationHistory: { role: string; content: string }[] = [];
      try {
        conversationHistory = messages.slice(-10).map(m => ({
          role: m.role,
          content: m.content,
        }));
      } catch {
        conversationHistory = [];
      }

      let assumed: { lat: number; lon: number } | null = null;
      try {
        assumed = await getAssumedCoordsIfGranted();
      } catch {
        assumed = null;
      }

      const body = {
        message: userMessage,
        conversationHistory,
        anchor_item_id: anchorItemIdRef.current,
        assumed_current_location: assumed,
      };

      const invokePromise = supabase.functions.invoke('oracle-styling', {
        body,
        headers,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('oracle_styling_timeout_90s')), 90_000);
      });

      const { data: resp, error } = await Promise.race([
        invokePromise,
        timeoutPromise,
      ]) as Awaited<typeof invokePromise>;

      if (error) {
        // Try to surface a server-side friendly message (e.g. guest 429 rate limit).
        let friendly: string | null = null;
        try {
          const ctx: any = (error as any)?.context;
          if (ctx && typeof ctx.json === 'function') {
            const payload = await ctx.json();
            if (payload?.message && typeof payload.message === 'string') {
              friendly = payload.message;
            }
          }
        } catch { /* ignore */ }

        if (friendly) {
          const nudgeMsg: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: friendly,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, nudgeMsg]);
          return;
        }
        throw new Error(error.message || 'Failed to get recommendation');
      }

      const parsed = resp?.data ?? resp ?? {};

      const anchorForMessage = anchorItemIdRef.current ?? null;

      if (parsed?.release_anchor === true && anchorItemIdRef.current) {
        setAnchorItemId(null);
      }

      const replyText = parsed.reply_text || '';
      const followUp = parsed.follow_up_question;
      const content = followUp && !replyText.trim().endsWith(String(followUp).trim())
        ? `${replyText}\n\n${followUp}`.trim()
        : replyText;

      const finalContent = content || "Here's what I'd suggest for you.";
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: finalContent,
        mode: parsed.mode,
        rental_preference: parsed.rental_preference,
        outfit_options: parsed.outfit_options,
        anchor_item_id: anchorForMessage,
        anchor_enforced: parsed?.anchor_enforced ?? true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (userId && activeConvId) {
        persistMessage(activeConvId, 'assistant', finalContent, parsed.outfit_options);
      }
    } catch (error: any) {
      console.error('[useStylingChat] sendMessage failed:', error);
      const hint = error?.name || error?.message
        ? ` (${error?.name || 'Error'}: ${String(error?.message ?? error).slice(0, 140)})`
        : '';
      const isDev = typeof import.meta !== 'undefined' && (import.meta as any)?.env?.DEV;
      toast.error(`Something went wrong. Please try again.${isDev ? hint : ''}`);

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
  }, [messages, setAnchorItemId, setConversationId, persistMessage]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setAnchorItemId(null);
    setConversationId(null);
    sessionStorage.removeItem('guest_chat_messages');
    sessionStorage.removeItem('guest_chat_context');
    sessionStorage.removeItem('guest_session_id');
  }, [setAnchorItemId, setConversationId]);

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const { data, error } = await supabase
        .from('oracle_messages')
        .select('id, role, content, outfit_options, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });
      if (error) {
        toast.error('Could not load conversation.');
        return;
      }
      const loaded: ChatMessage[] = (data || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        outfit_options: m.outfit_options ?? undefined,
        timestamp: new Date(m.created_at),
      }));
      setMessages(loaded);
      setConversationId(convId);
      setAnchorItemId(null);
    } catch (e) {
      console.warn('[oracle-history] loadConversation error:', e);
      toast.error('Could not load conversation.');
    }
  }, [setAnchorItemId, setConversationId]);

  const startAnchoredConversation = useCallback(
    async (itemId: string, itemName: string) => {
      setMessages([]);
      setConversationId(null);
      setAnchorItemId(itemId);
      await Promise.resolve();
      await sendMessage(`Build an outfit around my ${itemName}`);
    },
    [sendMessage, setAnchorItemId, setConversationId],
  );

  return {
    messages,
    isLoading,
    sendMessage,
    clearChat,
    anchorItemId,
    startAnchoredConversation,
    conversationId,
    loadConversation,
  };
};

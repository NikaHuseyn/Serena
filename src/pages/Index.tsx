import React, { useRef, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import BottomNav from '@/components/BottomNav';
import ChatMessage from '@/components/chat/ChatMessage';
import ChatInput from '@/components/chat/ChatInput';
import SuggestionChips from '@/components/chat/SuggestionChips';
import OnboardingFlow from '@/components/OnboardingFlow';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useStylingChat } from '@/hooks/useStylingChat';
import { Sparkles, RotateCcw, Heart, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BudgetProvider } from '@/components/chat/BudgetContext';
import { Card, CardContent } from '@/components/ui/card';

const IndexContent = () => {
  const { shouldShowOnboarding, isLoading: onboardingLoading, user, completeOnboarding } = useOnboarding();
  const { messages, isLoading, sendMessage, clearChat, selectEmotionalTone, selectedEmotionalTone, startAnchoredConversation } = useStylingChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const [nudgeDismissed, setNudgeDismissed] = useState(() => sessionStorage.getItem('guest_nudge_dismissed') === 'true');

  // "Style this" entry point from wardrobe: start a fresh anchored chat.
  const anchorHandledRef = useRef(false);
  useEffect(() => {
    const state = routerLocation.state as { anchorItemId?: string; anchorItemName?: string } | null;
    if (state?.anchorItemId && state?.anchorItemName && !anchorHandledRef.current) {
      anchorHandledRef.current = true;
      // Clear router state so refresh/back doesn't re-fire
      navigate(routerLocation.pathname, { replace: true, state: null });
      startAnchoredConversation(state.anchorItemId, state.anchorItemName);
    }
  }, [routerLocation, navigate, startAnchoredConversation]);

  const suggestions = [
    "Black tie gala this Saturday",
    "Job interview at a creative agency",
    "Beach wedding",
    "1930s themed party",
    "First date at a nice restaurant",
    "Smart casual brunch with friends"
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (onboardingLoading && !user) {
    return null;
  }

  if (user && shouldShowOnboarding) {
    return <OnboardingFlow onComplete={completeOnboarding} />;
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      
      
      <main className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4">
        {!hasMessages ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-semibold text-foreground mb-2 text-center">
              What are you dressing for?
            </h1>
            <p className="text-muted-foreground text-center max-w-md mb-8">
              Get AI styling advice for any occasion, share looks with friends, and build a wardrobe that works
            </p>

            <div className="grid grid-cols-3 gap-6 mb-10 max-w-lg w-full">
              {[
                { icon: Sparkles, label: 'Event-ready outfits', desc: 'Describe any occasion and get a complete look' },
                { icon: Heart, label: 'Style together', desc: 'Share looks, get feedback from friends, and discover what works for you' },
                { icon: MessageCircle, label: 'Refine until it\'s perfect', desc: 'Chat to adjust colors, formality, budget' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex flex-col items-center text-center gap-1.5">
                  <Icon className="h-4 w-4 text-primary/70" />
                  <span className="text-xs font-semibold text-foreground leading-tight">{label}</span>
                  <span className="text-[11px] text-muted-foreground leading-snug">{desc}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground/60 mb-2">Try an example:</p>
            <SuggestionChips suggestions={suggestions} onSelect={sendMessage} />

            {!user && (
              <p className="text-sm text-muted-foreground mt-6 text-center">
                ✨ Sign in to consult your AI stylist, share looks with friends, and build a wardrobe that works for your life.
              </p>
            )}
          </div>
        ) : (
          <div className="flex-1 py-4 overflow-y-auto">
            <div className="space-y-0 divide-y divide-border">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  recommendation={message.recommendation}
                  venueContext={message.venueContext}
                  eventContext={message.eventContext}
                  culturalContext={message.culturalContext}
                  cityClarificationChips={message.cityClarificationChips}
                  onCitySelect={sendMessage}
                  weatherNote={message.weatherNote}
                  wardrobeStatus={message.wardrobeStatus}
                  emotionalToneCards={message.emotionalToneCards}
                  toneRecommendations={message.toneRecommendations}
                  selectedToneId={selectedEmotionalTone}
                  onSelectTone={selectEmotionalTone}
                  shoppingTitle={message.shoppingTitle}
                  outfit_options={message.outfit_options}
                  mode={message.mode}
                  rental_preference={message.rental_preference}
                  anchor_item_id={message.anchor_item_id}
                  onSendMessage={sendMessage}
                />

              ))}
              {isLoading && <ChatMessage role="assistant" content="" isLoading />}
              {/* Guest sign-up nudge: show once after first assistant response */}
              {!user && !nudgeDismissed && messages.filter(m => m.role === 'assistant').length >= 1 && (
                <div className="py-4 px-2">
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                      <p className="text-sm text-foreground">
                        ✨ Sign up to get recommendations from your own wardrobe and save your style preferences.
                      </p>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => { setNudgeDismissed(true); sessionStorage.setItem('guest_nudge_dismissed', 'true'); }}>
                          Maybe later
                        </Button>
                        <Button size="sm" onClick={() => navigate('/auth')}>
                          Sign up
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </div>
        )}

        <div className="sticky bottom-0 bg-background pt-4 pb-6">
          {hasMessages && (
            <div className="flex justify-center mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearChat}
                className="text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                New conversation
              </Button>
            </div>
          )}
          <ChatInput
            onSend={sendMessage}
            isLoading={isLoading}
            placeholder={hasMessages ? "Ask me to adjust, add something, or try a different style..." : "Describe your event or ask for styling advice..."}
          />
        </div>
      </main>
      <BottomNav />
    </div>
  );
};

const Index = () => (
  <BudgetProvider>
    <IndexContent />
  </BudgetProvider>
);

export default Index;

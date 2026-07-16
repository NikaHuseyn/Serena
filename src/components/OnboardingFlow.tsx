import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shirt, Users, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface OnboardingFlowProps {
  onComplete: () => void;
}

interface Slide {
  icon: React.ComponentType<{ className?: string }>;
  heading: string;
  copy: string;
}

// 3 slides in bottom-nav order (Serena is in coming-soon mode; see @/config/features).
const SLIDES: Slide[] = [
  {
    icon: Shirt,
    heading: 'Your wardrobe',
    copy: "Snap what you own — and tap 'Style this' on any piece for outfit ideas built around it.",
  },
  {
    icon: Users,
    heading: 'Ask the girls',
    copy: "Torn between outfits? Post them and let women who get it vote. This is where 'which one should I wear?' gets answered.",
  },
  {
    icon: User,
    heading: 'Your colours',
    copy: "Upload a bare-faced photo in daylight and discover your colour season — the shades that make you glow, chosen the way professional analysts do it. You'll find it in Me, along with your profile.",
  },
];

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const navigate = useNavigate();

  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];
  const Icon = slide.icon;

  const finish = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('user_style_profiles').upsert({
          user_id: user.id,
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' });
      }
      localStorage.setItem('onboarding_completed', 'true');
    } catch (e) {
      console.error('Failed to mark onboarding complete', e);
    }
    onComplete();
    navigate('/community');
  };

  const advance = () => {
    if (isLast) finish();
    else setIndex(i => i + 1);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (dx < -50) advance();
    else if (dx > 50 && index > 0) setIndex(i => i - 1);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex justify-end p-4">
        <Button variant="ghost" size="sm" onClick={finish} className="text-muted-foreground">
          Skip
        </Button>
      </div>

      <div
        className="flex-1 flex flex-col items-center justify-center px-6 max-w-md mx-auto w-full cursor-pointer select-none"
        onClick={advance}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-8">
          <Icon className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-3xl font-semibold text-foreground mb-4 text-center">
          {slide.heading}
        </h1>
        <p className="text-base text-muted-foreground text-center leading-relaxed">
          {slide.copy}
        </p>
      </div>

      <div className="flex flex-col items-center gap-6 pb-10 px-6">
        <div className="flex gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={cn(
                'h-2 rounded-full transition-all',
                i === index ? 'w-6 bg-primary' : 'w-2 bg-primary/25'
              )}
            />
          ))}
        </div>
        {isLast && (
          <Button onClick={finish} size="lg" className="w-full max-w-xs">
            Let's go
          </Button>
        )}
      </div>
    </div>
  );
};

export default OnboardingFlow;

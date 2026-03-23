import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { 
  User, Palette, Calendar, Sparkles, CheckCircle, ArrowRight, ArrowLeft,
  Heart, TrendingUp, Shirt, MapPin
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';


// ── Types ──────────────────────────────────────────────
interface OnboardingFlowProps {
  onComplete: () => void;
}

interface ProfileData {
  displayName: string;
  homeCity: string;
  bodyType: string;
  fitPreference: string;
}

interface StyleData {
  selectedStyles: string[];
  selectedColors: string[];
  itemsToAvoid: string[];
  avoidFreeText: string;
  shoppingPreference: string;
  primaryOccasions: string[];
}

interface OnboardingStep {
  id: string;
  title: string;
  icon: React.ReactNode;
  component: React.ComponentType<any>;
}

// ── Colour map for swatches ────────────────────────────
const COLOR_HEX: Record<string, string> = {
  Black: '#000000', White: '#ffffff', Navy: '#1e3a8a', Beige: '#f5f5dc',
  Gray: '#6b7280', Brown: '#8b4513', Pink: '#ec4899', Blue: '#3b82f6',
  Green: '#10b981', Red: '#ef4444', Yellow: '#f59e0b', Purple: '#8b5cf6',
};

// ── Welcome Step ───────────────────────────────────────
const WelcomeStep: React.FC<{ onNext: () => void; onSkipToCalendar: () => void }> = ({ onNext, onSkipToCalendar }) => (
  <div className="text-center space-y-6 py-8">
    <div className="flex justify-center mb-6">
      <div className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-full">
        <Sparkles className="h-16 w-16 text-primary animate-float" />
      </div>
    </div>
    <div className="space-y-4">
      <h1 className="text-4xl font-bold gradient-text">Welcome to OutfitOracle</h1>
      <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
        Your personal AI-powered fashion assistant that creates perfect outfits for every occasion
      </p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
      <button onClick={onSkipToCalendar} className="card-elegant p-6 text-center hover:shadow-lg transition-all duration-200 hover:scale-105 cursor-pointer">
        <Calendar className="h-12 w-12 text-primary mx-auto mb-4" />
        <h3 className="font-semibold mb-2">Smart Calendar Sync</h3>
        <p className="text-sm text-muted-foreground">Get outfit recommendations based on your events</p>
      </button>
      <div className="card-elegant p-6 text-center">
        <TrendingUp className="h-12 w-12 text-primary mx-auto mb-4" />
        <h3 className="font-semibold mb-2">AI-Powered Trends</h3>
        <p className="text-sm text-muted-foreground">Stay ahead with personalized fashion insights</p>
      </div>
      <div className="card-elegant p-6 text-center">
        <Shirt className="h-12 w-12 text-primary mx-auto mb-4" />
        <h3 className="font-semibold mb-2">Digital Wardrobe</h3>
        <p className="text-sm text-muted-foreground">Organize and maximize your existing clothes</p>
      </div>
    </div>
    <Button onClick={onNext} className="btn-fashion text-lg px-8 py-4 mt-8">
      Let's Get Started <ArrowRight className="h-5 w-5 ml-2" />
    </Button>
  </div>
);

// ── Chip helper ────────────────────────────────────────
const ChipButton: React.FC<{ label: string; selected: boolean; onToggle: () => void }> = ({ label, selected, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className={cn(
      "px-4 py-2.5 rounded-xl border-2 transition-all duration-200 text-sm font-medium",
      selected
        ? "border-primary bg-primary/10 text-primary"
        : "border-border hover:border-primary/50 hover:bg-primary/5"
    )}
  >
    {label}
  </button>
);

// ── Profile Step ───────────────────────────────────────
const ProfileStep: React.FC<{
  data: ProfileData;
  onChange: (d: ProfileData) => void;
  onNext: () => void;
}> = ({ data, onChange, onNext }) => {

  const bodyTypes = ['Petite', 'Tall', 'Curvy', 'Athletic', 'Straight', 'Hourglass', 'Pear', 'Apple'];
  const fitOptions = ['Fitted & tailored', 'Relaxed & loose', 'Depends on the piece', 'Mix of both'];

  

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center mb-6">
        <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 rounded-full w-fit mx-auto mb-4">
          <User className="h-12 w-12 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Tell Us About You</h2>
        <p className="text-muted-foreground">Help us personalise your fashion experience</p>
      </div>

      {/* Name (required) */}
      <div>
        <label className="block text-sm font-medium mb-2">What should we call you? *</label>
        <Input
          placeholder="Your name"
          value={data.displayName}
          onChange={e => onChange({ ...data, displayName: e.target.value })}
        />
      </div>

      {/* City (required) */}
      <div>
        <label className="block text-sm font-medium mb-2">Primary city *</label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="e.g. London, Dubai, New York"
            value={data.homeCity}
            onChange={e => onChange({ ...data, homeCity: e.target.value })}
          />
        </div>
      </div>

      {/* Body type (optional) */}
      <div>
        <label className="block text-sm font-medium mb-3">Body type</label>
        <div className="flex flex-wrap gap-2">
          {bodyTypes.map(bt => (
            <ChipButton
              key={bt}
              label={bt}
              selected={data.bodyType === bt}
              onToggle={() => onChange({ ...data, bodyType: data.bodyType === bt ? '' : bt })}
            />
          ))}
        </div>
      </div>

      {/* Fit preference (optional) */}
      <div>
        <label className="block text-sm font-medium mb-3">What fits do you feel most confident in?</label>
        <div className="flex flex-wrap gap-2">
          {fitOptions.map(fp => (
            <ChipButton
              key={fp}
              label={fp}
              selected={data.fitPreference === fp}
              onToggle={() => onChange({ ...data, fitPreference: data.fitPreference === fp ? '' : fp })}
            />
          ))}
        </div>
      </div>

      <Button onClick={onNext} className="btn-fashion w-full" disabled={!data.displayName.trim() || !data.homeCity.trim()}>
        Continue <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
};

// ── Style Step ─────────────────────────────────────────
const StyleStep: React.FC<{
  data: StyleData;
  onChange: (d: StyleData) => void;
  onNext: () => void;
}> = ({ data, onChange, onNext }) => {
  const styleTypes = [
    'Minimalist', 'Bohemian', 'Classic', 'Edgy', 'Romantic', 'Sporty',
    'Vintage', 'Modern', 'Casual', 'Formal', 'Trendy', 'Artistic'
  ];
  const colorPreferences = ['Black', 'White', 'Navy', 'Beige', 'Gray', 'Brown', 'Pink', 'Blue', 'Green', 'Red', 'Yellow', 'Purple'];
  const avoidOptions = ['Heels', 'Shorts', 'Skirts', 'Dresses', 'Suits', 'Prints & patterns', 'Bright colours', 'Crop tops', 'Sleeveless', 'Leather'];
  const shopOptions = ['Buy new', 'Mix of new and secondhand', 'Prefer secondhand & vintage', 'Love to rent for occasions', 'Sustainability is very important to me'];

  const toggleList = (item: string, list: string[]) =>
    list.includes(item) ? list.filter(i => i !== item) : [...list, item];

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div className="text-center">
        <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 rounded-full w-fit mx-auto mb-4">
          <Palette className="h-12 w-12 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Your Style DNA</h2>
        <p className="text-muted-foreground">Select styles and colours that resonate with you</p>
      </div>

      {/* Style personalities */}
      <div>
        <h3 className="font-semibold mb-4">Style Personalities</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {styleTypes.map(s => (
            <ChipButton key={s} label={s} selected={data.selectedStyles.includes(s)} onToggle={() => onChange({ ...data, selectedStyles: toggleList(s, data.selectedStyles) })} />
          ))}
        </div>
      </div>

      {/* Colour swatches */}
      <div>
        <h3 className="font-semibold mb-4">Favourite Colours</h3>
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
          {colorPreferences.map(color => (
            <button
              key={color}
              type="button"
              onClick={() => onChange({ ...data, selectedColors: toggleList(color, data.selectedColors) })}
              className={cn(
                "p-3 rounded-xl border-2 transition-all duration-200 text-sm font-medium flex items-center gap-2",
                data.selectedColors.includes(color)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/50 hover:bg-primary/5"
              )}
            >
              <span
                className="w-5 h-5 rounded-full flex-shrink-0 border border-border"
                style={{ backgroundColor: COLOR_HEX[color] || '#ddd' }}
              />
              {color}
            </button>
          ))}
        </div>
      </div>

      {/* Items to avoid */}
      <div>
        <h3 className="font-semibold mb-2">Anything you never wear?</h3>
        <p className="text-sm text-muted-foreground mb-4">Optional — helps us avoid items you dislike</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {avoidOptions.map(item => (
            <ChipButton key={item} label={item} selected={data.itemsToAvoid.includes(item)} onToggle={() => onChange({ ...data, itemsToAvoid: toggleList(item, data.itemsToAvoid) })} />
          ))}
        </div>
        <Input
          placeholder="Or describe anything else you avoid..."
          value={data.avoidFreeText}
          onChange={e => onChange({ ...data, avoidFreeText: e.target.value })}
        />
      </div>

      {/* Primary occasions */}
      <div>
        <h3 className="font-semibold mb-2">What do you dress for most?</h3>
        <p className="text-sm text-muted-foreground mb-4">Select your typical occasions</p>
        <div className="flex flex-wrap gap-2">
          {['Work / Office', 'Casual day out', 'Date night', 'Weddings & events', 'Travel', 'Gym & activewear', 'Business meetings', 'Nights out'].map(occ => (
            <ChipButton key={occ} label={occ} selected={data.primaryOccasions.includes(occ)} onToggle={() => onChange({ ...data, primaryOccasions: toggleList(occ, data.primaryOccasions) })} />
          ))}
        </div>
      </div>

      {/* Shopping preference */}
      <div>
        <h3 className="font-semibold mb-2">How do you prefer to shop?</h3>
        <p className="text-sm text-muted-foreground mb-4">Optional</p>
        <div className="flex flex-wrap gap-2">
          {shopOptions.map(opt => (
            <ChipButton key={opt} label={opt} selected={data.shoppingPreference === opt} onToggle={() => onChange({ ...data, shoppingPreference: data.shoppingPreference === opt ? '' : opt })} />
          ))}
        </div>
      </div>

      <Button onClick={onNext} className="btn-fashion w-full" disabled={data.selectedStyles.length === 0 || data.selectedColors.length === 0}>
        Save My Style <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
};

// ── Calendar Step (unchanged) ──────────────────────────
const CalendarStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { googleCalendarService } = await import('@/services/googleCalendarService');
      const success = await googleCalendarService.signInToGoogle();
      if (success) { setConnected(true); setTimeout(onNext, 1000); }
      else { setIsConnecting(false); }
    } catch {
      setIsConnecting(false);
    }
  };

  return (
    <div className="text-center space-y-6 max-w-md mx-auto">
      <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 rounded-full w-fit mx-auto mb-4">
        <Calendar className="h-12 w-12 text-primary" />
      </div>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Connect Your Calendar</h2>
        <p className="text-muted-foreground">Get outfit recommendations tailored to your events and schedule</p>
      </div>
      <div className="card-elegant p-6 space-y-4">
        <div className="flex items-center space-x-3"><CheckCircle className="h-5 w-5 text-success" /><span className="text-sm">Smart event analysis</span></div>
        <div className="flex items-center space-x-3"><CheckCircle className="h-5 w-5 text-success" /><span className="text-sm">Weather-based recommendations</span></div>
        <div className="flex items-center space-x-3"><CheckCircle className="h-5 w-5 text-success" /><span className="text-sm">Outfit planning in advance</span></div>
      </div>
      {!connected ? (
        <div className="space-y-4">
          <Button onClick={handleConnect} className="btn-fashion w-full" disabled={isConnecting}>
            {isConnecting ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Connecting...</>) : (<>Connect Google Calendar<ArrowRight className="h-4 w-4 ml-2" /></>)}
          </Button>
          <Button onClick={onNext} variant="ghost" className="w-full text-muted-foreground">Skip for now</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-center space-x-2 text-success"><CheckCircle className="h-5 w-5" /><span className="font-medium">Calendar Connected!</span></div>
          <p className="text-sm text-muted-foreground">You're all set to receive personalised outfit recommendations</p>
        </div>
      )}
    </div>
  );
};

// ── Completion Step ────────────────────────────────────
const CompletionStep: React.FC<{
  profileData: ProfileData;
  styleData: StyleData;
  onComplete: () => void;
}> = ({ profileData, styleData, onComplete }) => {

  return (
    <div className="text-center space-y-6 py-8">
      <div className="flex justify-center mb-6">
        <div className="p-6 bg-gradient-to-br from-success/10 to-success/5 rounded-full">
          <Heart className="h-16 w-16 text-success animate-bounce-subtle" />
        </div>
      </div>
      <h2 className="text-3xl font-bold text-success">You're all set, {profileData.displayName}!</h2>

      <div className="card-elegant p-6 max-w-md mx-auto text-left space-y-3 text-sm">
        <p>📍 Based in <strong>{profileData.homeCity}</strong></p>
        <p>🎨 Style: <strong>{styleData.selectedStyles.join(' · ') || 'Not set'}</strong></p>
        <p>❤️ Loves: <strong>{styleData.selectedColors.join(', ') || 'Not set'}</strong></p>
        {profileData.bodyType && <p>👤 Body type: <strong>{profileData.bodyType}</strong></p>}
        
        {styleData.shoppingPreference && <p>🛍️ Shopping: <strong>{styleData.shoppingPreference}</strong></p>}
      </div>

      <p className="text-muted-foreground max-w-lg mx-auto">
        Your first recommendation will already be personalised to you. Ask Oracle anything to get started.
      </p>

      <Button onClick={onComplete} className="btn-fashion text-lg px-8 py-4 mt-6">
        Start Styling <ArrowRight className="h-5 w-5 ml-2" />
      </Button>
    </div>
  );
};

// ── Main OnboardingFlow ────────────────────────────────
const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const [profileData, setProfileData] = useState<ProfileData>({
    displayName: '', homeCity: '', bodyType: '', fitPreference: '',
  });

  const [styleData, setStyleData] = useState<StyleData>({
    selectedStyles: [], selectedColors: [], itemsToAvoid: [],
    avoidFreeText: '', shoppingPreference: '', primaryOccasions: [],
  });

  const steps: OnboardingStep[] = [
    { id: 'welcome', title: 'Welcome', icon: <Sparkles className="h-5 w-5" />, component: WelcomeStep },
    { id: 'profile', title: 'Profile', icon: <User className="h-5 w-5" />, component: ProfileStep },
    { id: 'style', title: 'Style', icon: <Palette className="h-5 w-5" />, component: StyleStep },
    { id: 'calendar', title: 'Calendar', icon: <Calendar className="h-5 w-5" />, component: CalendarStep },
    { id: 'complete', title: 'Complete', icon: <CheckCircle className="h-5 w-5" />, component: CompletionStep },
  ];

  const progress = ((currentStep + 1) / steps.length) * 100;
  const handleNext = () => { if (currentStep < steps.length - 1) setCurrentStep(currentStep + 1); };
  const handleSkipToCalendar = () => setCurrentStep(3);
  const handlePrevious = () => { if (currentStep > 0) setCurrentStep(currentStep - 1); };

  const handleComplete = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Merge avoid chips + free text
      const allAvoid = [
        ...styleData.itemsToAvoid,
        ...(styleData.avoidFreeText.trim() ? [styleData.avoidFreeText.trim()] : []),
      ];

      // Single upsert with all onboarding data
      await supabase.from('user_style_profiles').upsert({
        user_id: user.id,
        display_name: profileData.displayName,
        home_city: profileData.homeCity,
        body_type: profileData.bodyType || null,
        fit_preference: profileData.fitPreference || null,
        style_personality: styleData.selectedStyles,
        preferred_colors: styleData.selectedColors,
        items_to_avoid: allAvoid,
        shopping_preference: styleData.shoppingPreference || null,
        primary_occasions: styleData.primaryOccasions.length > 0 ? styleData.primaryOccasions : null,
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
      } as any);

      // Backup localStorage
      localStorage.setItem('onboarding_completed', 'true');
    }
    onComplete();
  };

  const CurrentStepComponent = steps[currentStep].component;

  // Build step-specific props
  const stepProps: Record<string, any> = {
    welcome: { onNext: handleNext, onSkipToCalendar: handleSkipToCalendar },
    profile: { data: profileData, onChange: setProfileData, onNext: handleNext },
    style: { data: styleData, onChange: setStyleData, onNext: handleNext },
    calendar: { onNext: handleNext },
    complete: { profileData, styleData, onComplete: handleComplete },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface via-surface-variant to-surface flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-2">
              {steps[currentStep].icon}
              <span className="font-medium">{steps[currentStep].title}</span>
            </div>
            <span className="text-sm text-muted-foreground">{currentStep + 1} of {steps.length}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card className="card-elegant p-8">
          <CurrentStepComponent {...stepProps[steps[currentStep].id]} />
        </Card>

        {currentStep > 0 && currentStep < steps.length - 1 && (
          <div className="flex justify-center mt-6">
            <Button onClick={handlePrevious} variant="ghost" className="text-muted-foreground">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingFlow;

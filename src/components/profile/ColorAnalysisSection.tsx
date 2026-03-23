
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Camera, Upload, Loader2, Sparkles, Palette, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ColorAnalysis {
  skin_tone: string;
  undertone: string;
  seasonal_type: string;
  best_colours: string[];
  colours_to_avoid: string[];
  styling_advice: string;
}

interface StyleProfile {
  analysis_image_url?: string;
  color_analysis?: ColorAnalysis | null;
}

interface ColorAnalysisSectionProps {
  profile: StyleProfile | null;
  analysisImage: File | null;
  onAnalysisImageChange: (file: File | null) => void;
}

const COLOUR_MAP: Record<string, string> = {
  black: '#000000', white: '#ffffff', navy: '#1e3a8a', beige: '#f5f5dc',
  gray: '#6b7280', grey: '#6b7280', brown: '#8b4513', pink: '#ec4899',
  blue: '#3b82f6', green: '#10b981', red: '#ef4444', yellow: '#f59e0b',
  purple: '#8b5cf6', orange: '#f97316', teal: '#14b8a6', coral: '#f87171',
  burgundy: '#800020', olive: '#808000', cream: '#fffdd0', ivory: '#fffff0',
  lavender: '#e6e6fa', mauve: '#e0b0ff', rust: '#b7410e', sage: '#b2ac88',
  terracotta: '#e2725b', turquoise: '#40e0d0', gold: '#ffd700', silver: '#c0c0c0',
  charcoal: '#36454f', khaki: '#c3b091', maroon: '#800000', plum: '#8e4585',
  'dusty rose': '#dcae96', 'deep red': '#8b0000', 'soft pink': '#ffb6c1',
  'warm white': '#faf0e6', 'off-white': '#f5f5f0', 'deep blue': '#00008b',
  'forest green': '#228b22', 'emerald green': '#50c878', 'cobalt blue': '#0047ab',
  'sky blue': '#87ceeb', 'royal blue': '#4169e1', 'rose': '#ff007f',
  'camel': '#c19a6b', 'peach': '#ffcba4', 'mint': '#98ff98',
};

function getColourHex(name: string): string | null {
  const key = name.toLowerCase().trim();
  return COLOUR_MAP[key] || null;
}

const ColourSwatch: React.FC<{ colour: string; variant?: 'best' | 'avoid' }> = ({ colour, variant = 'best' }) => {
  const hex = getColourHex(colour);
  return (
    <div className="flex items-center gap-2">
      {hex ? (
        <span
          className={cn(
            "w-6 h-6 rounded-full border flex-shrink-0",
            variant === 'avoid' ? "border-destructive/30" : "border-border"
          )}
          style={{ backgroundColor: hex }}
        />
      ) : (
        <span className="w-6 h-6 rounded-full border border-border bg-muted flex-shrink-0" />
      )}
      <span className="text-sm capitalize">{colour}</span>
    </div>
  );
};

const ColorAnalysisSection = ({ profile, analysisImage, onAnalysisImageChange }: ColorAnalysisSectionProps) => {
  const { toast } = useToast();
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const analysis = profile?.color_analysis as ColorAnalysis | null;

  const handleFileSelect = (file: File | null) => {
    onAnalysisImageChange(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleAnalyse = async () => {
    if (!analysisImage) return;

    setIsAnalysing(true);
    try {
      // 1. Get user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in first');

      // 2. Upload to Supabase Storage
      const fileExt = analysisImage.name.split('.').pop() || 'jpg';
      const filePath = `${user.id}/color-analysis.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(filePath, analysisImage, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(filePath);

      // 3. Call edge function
      const { data, error } = await supabase.functions.invoke('color-analysis', {
        body: { imageUrl: publicUrl },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: 'Analysis complete ✨',
        description: `You're a ${data.analysis.seasonal_type}!`,
      });

      // Reload profile to show results
      window.location.reload();
    } catch (error: any) {
      console.error('Colour analysis error:', error);
      toast({
        title: 'Analysis failed',
        description: error.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalysing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Colour Analysis
          <span className="text-sm text-muted-foreground font-normal">(Optional)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload section */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="analysis_image" className="text-sm font-medium">
              Upload a well-lit photo of your face for AI colour analysis
            </Label>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Natural lighting works best — avoid heavy filters or makeup
            </p>
            <Input
              id="analysis_image"
              type="file"
              accept="image/*"
              onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              className="mt-1"
            />
          </div>

          {/* Preview */}
          {(previewUrl || profile?.analysis_image_url) && (
            <div className="flex items-start gap-4">
              <img
                src={previewUrl || profile?.analysis_image_url}
                alt="Analysis photo"
                className="w-24 h-24 rounded-xl object-cover border border-border"
              />
              {analysisImage && (
                <Button
                  onClick={handleAnalyse}
                  disabled={isAnalysing}
                  className="mt-2"
                >
                  {isAnalysing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analysing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Analyse My Colours
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        {analysis && (
          <div className="space-y-6 pt-4 border-t border-border">
            {/* Season & tone summary */}
            <div className="flex flex-wrap gap-3">
              <Badge variant="secondary" className="text-sm px-3 py-1.5">
                <Palette className="h-3.5 w-3.5 mr-1.5" />
                {analysis.seasonal_type}
              </Badge>
              <Badge variant="outline" className="text-sm px-3 py-1.5 capitalize">
                Skin: {analysis.skin_tone}
              </Badge>
              <Badge variant="outline" className="text-sm px-3 py-1.5 capitalize">
                Undertone: {analysis.undertone}
              </Badge>
            </div>

            {/* Best colours */}
            <div>
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                Your Best Colours
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {analysis.best_colours.map((colour) => (
                  <ColourSwatch key={colour} colour={colour} variant="best" />
                ))}
              </div>
            </div>

            {/* Colours to avoid */}
            <div>
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                Colours to Avoid
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {analysis.colours_to_avoid.map((colour) => (
                  <ColourSwatch key={colour} colour={colour} variant="avoid" />
                ))}
              </div>
            </div>

            {/* Styling advice */}
            <div className="bg-muted/50 rounded-xl p-4">
              <h4 className="font-semibold text-sm mb-2">Styling Advice</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {analysis.styling_advice}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ColorAnalysisSection;


import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Camera, Loader2, Sparkles, Palette, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ColourItem {
  name: string;
  hex: string;
}

interface Dimension {
  verdict: string;
  evidence: string;
}

interface ColorAnalysis {
  status?: 'ok' | 'retake';
  retake_reason?: string | null;
  season?: string | null;
  secondary_season?: string | null;
  confidence?: 'high' | 'medium' | 'low';
  skin_tone: string;
  undertone: Dimension | string;
  value?: Dimension;
  chroma?: Dimension;
  best_colours: ColourItem[] | string[];
  avoid_colours?: ColourItem[];
  colours_to_avoid?: string[];
  summary?: string;
  styling_advice?: string;
  seasonal_type?: string;
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

function normaliseColour(c: ColourItem | string): ColourItem {
  if (typeof c === 'string') return { name: c, hex: '' };
  return { name: c?.name || '', hex: c?.hex || '' };
}

const ColourSwatch: React.FC<{ colour: ColourItem; variant?: 'best' | 'avoid' }> = ({ colour, variant = 'best' }) => {
  const hex = colour.hex && /^#[0-9a-fA-F]{6}$/.test(colour.hex) ? colour.hex : null;
  return (
    <div className="flex items-center gap-2">
      {hex ? (
        <span
          className={cn(
            'w-6 h-6 rounded-full border flex-shrink-0',
            variant === 'avoid' ? 'border-destructive/30' : 'border-border',
          )}
          style={{ backgroundColor: hex }}
        />
      ) : (
        <span className="w-6 h-6 rounded-full border border-border bg-muted flex-shrink-0" />
      )}
      <span className="text-sm capitalize">{colour.name}</span>
    </div>
  );
};

const confidenceVariant = (c?: string) =>
  c === 'high' ? 'default' : c === 'low' ? 'destructive' : 'secondary';

const ColorAnalysisSection = ({ profile, analysisImage, onAnalysisImageChange }: ColorAnalysisSectionProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [storedSignedUrl, setStoredSignedUrl] = useState<string | null>(null);
  const [retakeReason, setRetakeReason] = useState<string | null>(null);

  // Generate a signed URL for the stored analysis image path on render.
  React.useEffect(() => {
    let cancelled = false;
    const path = profile?.analysis_image_url;
    if (!path) {
      setStoredSignedUrl(null);
      return;
    }
    // If it's already a full URL (legacy), just use it.
    if (/^https?:\/\//i.test(path)) {
      setStoredSignedUrl(path);
      return;
    }
    supabase.storage
      .from('profile-photos')
      .createSignedUrl(path, 60 * 15)
      .then(({ data }) => {
        if (!cancelled) setStoredSignedUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.analysis_image_url]);

  const analysis = profile?.color_analysis as ColorAnalysis | null;
  const isValidAnalysis = !!analysis && analysis.status !== 'retake' && Array.isArray(analysis.best_colours);

  const undertoneObj = typeof analysis?.undertone === 'object' ? analysis?.undertone as Dimension : undefined;
  const undertoneVerdict = typeof analysis?.undertone === 'string' ? analysis?.undertone : undertoneObj?.verdict;

  const handleFileSelect = (file: File | null) => {
    onAnalysisImageChange(file);
    setRetakeReason(null);
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
    setRetakeReason(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in first');

      const fileExt = analysisImage.name.split('.').pop() || 'jpg';
      const filePath = `${user.id}/color-analysis-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(filePath, analysisImage, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(filePath);

      const { data, error } = await supabase.functions.invoke('color-analysis', {
        body: { imageUrl: publicUrl },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const result: ColorAnalysis = data.analysis;

      if (result.status === 'retake') {
        setRetakeReason(result.retake_reason || 'Please try a clearer photo in even natural light.');
        toast({
          title: 'Photo needs a retake',
          description: result.retake_reason || 'Please try again with better lighting.',
        });
        return;
      }

      toast({
        title: 'Analysis complete ✨',
        description: result.season ? `You're a ${result.season}!` : 'Your colour analysis is ready.',
      });

      // Refresh the profile query so results update in place.
      await queryClient.invalidateQueries({ queryKey: ['userStyleProfile'] });
      onAnalysisImageChange(null);
      setPreviewUrl(null);
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

  const bestColours = (analysis?.best_colours || []).map(normaliseColour);
  const avoidColours = (analysis?.avoid_colours || (analysis?.colours_to_avoid as any) || []).map(normaliseColour);

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

          {(previewUrl || profile?.analysis_image_url) && (
            <div className="flex items-start gap-4">
              <img
                src={previewUrl || profile?.analysis_image_url}
                alt="Analysis photo"
                className="w-24 h-24 rounded-xl object-cover border border-border"
              />
              {analysisImage && (
                <Button onClick={handleAnalyse} disabled={isAnalysing} className="mt-2">
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

          {retakeReason && (
            <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/40">
              <RefreshCw className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Let's try another photo</p>
                <p className="text-sm text-muted-foreground">{retakeReason}</p>
              </div>
            </div>
          )}
        </div>

        {isValidAnalysis && analysis && (
          <div className="space-y-6 pt-4 border-t border-border">
            <div className="flex flex-wrap gap-2">
              {analysis.season && (
                <Badge variant="secondary" className="text-sm px-3 py-1.5">
                  <Palette className="h-3.5 w-3.5 mr-1.5" />
                  {analysis.season}
                </Badge>
              )}
              {analysis.secondary_season && (
                <Badge variant="outline" className="text-sm px-3 py-1.5">
                  Secondary: {analysis.secondary_season}
                </Badge>
              )}
              {analysis.confidence && (
                <Badge variant={confidenceVariant(analysis.confidence) as any} className="text-sm px-3 py-1.5 capitalize">
                  {analysis.confidence} confidence
                </Badge>
              )}
              <Badge variant="outline" className="text-sm px-3 py-1.5 capitalize">
                Skin: {analysis.skin_tone}
              </Badge>
              {undertoneVerdict && (
                <Badge variant="outline" className="text-sm px-3 py-1.5 capitalize">
                  Undertone: {undertoneVerdict}
                </Badge>
              )}
            </div>

            {(undertoneObj?.evidence || analysis.value?.evidence || analysis.chroma?.evidence) && (
              <div className="grid gap-3 sm:grid-cols-3">
                {undertoneObj?.evidence && (
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Undertone · <span className="capitalize">{undertoneObj.verdict}</span>
                    </p>
                    <p className="text-sm mt-1 leading-relaxed">{undertoneObj.evidence}</p>
                  </div>
                )}
                {analysis.value?.evidence && (
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Value · <span className="capitalize">{analysis.value.verdict}</span>
                    </p>
                    <p className="text-sm mt-1 leading-relaxed">{analysis.value.evidence}</p>
                  </div>
                )}
                {analysis.chroma?.evidence && (
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Chroma · <span className="capitalize">{analysis.chroma.verdict}</span>
                    </p>
                    <p className="text-sm mt-1 leading-relaxed">{analysis.chroma.evidence}</p>
                  </div>
                )}
              </div>
            )}

            <div>
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                Your Best Colours
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {bestColours.map((c, i) => (
                  <ColourSwatch key={`${c.name}-${i}`} colour={c} variant="best" />
                ))}
              </div>
            </div>

            {avoidColours.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  Colours to Avoid
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {avoidColours.map((c, i) => (
                    <ColourSwatch key={`${c.name}-${i}`} colour={c} variant="avoid" />
                  ))}
                </div>
              </div>
            )}

            {(analysis.summary || analysis.styling_advice) && (
              <div className="bg-muted/50 rounded-xl p-4">
                <h4 className="font-semibold text-sm mb-2">Styling Advice</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {analysis.summary || analysis.styling_advice}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ColorAnalysisSection;

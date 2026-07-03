
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Send, X, Loader2, ImagePlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import SafeImage from '@/components/SafeImage';
import RichCaptionInput from './RichCaptionInput';
import BrandPicker from './BrandPicker';
import LocationInput from './LocationInput';
import { extractHashtags, extractMentionedUserIds, type MentionMap } from '@/lib/captionParsing';

interface PostCreationFormProps {
  onCreatePost: (postData: {
    caption: string;
    tags?: string[];
    image_urls: string[];
    post_type?: string;
    occasion_context?: string;
    poll_question?: string;
    mentioned_user_ids?: string[];
    brand_tags?: string[];
    location?: string | null;
  }) => Promise<void>;
  onClose: () => void;
}

const MAX_PHOTOS = 10;

const PostCreationForm = ({ onCreatePost, onClose }: PostCreationFormProps) => {
  const [caption, setCaption] = useState('');
  const [mentionMap, setMentionMap] = useState<MentionMap>({});
  const [brandSlugs, setBrandSlugs] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const images = files.filter(f => f.type.startsWith('image/'));

    // Reset input so the same file(s) can be reselected later
    e.target.value = '';

    if (images.length === 0) return;

    const remaining = MAX_PHOTOS - selectedFiles.length;
    const toProcess = images.slice(0, remaining);
    if (images.length > remaining) {
      toast.error(`Only ${MAX_PHOTOS} photos allowed per post`);
    }

    // Every selected photo is compressed so uploads stay light (~1MB each).
    const compressingToast = toast.loading(
      `Compressing ${toProcess.length} photo${toProcess.length > 1 ? 's' : ''}…`
    );

    const { ImageProcessor } = await import('@/utils/imageProcessing');
    const processed: File[] = [];
    let failed = 0;

    for (const file of toProcess) {
      try {
        const blob = await ImageProcessor.compressImage(file, { maxSizeMB: 1, maxWidthOrHeight: 1600 });
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        processed.push(new File([blob], file.name.replace(/\.[^.]+$/, '') + `.${ext}`, { type: blob.type || file.type }));
      } catch {
        failed++;
      }
    }

    toast.dismiss(compressingToast);
    if (failed > 0) toast.error(`${failed} photo${failed > 1 ? 's' : ''} couldn't be compressed`);
    if (processed.length === 0) return;

    setSelectedFiles(prev => [...prev, ...processed]);
    const urls = processed.map(f => URL.createObjectURL(f));
    setPreviewUrls(prev => [...prev, ...urls]);
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (userId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of selectedFiles) {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from('community-photos')
        .upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data: urlData } = supabase.storage
        .from('community-photos')
        .getPublicUrl(path);
      urls.push(urlData.publicUrl);
    }
    return urls;
  };

  const handleCreatePost = async () => {
    if (selectedFiles.length === 0 && !caption.trim()) {
      toast.error('Add a photo or write something to share');
      return;
    }
    try {
      setSubmitting(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to post');
        return;
      }

      let imageUrls: string[] = [];
      if (selectedFiles.length > 0) {
        imageUrls = await uploadFiles(user.id);
      }

      const tags = extractHashtags(caption);
      const mentioned = extractMentionedUserIds(caption, mentionMap);

      await onCreatePost({
        caption: caption.trim(),
        tags,
        image_urls: imageUrls,
        post_type: 'single',
        mentioned_user_ids: mentioned,
        brand_tags: brandSlugs,
        location: location.trim() || null,
      });

      setCaption('');
      setMentionMap({});
      setBrandSlugs([]);
      setLocation('');
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      setPreviewUrls([]);
      setSelectedFiles([]);
      onClose();
    } catch (err) {
      console.error('Failed to create post:', err);
      toast.error('Failed to create post. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-2 border-border">
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <span className="text-primary-foreground text-sm font-medium">You</span>
            </div>
            <div>
              <p className="font-medium text-foreground">Share with the community</p>
              <p className="text-sm text-muted-foreground">
                Tag people with @, topics with #, brands and your location
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          {previewUrls.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  {selectedFiles.length} of {MAX_PHOTOS} photos selected
                </p>
                {selectedFiles.length < MAX_PHOTOS && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 px-2 text-primary"
                  >
                    <ImagePlus className="h-4 w-4 mr-1" />
                    Add more
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {previewUrls.map((url, i) => (
                  <div
                    key={`${url}-${i}`}
                    className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted group"
                  >
                    <SafeImage
                      src={url}
                      alt={`Selected photo ${i + 1}`}
                      className="w-full h-full object-cover"
                      showFallback
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      aria-label={`Remove photo ${i + 1}`}
                      className="absolute top-2 right-2 bg-background/90 text-foreground rounded-full p-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground shadow-sm"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    {i === 0 && (
                      <span className="absolute bottom-2 left-2 bg-primary text-primary-foreground text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        Main
                      </span>
                    )}
                  </div>
                ))}
                {selectedFiles.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors flex flex-col items-center justify-center bg-muted/50 cursor-pointer"
                  >
                    <Camera className="h-6 w-6 text-muted-foreground mb-1" />
                    <span className="text-xs text-muted-foreground">Add photo</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-muted border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
            >
              <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">
                Add photos (up to {MAX_PHOTOS}) — optional
              </p>
            </button>
          )}

          <RichCaptionInput
            value={caption}
            onChange={(v, m) => {
              setCaption(v);
              setMentionMap(m);
            }}
            mentionMap={mentionMap}
            placeholder="What's the occasion? Try @username, #ootd, tag brands…"
            rows={3}
          />

          <LocationInput value={location} onChange={setLocation} />

          <BrandPicker value={brandSlugs} onChange={setBrandSlugs} />

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleCreatePost} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Posting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Share
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PostCreationForm;

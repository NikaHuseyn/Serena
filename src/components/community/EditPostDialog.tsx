import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, ImagePlus, Loader2, Save, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import SafeImage from '@/components/SafeImage';

const MAX_PHOTOS = 10;
const MAX_SIZE = 5 * 1024 * 1024;

interface ExistingImage {
  kind: 'existing';
  url: string;
}
interface NewImage {
  kind: 'new';
  url: string; // object URL preview
  file: File;
}
type Slot = ExistingImage | NewImage;

interface EditPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: {
    id: string;
    user_id: string;
    caption: string | null;
    image_urls: string[];
  };
  onSave: (postId: string, updates: { caption: string; image_urls: string[] }) => Promise<void>;
}

const EditPostDialog = ({ open, onOpenChange, post, onSave }: EditPostDialogProps) => {
  const [caption, setCaption] = useState(post.caption || '');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCaption(post.caption || '');
      setSlots((post.image_urls || []).map((url) => ({ kind: 'existing', url })));
    }
  }, [open, post.caption, post.image_urls]);

  useEffect(() => {
    return () => {
      slots.forEach((s) => {
        if (s.kind === 'new') URL.revokeObjectURL(s.url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const images = files.filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    if (images.length === 0) return;

    const remaining = MAX_PHOTOS - slots.length;
    const toProcess = images.slice(0, remaining);
    if (images.length > remaining) {
      toast.error(`Only ${MAX_PHOTOS} photos allowed per post`);
    }

    const oversized = toProcess.filter((f) => f.size > MAX_SIZE).length;
    let compressingToast: string | number | undefined;
    if (oversized > 0) {
      compressingToast = toast.loading(`Compressing ${oversized} large photo${oversized > 1 ? 's' : ''}…`);
    }

    const { ImageProcessor } = await import('@/utils/imageProcessing');
    const processed: File[] = [];
    let failed = 0;
    for (const file of toProcess) {
      if (file.size <= MAX_SIZE) {
        processed.push(file);
        continue;
      }
      try {
        const blob = await ImageProcessor.compressImage(file, { maxSizeMB: 4.5, maxWidthOrHeight: 1920 });
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        processed.push(new File([blob], file.name.replace(/\.[^.]+$/, '') + `.${ext}`, { type: blob.type || file.type }));
      } catch {
        failed++;
      }
    }
    if (compressingToast !== undefined) toast.dismiss(compressingToast);
    if (failed > 0) toast.error(`${failed} photo${failed > 1 ? 's' : ''} couldn't be compressed`);
    if (processed.length === 0) return;

    const newSlots: NewImage[] = processed.map((file) => ({
      kind: 'new',
      file,
      url: URL.createObjectURL(file),
    }));
    setSlots((prev) => [...prev, ...newSlots]);
  };

  const removeAt = (index: number) => {
    setSlots((prev) => {
      const slot = prev[index];
      if (slot?.kind === 'new') URL.revokeObjectURL(slot.url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSave = async () => {
    if (slots.length === 0 && !caption.trim()) {
      toast.error('Add a photo or write something');
      return;
    }
    try {
      setSaving(true);
      const finalUrls: string[] = [];
      for (const slot of slots) {
        if (slot.kind === 'existing') {
          finalUrls.push(slot.url);
        } else {
          const ext = slot.file.name.split('.').pop() || 'jpg';
          const path = `${post.user_id}/${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage
            .from('community-photos')
            .upload(path, slot.file, { contentType: slot.file.type });
          if (error) throw error;
          const { data: urlData } = supabase.storage.from('community-photos').getPublicUrl(path);
          finalUrls.push(urlData.publicUrl);
        }
      }

      await onSave(post.id, { caption: caption.trim(), image_urls: finalUrls });
      toast.success('Post updated');
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to update post:', err);
      toast.error('Failed to update post');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit post</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          {slots.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  {slots.length} of {MAX_PHOTOS} photos
                </p>
                {slots.length < MAX_PHOTOS && (
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
                {slots.map((slot, i) => (
                  <div
                    key={`${slot.url}-${i}`}
                    className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted group"
                  >
                    <SafeImage src={slot.url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" showFallback />
                    <button
                      type="button"
                      onClick={() => removeAt(i)}
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
                    {slot.kind === 'new' && (
                      <span className="absolute top-2 left-2 bg-accent text-accent-foreground text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        New
                      </span>
                    )}
                  </div>
                ))}
                {slots.length < MAX_PHOTOS && (
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
              <p className="text-muted-foreground">Add photos (up to {MAX_PHOTOS})</p>
            </button>
          )}

          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Update your caption..."
            rows={4}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditPostDialog;

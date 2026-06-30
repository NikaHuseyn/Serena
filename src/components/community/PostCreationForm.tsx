
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Send, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PostCreationFormProps {
  onCreatePost: (postData: {
    caption: string;
    tags?: string[];
    image_urls: string[];
    post_type?: string;
    occasion_context?: string;
    poll_question?: string;
  }) => Promise<void>;
  onClose: () => void;
}

const MAX_PHOTOS = 10;

const PostCreationForm = ({ onCreatePost, onClose }: PostCreationFormProps) => {
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const tooLarge = files.filter(f => f.size > 5 * 1024 * 1024).length;
    const validFiles = files.filter(f => f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024);

    // Reset input so the same file(s) can be reselected later
    e.target.value = '';

    if (tooLarge > 0) {
      toast.error(`${tooLarge} photo${tooLarge > 1 ? 's' : ''} skipped (max 5MB each)`);
    }
    if (validFiles.length === 0) return;

    const remaining = MAX_PHOTOS - selectedFiles.length;
    const toAdd = validFiles.slice(0, remaining);
    if (validFiles.length > remaining) {
      toast.error(`Only ${MAX_PHOTOS} photos allowed per post`);
    }

    setSelectedFiles(prev => [...prev, ...toAdd]);
    const urls = toAdd.map(f => URL.createObjectURL(f));
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

      await onCreatePost({
        caption: caption.trim(),
        tags: [],
        image_urls: imageUrls,
        post_type: 'single',
      });

      setCaption('');
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
                Post your look, ask for opinions, or just tell us about your day
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
            <div className="flex gap-2 overflow-x-auto pb-2">
              {previewUrls.map((url, i) => (
                <div key={i} className="relative flex-shrink-0 w-28 rounded-lg overflow-hidden border border-border">
                  <img src={url} alt={`Photo ${i + 1}`} className="w-28 h-28 object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 bg-background/80 rounded-full p-1 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {selectedFiles.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-shrink-0 flex flex-col items-center justify-center w-28 h-28 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors cursor-pointer"
                >
                  <Camera className="h-5 w-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground mt-1">Add more</span>
                </button>
              )}
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

          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="What's the occasion? Ask for opinions, share your look, or just say hi..."
            rows={3}
          />

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

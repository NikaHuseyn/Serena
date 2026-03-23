
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

const PostCreationForm = ({ onCreatePost, onClose }: PostCreationFormProps) => {
  const [postType, setPostType] = useState<'single' | 'poll'>('poll');
  const [newPostText, setNewPostText] = useState('');
  const [occasionContext, setOccasionContext] = useState('');
  const [pollQuestion, setPollQuestion] = useState('Which one?');
  const [submitting, setSubmitting] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxPhotos = postType === 'poll' ? 5 : 10;
  const minPhotos = postType === 'poll' ? 2 : 0;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(f => f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024);
    if (validFiles.length === 0) return;

    const remaining = maxPhotos - selectedFiles.length;
    const toAdd = validFiles.slice(0, remaining);

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
    if (postType === 'poll' && selectedFiles.length < 2) {
      toast.error('Upload at least 2 outfit photos for a poll');
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
        caption: newPostText || '',
        tags: [],
        image_urls: imageUrls,
        post_type: postType,
        occasion_context: postType === 'poll' && occasionContext.trim() ? occasionContext.trim() : undefined,
        poll_question: postType === 'poll' ? (pollQuestion.trim() || 'Which one?') : undefined,
      });

      setNewPostText('');
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
          {/* Post type selector */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPostType('single')}
              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors border ${
                postType === 'single'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              📸 Share a look
            </button>
            <button
              type="button"
              onClick={() => setPostType('poll')}
              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors border ${
                postType === 'poll'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              👗 Which should I wear?
            </button>
          </div>

          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <span className="text-primary-foreground text-sm font-medium">You</span>
            </div>
            <div>
              <p className="font-medium text-foreground">
                {postType === 'poll' ? 'Get outfit feedback' : 'Share your outfit'}
              </p>
              <p className="text-sm text-muted-foreground">
                {postType === 'poll'
                  ? `Upload ${minPhotos}–${maxPhotos} outfit options for the community to vote on`
                  : 'Show off your style to the community'}
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Photo upload area */}
          {previewUrls.length > 0 ? (
            <div className="space-y-2">
              <div className="flex gap-2 overflow-x-auto pb-2">
                {previewUrls.map((url, i) => (
                  <div key={i} className="relative flex-shrink-0 w-28 rounded-lg overflow-hidden border border-border">
                    <img src={url} alt={`Option ${i + 1}`} className="w-28 h-28 object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 bg-background/80 rounded-full p-1 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {postType === 'poll' && (
                      <div className="absolute bottom-0 left-0 right-0 bg-background/80 text-center py-0.5">
                        <span className="text-[10px] font-medium text-foreground">Option {i + 1}</span>
                      </div>
                    )}
                  </div>
                ))}
                {selectedFiles.length < maxPhotos && (
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
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-muted border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
            >
              <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">
                {postType === 'poll'
                  ? 'Upload 2–5 outfit options'
                  : 'Click to upload outfit photo'}
              </p>
            </button>
          )}

          {/* Poll-specific fields */}
          {postType === 'poll' && (
            <>
              <Input
                value={occasionContext}
                onChange={(e) => setOccasionContext(e.target.value)}
                placeholder="e.g. sister's wedding, outdoor July, smart casual. Leave blank if you prefer not to share"
              />
              <Input
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Which one?"
              />
            </>
          )}

          <Input
            value={newPostText}
            onChange={(e) => setNewPostText(e.target.value)}
            placeholder={postType === 'poll'
              ? 'Add a caption (optional)...'
              : 'Describe your outfit, occasion, or styling tips...'}
          />

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleCreatePost}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  {postType === 'poll' ? 'Post Poll' : 'Share'}
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

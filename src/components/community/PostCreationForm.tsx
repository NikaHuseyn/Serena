
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Send, X } from 'lucide-react';

interface PostCreationFormProps {
  onCreatePost: (postData: { caption: string; tags?: string[]; image_urls: string[] }) => Promise<void>;
  onClose: () => void;
}

const PostCreationForm = ({ onCreatePost, onClose }: PostCreationFormProps) => {
  const [newPostText, setNewPostText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(f => f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024);
    if (validFiles.length === 0) return;
    setSelectedFiles(prev => [...prev, ...validFiles]);
    const urls = validFiles.map(f => URL.createObjectURL(f));
    setPreviewUrls(prev => [...prev, ...urls]);
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreatePost = async () => {
    // Allow posting without text
    
    try {
      setSubmitting(true);
      await onCreatePost({
        caption: newPostText || '',
        tags: ['New', 'Style'],
        image_urls: ['/placeholder-outfit-new.jpg'] // Placeholder for now
      });
      
      setNewPostText('');
      onClose();
    } catch (err) {
      console.error('Failed to create post:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-2 border-pink-200">
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-rose-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">You</span>
            </div>
            <div>
              <p className="font-medium">Share your outfit</p>
              <p className="text-sm text-gray-500">Show off your style to the community</p>
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

          {previewUrls.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {previewUrls.map((url, i) => (
                <div key={i} className="relative rounded-lg overflow-hidden border border-border">
                  <img src={url} alt="Upload preview" className="w-full h-32 object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 bg-background/80 rounded-full p-1 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors cursor-pointer"
              >
                <Camera className="h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground mt-1">Add more</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-muted border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
            >
              <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">Click to upload outfit photo</p>
            </button>
          )}
          
          <Input
            value={newPostText}
            onChange={(e) => setNewPostText(e.target.value)}
            placeholder="Describe your outfit, occasion, or styling tips..."
            className="resize-none"
          />
          
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreatePost}
              disabled={submitting}
              className="bg-gradient-to-r from-pink-500 to-rose-600"
            >
              <Send className="h-4 w-4 mr-2" />
              {submitting ? 'Sharing...' : 'Share'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PostCreationForm;

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface LikeEntry {
  user_id: string;
  created_at: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface LikesListDialogProps {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LikesListDialog: React.FC<LikesListDialogProps> = ({ postId, open, onOpenChange }) => {
  const [loading, setLoading] = useState(false);
  const [likes, setLikes] = useState<LikeEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('likes')
        .select('user_id, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error || !data) {
        setLikes([]);
        setLoading(false);
        return;
      }
      const userIds = Array.from(new Set(data.map((r: any) => r.user_id)));
      let profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('social_profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', userIds);
        (profiles || []).forEach((p: any) => {
          profileMap.set(p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url });
        });
      }
      if (cancelled) return;
      setLikes(
        data.map((r: any) => ({
          user_id: r.user_id,
          created_at: r.created_at,
          display_name: profileMap.get(r.user_id)?.display_name ?? null,
          avatar_url: profileMap.get(r.user_id)?.avatar_url ?? null,
        }))
      );
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, postId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Liked by</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : likes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No likes yet.</p>
          ) : (
            <ul className="space-y-2">
              {likes.map((l) => (
                <li key={l.user_id}>
                  <Link
                    to={`/profile/${l.user_id}`}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center gap-3 rounded-lg p-2 hover:bg-primary/5 transition-colors"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={l.avatar_url || undefined} />
                      <AvatarFallback>
                        {l.display_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">
                      {l.display_name || 'Anonymous User'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LikesListDialog;

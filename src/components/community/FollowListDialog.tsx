import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface PersonEntry {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface FollowListDialogProps {
  userId: string;
  mode: 'followers' | 'following';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FollowListDialog: React.FC<FollowListDialogProps> = ({ userId, mode, open, onOpenChange }) => {
  const [loading, setLoading] = useState(false);
  const [people, setPeople] = useState<PersonEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const matchColumn = mode === 'followers' ? 'following_id' : 'follower_id';
      const selectColumn = mode === 'followers' ? 'follower_id' : 'following_id';

      const { data, error } = await supabase
        .from('followers')
        .select(`${selectColumn}, created_at`)
        .eq(matchColumn, userId)
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (error || !data) {
        setPeople([]);
        setLoading(false);
        return;
      }

      const ids = Array.from(new Set(data.map((r: any) => r[selectColumn])));
      const profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from('social_profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', ids);
        (profiles || []).forEach((p: any) => {
          profileMap.set(p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url });
        });
      }

      if (cancelled) return;
      setPeople(
        ids.map((id) => ({
          user_id: id as string,
          display_name: profileMap.get(id as string)?.display_name ?? null,
          avatar_url: profileMap.get(id as string)?.avatar_url ?? null,
        }))
      );
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, userId, mode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === 'followers' ? 'Followers' : 'Following'}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : people.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {mode === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {people.map((p) => (
                <li key={p.user_id}>
                  <Link
                    to={`/profile/${p.user_id}`}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center gap-3 rounded-lg p-2 hover:bg-primary/5 transition-colors"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={p.avatar_url || undefined} />
                      <AvatarFallback>{p.display_name?.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{p.display_name || 'Anonymous User'}</span>
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

export default FollowListDialog;

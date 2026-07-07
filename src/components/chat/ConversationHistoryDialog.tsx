import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

interface Conversation {
  id: string;
  title: string | null;
  updated_at: string;
}

interface ConversationHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
}

const ConversationHistoryDialog: React.FC<ConversationHistoryDialogProps> = ({
  open,
  onOpenChange,
  onSelect,
}) => {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('oracle_conversations')
        .select('id, title, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setItems(data || []);
    } catch (e) {
      console.warn('[history] load failed:', e);
      toast.error('Could not load conversation history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('oracle_conversations').delete().eq('id', id);
      if (error) throw error;
      setItems(prev => prev.filter(c => c.id !== id));
      toast.success('Conversation deleted');
    } catch (e) {
      console.warn('[history] delete failed:', e);
      toast.error('Could not delete conversation.');
    } finally {
      setPendingDelete(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    } catch { return ''; }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conversation history</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto -mx-2">
            {loading ? (
              <p className="text-sm text-muted-foreground px-2 py-4">Loading…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground px-2 py-4">No saved conversations yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map(c => (
                  <li key={c.id} className="flex items-center gap-2 px-2 py-3">
                    <button
                      className="flex-1 text-left min-w-0"
                      onClick={() => { onSelect(c.id); onOpenChange(false); }}
                    >
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground truncate">
                          {c.title || 'Untitled conversation'}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground pl-6">
                        {formatDate(c.updated_at)}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingDelete(c.id)}
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the conversation and its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelete && handleDelete(pendingDelete)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ConversationHistoryDialog;

import React from 'react';
import { User, Sparkles } from 'lucide-react';
import OutfitOptionCards from './OutfitOptionCards';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isLoading?: boolean;
  /** Oracle v2 option cards */
  outfit_options?: any[];
  mode?: 'wardrobe_only' | 'shop_new';
  rental_preference?: 'both' | 'buy_only' | 'rent_only';
  styling_category?: 'womenswear' | 'menswear' | 'mixed';
  /** Active "Style this" anchor (wardrobe item id). */
  anchor_item_id?: string | null;
  onSendMessage?: (message: string) => void;
}

const ChatMessage = ({
  role,
  content,
  isLoading,
  outfit_options,
  mode,
  rental_preference,
  styling_category,
  anchor_item_id,
  onSendMessage,
}: ChatMessageProps) => {
  const isUser = role === 'user';

  if (isLoading) {
    return (
      <div className="flex gap-4 py-6">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 pt-1">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-4 py-6 ${isUser ? '' : 'bg-muted/30'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-primary text-primary-foreground' : 'bg-primary/10'
      }`}>
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4 text-primary" />}
      </div>
      <div className="flex-1 pt-1">
        <p className="text-foreground whitespace-pre-wrap">{content}</p>
        {!isUser && outfit_options && outfit_options.length > 0 && (
          <OutfitOptionCards
            options={outfit_options}
            mode={mode}
            rentalPreference={rental_preference}
            stylingCategory={styling_category}
            anchorItemId={anchor_item_id}
            onSelect={(msg) => onSendMessage?.(msg)}
          />
        )}
      </div>
    </div>
  );
};

export default ChatMessage;

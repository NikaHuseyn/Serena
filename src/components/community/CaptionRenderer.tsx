import React from 'react';
import { Link } from 'react-router-dom';
import { tokeniseCaption } from '@/lib/captionParsing';

interface CaptionRendererProps {
  caption: string;
  // mention text (lowercased, no @) -> user_id
  mentionedUserIds?: string[];
  mentionMap?: Record<string, string>;
  className?: string;
}

const CaptionRenderer = ({ caption, mentionMap = {}, className }: CaptionRendererProps) => {
  const tokens = tokeniseCaption(caption || '');
  return (
    <p className={`text-foreground whitespace-pre-wrap break-words ${className || ''}`}>
      {tokens.map((t, i) => {
        if (t.type === 'text') return <React.Fragment key={i}>{t.value}</React.Fragment>;
        if (t.type === 'hashtag') {
          return (
            <Link
              key={i}
              to={`/community?tag=${encodeURIComponent(t.value)}`}
              className="text-primary hover:underline"
            >
              {t.raw}
            </Link>
          );
        }
        // mention
        const userId = mentionMap[t.value];
        if (userId) {
          return (
            <Link key={i} to={`/profile/${userId}`} className="text-primary font-medium hover:underline">
              {t.raw}
            </Link>
          );
        }
        return (
          <span key={i} className="text-primary font-medium">
            {t.raw}
          </span>
        );
      })}
    </p>
  );
};

export default CaptionRenderer;

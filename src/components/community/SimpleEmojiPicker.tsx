import React, { useMemo, useState } from 'react';

interface SimpleEmojiPickerProps {
  onSelect: (emoji: string) => void;
}

const CATEGORIES: { name: string; emojis: string[] }[] = [
  {
    name: 'Smileys',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
      '😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐',
      '🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒',
      '🤕','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️',
      '😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞',
      '😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡',
    ],
  },
  {
    name: 'Gestures & People',
    emojis: [
      '👋','🤚','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇',
      '☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💅','🤳','💪',
      '🦵','🦶','👂','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','💋','👶','🧒',
      '👦','👧','🧑','👱','👨','👩','🧓','👴','👵','💃','🕺','🧍','🧎','🚶','🏃',
    ],
  },
  {
    name: 'Fashion',
    emojis: [
      '👗','👘','🥻','🩱','🩲','🩳','👙','👚','👕','👖','🧣','🧤','🧥','🧦','👔','👠',
      '👡','🥿','👢','👞','👟','🥾','🧢','👒','🎩','🎓','⛑️','👑','💍','👛','👜','👝',
      '🛍️','🎒','💼','🧳','👓','🕶️','🥽','💄','💋','💎','🪮','🪒','🌂','☂️','🧴','🧵',
    ],
  },
  {
    name: 'Hearts & Symbols',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖',
      '💘','💝','💟','✨','⭐','🌟','💫','⚡','🔥','💥','💯','✅','❌','❓','❗','💬',
    ],
  },
  {
    name: 'Food & Drink',
    emojis: [
      '🍎','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🥝','🍑','🥥','🥑','🍅','🥕','🌽','🥦',
      '🥬','🥒','🌶️','🥖','🥐','🧀','🥚','🍳','🥞','🥓','🍔','🍟','🍕','🌭','🥪','🌮',
      '🌯','🥗','🍝','🍣','🍱','🍤','🍦','🍩','🍪','🎂','🍰','🧁','🍫','🍿','🍷','🍸',
      '🍹','🍺','🥂','🥃','☕','🍵','🧋','🥤',
    ],
  },
  {
    name: 'Travel & Places',
    emojis: [
      '🌍','🌎','🌏','🗺️','🏔️','🌋','🏖️','🏝️','🏙️','🌆','🌇','🌃','🌉','🗽','🗼','🏰',
      '🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏕️','✈️','🚗','🚕','🚙','🚌','🚎','🏎️',
      '🚂','🚆','🛳️','⛵','🛶','🚤','🛥️','🛩️','🚁','🛸','🚀',
    ],
  },
  {
    name: 'Activities',
    emojis: [
      '🎉','🎊','🎈','🎁','🎀','🪩','🎂','🎄','🎃','🎗️','🎟️','🎫','🎖️','🏆','🥇','🥈',
      '🥉','⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🎱','🏓','🏸','🥊','🥋','🎽','⛳',
      '🎯','🎮','🎲','🎰','🎨','🎭','🎬','🎤','🎧','🎼','🎹','🥁','🎸','🎺','🎻',
    ],
  },
  {
    name: 'Nature',
    emojis: [
      '🌸','💐','🌹','🥀','🌺','🌻','🌼','🌷','🌱','🌿','☘️','🍀','🍃','🍂','🍁','🌾',
      '🌵','🌴','🌳','🌲','🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮',
      '🐷','🐸','🐵','🐔','🐧','🐦','🦄','🐝','🦋','🐢','🐠','🐬','🦈','🌞','🌝','🌚',
      '🌙','⭐','☁️','⛅','🌧️','⛈️','🌈','❄️','☃️','💧','🌊',
    ],
  },
];

const SimpleEmojiPicker = ({ onSelect }: SimpleEmojiPickerProps) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    if (!query.trim()) return CATEGORIES[activeIdx].emojis;
    // simple search: just flatten all and show all (no metadata for names)
    return CATEGORIES.flatMap((c) => c.emojis);
  }, [activeIdx, query]);

  return (
    <div className="w-[280px] bg-popover text-popover-foreground">
      {/* Category tabs */}
      <div
        className="flex items-center gap-0.5 px-1.5 pt-1.5 pb-1 border-b border-border overflow-x-auto"
        style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin' }}
      >
        {CATEGORIES.map((cat, i) => (
          <button
            key={cat.name}
            type="button"
            title={cat.name}
            onMouseDown={(e) => {
              e.preventDefault();
              setActiveIdx(i);
              setQuery('');
            }}
            className={`text-base leading-none px-2 py-1 rounded transition-colors shrink-0 ${
              i === activeIdx && !query
                ? 'bg-accent'
                : 'hover:bg-accent/60 opacity-70'
            }`}
          >
            {cat.emojis[0]}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="max-h-[220px] overflow-y-auto p-1.5">
        <div className="grid grid-cols-8 gap-0.5">
          {visible.map((emoji, i) => (
            <button
              key={emoji + i}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(emoji);
              }}
              className="text-xl leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-accent transition-colors"
              style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SimpleEmojiPicker;

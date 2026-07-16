import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, Shirt, Users, User } from 'lucide-react';
import { useCommunityNotifications } from '@/hooks/useCommunityNotifications';
import { SERENA_CHAT_ENABLED } from '@/config/features';

const tabs = [
  { path: '/app', label: 'Serena', icon: Sparkles },
  { path: '/wardrobe', label: 'Wardrobe', icon: Shirt },
  { path: '/community', label: 'Community', icon: Users },
  { path: '/profile', label: 'Me', icon: User },
];

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount } = useCommunityNotifications();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {tabs.map(({ path, label, icon: Icon }) => {
          const active = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`relative flex flex-col items-center gap-0.5 px-4 py-1.5 transition-colors ${
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[11px] ${active ? 'font-semibold' : 'font-medium'}`}>
                {label}
              </span>
              {label === 'Community' && unreadCount > 0 && (
                <span className="absolute -top-0.5 right-2 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;



import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Shirt, Users, User, TrendingUp } from 'lucide-react';

interface NavigationProps {
  user: any;
}

const Navigation = ({ user }: NavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navigationItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/wardrobe', label: 'Wardrobe', icon: Shirt, requiresAuth: true },
    
    { path: '/fashion-trends', label: 'Fashion Trends', icon: TrendingUp },
    { path: '/community', label: 'Community', icon: Users },
    { path: '/profile', label: 'Profile', icon: User, requiresAuth: true },
  ];

  return (
    <nav className="hidden md:flex items-center space-x-6">
      {navigationItems.map((item) => {
        const Icon = item.icon;
        const isAuthRequired = item.requiresAuth && !user;
        
        return (
          <button
            key={item.path}
            onClick={() => {
              if (isAuthRequired) {
                navigate('/auth');
              } else {
                navigate(item.path);
              }
            }}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
              isActive(item.path)
                ? 'bg-gradient-to-r from-rose-100 to-pink-100 text-rose-700'
                : 'text-gray-600 hover:text-rose-600 hover:bg-rose-50'
            } ${isAuthRequired ? 'opacity-75' : ''}`}
          >
            <Icon className="h-4 w-4" />
            <span className="font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default Navigation;

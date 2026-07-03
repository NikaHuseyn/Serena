
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Menu, X, Home, Shirt, Users, User, LogOut, TrendingUp } from 'lucide-react';

interface MobileMenuProps {
  user: any;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  onSignOut: () => void;
}

const MobileMenu = ({ user, mobileMenuOpen, setMobileMenuOpen, onSignOut }: MobileMenuProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navigationItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/wardrobe', label: 'Wardrobe', icon: Shirt, requiresAuth: true },
    
    { path: '/fashion-trends', label: 'Fashion Trends', icon: TrendingUp },
    { path: '/community', label: 'Community', icon: Users },
  ];

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        className="md:hidden p-2 rounded-lg hover:bg-gray-100"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        {mobileMenuOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Menu className="h-5 w-5" />
        )}
      </button>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-rose-100 py-4">
          <nav className="space-y-2">
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
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors ${
                    isActive(item.path)
                      ? 'bg-gradient-to-r from-rose-100 to-pink-100 text-rose-700'
                      : 'text-gray-600 hover:text-rose-600 hover:bg-rose-50'
                  } ${isAuthRequired ? 'opacity-75' : ''}`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
          
          {/* Mobile User Actions */}
          {user && (
            <div className="border-t border-rose-100 mt-4 pt-4 space-y-2">
              <div className="flex items-center space-x-3 px-3 py-2 bg-gradient-to-r from-rose-50 to-pink-50 rounded-lg">
                <User className="h-4 w-4 text-rose-600" />
                <span className="text-sm font-medium text-gray-700">
                  {user.email?.split('@')[0]}
                </span>
              </div>
              <Button
                onClick={onSignOut}
                variant="outline"
                className="w-full border-rose-200 text-rose-600 hover:bg-rose-50"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default MobileMenu;

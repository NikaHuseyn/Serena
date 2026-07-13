
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Award, Star, Heart, Users, Camera, TrendingUp } from 'lucide-react';

interface BadgeDisplayProps {
  badges: Array<{
    name: string;
    description: string | null;
    icon: string | null;
  }>;
  showDescription?: boolean;
  limit?: number;
}

const BadgeDisplay = ({ badges, showDescription = false, limit }: BadgeDisplayProps) => {
  const displayBadges = limit ? badges.slice(0, limit) : badges;

  const getBadgeIcon = (iconName: string | null) => {
    switch (iconName) {
      case 'camera': return <Camera className="h-3 w-3" />;
      case 'heart': return <Heart className="h-3 w-3" />;
      case 'users': return <Users className="h-3 w-3" />;
      case 'trending-up': return <TrendingUp className="h-3 w-3" />;
      case 'star': return <Star className="h-3 w-3" />;
      default: return <Award className="h-3 w-3" />;
    }
  };

  const getBadgeVariant = (iconName: string | null) => {
    switch (iconName) {
      case 'camera': return 'secondary' as const;
      case 'heart': return 'destructive' as const;
      default: return 'outline' as const;
    }
  };

  if (badges.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {displayBadges.map((badge, index) => (
          <Badge key={index} variant={getBadgeVariant(badge.icon)} className="flex items-center gap-1">
            {getBadgeIcon(badge.icon)}
            {badge.name}
          </Badge>
        ))}
        {limit && badges.length > limit && (
          <Badge variant="outline" className="text-xs">
            +{badges.length - limit} more
          </Badge>
        )}
      </div>
      {showDescription && displayBadges.length > 0 && (
        <div className="space-y-1 text-xs text-muted-foreground">
          {displayBadges.map((badge, index) => (
            <div key={index}>
              <strong>{badge.name}:</strong> {badge.description}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BadgeDisplay;

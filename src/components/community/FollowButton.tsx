
import React from 'react';
import { Button } from '@/components/ui/button';
import { UserPlus, UserMinus } from 'lucide-react';
import { useFollows } from '@/hooks/useFollows';

interface FollowButtonProps {
  userId: string;
  size?: 'sm' | 'default' | 'lg';
}

const FollowButton = ({ userId, size = 'sm' }: FollowButtonProps) => {
  const { isFollowing, toggleFollow, loading } = useFollows();

  const following = isFollowing(userId);

  return (
    <Button
      onClick={() => toggleFollow(userId)}
      disabled={loading}
      size={size}
      variant={following ? 'outline' : 'default'}
    >
      {following ? (
        <>
          <UserMinus className="h-4 w-4" />
          Following
        </>
      ) : (
        <>
          <UserPlus className="h-4 w-4" />
          Follow
        </>
      )}
    </Button>
  );
};

export default FollowButton;

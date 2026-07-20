import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Campaign {
  id: string;
  brand_name: string;
  brand_logo_url: string | null;
}

// Module-level cache so we don't refetch the same campaign for every post/image.
const campaignCache = new Map<string, Campaign | null>();
const inflight = new Map<string, Promise<Campaign | null>>();

async function fetchCampaign(id: string): Promise<Campaign | null> {
  if (campaignCache.has(id)) return campaignCache.get(id) ?? null;
  if (inflight.has(id)) return inflight.get(id)!;
  const p = supabase
    .from('campaigns')
    .select('id, brand_name, brand_logo_url')
    .eq('id', id)
    .maybeSingle()
    .then(({ data }) => {
      const value = (data as Campaign | null) ?? null;
      campaignCache.set(id, value);
      inflight.delete(id);
      return value;
    })
    .catch(() => {
      campaignCache.set(id, null);
      inflight.delete(id);
      return null;
    });
  inflight.set(id, p);
  return p;
}

interface CampaignBadgeProps {
  campaignId: string | null | undefined;
  className?: string;
}

/**
 * Small UI overlay pinned to the top-right of a post image when the post
 * belongs to a campaign. Renders nothing when campaignId is null/undefined
 * or the campaign lookup fails. Never touches the underlying image file.
 */
const CampaignBadge: React.FC<CampaignBadgeProps> = ({ campaignId, className }) => {
  const [campaign, setCampaign] = useState<Campaign | null>(
    campaignId ? campaignCache.get(campaignId) ?? null : null
  );

  useEffect(() => {
    if (!campaignId) {
      setCampaign(null);
      return;
    }
    let alive = true;
    fetchCampaign(campaignId).then((c) => {
      if (alive) setCampaign(c);
    });
    return () => {
      alive = false;
    };
  }, [campaignId]);

  if (!campaignId || !campaign) return null;

  return (
    <div
      className={
        'absolute top-2 right-2 z-10 pointer-events-none ' + (className ?? '')
      }
    >
      {campaign.brand_logo_url ? (
        <div className="bg-background/80 backdrop-blur-sm rounded-full p-1 shadow-sm">
          <img
            src={campaign.brand_logo_url}
            alt={campaign.brand_name}
            className="h-6 w-6 object-contain rounded-full"
            loading="lazy"
          />
        </div>
      ) : (
        <span className="bg-background/80 backdrop-blur-sm text-foreground text-[10px] font-medium px-2 py-1 rounded-full shadow-sm">
          {campaign.brand_name}
        </span>
      )}
    </div>
  );
};

export default CampaignBadge;

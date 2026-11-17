'use client';

import { Trophy } from 'lucide-react';

import { SoonSection } from '@/components/shell/soon-section';

export default function LeaderboardPage() {
  return (
    <SoonSection
      navKey="leaderboard"
      icon={<Trophy className="size-14" strokeWidth={2.4} />}
      headlineKey="sections.leaderboard.headline"
      subKey="sections.leaderboard.sub"
      ctaKey="sections.leaderboard.cta"
    />
  );
}

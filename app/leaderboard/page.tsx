'use client';

import { LeagueTrophies, SoonSection } from '@/components/shell/soon-section';

export default function LeaderboardPage() {
  return (
    <SoonSection
      navKey="leaderboard"
      headlineKey="sections.leaderboard.headline"
      subKey="sections.leaderboard.sub"
      ctaKey="sections.leaderboard.cta"
    >
      <LeagueTrophies />
    </SoonSection>
  );
}

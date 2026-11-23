'use client';

import { useStatsSync } from '@/lib/hooks/use-stats-sync';

/** Global mount so real activity syncs to the shared leaderboard on any page. */
export function StatsSyncInit() {
  useStatsSync();
  return null;
}

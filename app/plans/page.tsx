'use client';

import { Target } from 'lucide-react';

import { SoonSection } from '@/components/shell/soon-section';

export default function StudyPlansPage() {
  return (
    <SoonSection
      navKey="plans"
      icon={<Target className="size-14" strokeWidth={2.4} />}
      headlineKey="sections.plans.headline"
      subKey="sections.plans.sub"
      ctaKey="sections.plans.cta"
    />
  );
}

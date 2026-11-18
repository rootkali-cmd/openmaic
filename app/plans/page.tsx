'use client';

import { Target } from 'lucide-react';

import { SoonSection } from '@/components/shell/soon-section';

export default function StudyPlansPage() {
  return (
    <SoonSection
      navKey="plans"
      icon={<Target />}
      headlineKey="sections.plans.headline"
      subKey="sections.plans.sub"
      ctaKey="sections.plans.cta"
      actionKey="sections.plans.action"
    />
  );
}

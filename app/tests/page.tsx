'use client';

import { Layers } from 'lucide-react';

import { SoonSection } from '@/components/shell/soon-section';

export default function TestsPage() {
  return (
    <SoonSection
      navKey="tests"
      icon={<Layers />}
      headlineKey="sections.tests.headline"
      subKey="sections.tests.sub"
      ctaKey="sections.tests.cta"
      actionKey="sections.tests.action"
      variant="card"
    />
  );
}

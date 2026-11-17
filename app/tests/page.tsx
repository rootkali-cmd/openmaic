'use client';

import { ClipboardList } from 'lucide-react';

import { SoonSection } from '@/components/shell/soon-section';

export default function TestsPage() {
  return (
    <SoonSection
      navKey="tests"
      icon={<ClipboardList className="size-14" strokeWidth={2.4} />}
      headlineKey="sections.tests.headline"
      subKey="sections.tests.sub"
      ctaKey="sections.tests.cta"
    />
  );
}

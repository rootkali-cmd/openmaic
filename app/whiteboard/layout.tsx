import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './whiteboard.css';

/**
 * The whiteboard loads its own handwriting faces: Caveat carries latin and
 * numerals, Aref Ruqaa carries Arabic (verified to ship an Arabic subset).
 * Declared here rather than globally so the rest of the app never pays for
 * fonts it does not use.
 */
export const metadata: Metadata = {
  title: 'السبورة الذكية · Darsak AI',
  description: 'مدرس ذكي بيشرح ويرسم على السبورة في نفس اللحظة — بالعربية.',
};

// This route owns its handwriting faces; loading them globally would make
// every page in the app pay for two fonts only the board uses.
/* eslint-disable @next/next/no-page-custom-font */
export default function WhiteboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=Caveat:wght@500;600;700&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
import { Suspense } from 'react';
import { ResearchNav } from './ResearchNav';

// Fills <main> (a fixed-height region): the layer switch + universe toggle are FROZEN (flex-none),
// and the page below gets a bounded, scrollable region (flex-1 min-h-0) so each page owns its own
// scroll panes without the window scrolling.
export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-none">
        <Suspense fallback={<div className="h-10" />}>
          <ResearchNav />
        </Suspense>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
}

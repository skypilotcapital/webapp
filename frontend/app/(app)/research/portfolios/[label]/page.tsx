'use client';

import { useParams } from 'next/navigation';
import { BacktestReport } from '@/components/portfolio/BacktestReport';

export default function BacktestReportPage() {
  const label = decodeURIComponent((useParams().label as string) || '');
  return <BacktestReport label={label} />;
}

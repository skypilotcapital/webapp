import { redirect } from 'next/navigation';

export default async function PortfolioMonitorEnv({ params }: { params: Promise<{ env: string }> }) {
  const { env } = await params;
  redirect(`/portfolio-monitor/${env}/holdings`);
}

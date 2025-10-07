import SharedReportClient from '@/components/shared-report-client';

export default async function SharedReportPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  return <SharedReportClient token={token} />
}


import { redirect } from 'next/navigation';

export default async function AcademyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/academies/${id}/overview`);
}

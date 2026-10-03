import { SignedInHome } from '@/components/auth/signed-in-home';

export const dynamic = 'force-dynamic';

/** Manage home (Phase 5 builds Today; until then the signed-in landing, flag `p2-role-homes`). */
export default function TodayPage() {
  return <SignedInHome path="/today" experience="manage" />;
}

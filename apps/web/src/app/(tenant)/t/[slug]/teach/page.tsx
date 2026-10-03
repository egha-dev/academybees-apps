import { SignedInHome } from '@/components/auth/signed-in-home';

export const dynamic = 'force-dynamic';

/** Teacher home (Phase 6 builds the Teacher PWA; until then the signed-in landing). */
export default function TeachPage() {
  return <SignedInHome path="/teach" experience="teach" />;
}

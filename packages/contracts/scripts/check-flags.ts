// pnpm flags:check — fail CI when a release flag is past its expiry date (ADR-041): flags must be
// removed within one phase of full rollout, not left to rot.
import { expiredFeatureFlags, FEATURE_FLAGS } from '../src/flags.js';

const today = process.env.FLAGS_CHECK_DATE ?? new Date().toISOString().slice(0, 10);
const expired = expiredFeatureFlags(today);

for (const [key, def] of Object.entries(FEATURE_FLAGS)) {
  const mark = expired.includes(key as keyof typeof FEATURE_FLAGS) ? '✖ EXPIRED' : '✔';
  console.warn(`${mark} ${key} — owner ${def.owner}, remove by ${def.expiresOn}`);
}
if (expired.length > 0) {
  console.error(
    `\n${expired.length} release flag(s) past expiry on ${today}: remove them or agree a new date with the owner.`,
  );
  process.exit(1);
}

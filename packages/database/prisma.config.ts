// Prisma CLI configuration (migrations run as the schema owner ab_migrator, ADR-005).
// Runtime clients never read this file; they get their URLs from the app config.
import { defineConfig } from 'prisma/config';

try {
  // Local convenience: packages/database/.env (`pnpm env:init`). CI and deploys pass real env vars.
  process.loadEnvFile(new URL('.env', import.meta.url));
} catch {
  // no .env file — rely on the environment
}

export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // `prisma generate` does not connect; a placeholder keeps it working without a .env.
    url: process.env.MIGRATOR_DATABASE_URL ?? 'postgresql://placeholder@localhost:5432/placeholder',
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});

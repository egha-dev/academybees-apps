import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // no .env — rely on the environment (CI, deploy jobs)
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Run \`pnpm env:init\` or export it.`);
    process.exit(1);
  }
  return value;
}

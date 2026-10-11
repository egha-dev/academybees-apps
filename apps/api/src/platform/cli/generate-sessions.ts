// `pnpm scheduling:generate` — queue session generation for every open academy now (C-112),
// instead of waiting for the nightly 02:00 IST run. The running API does the work (each academy
// in its own tenant context); this only adds one platform job. Local and staging.
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { z } from 'zod';

const env = z
  .object({
    REDIS_URL: z.string().min(1),
    APP_ENV: z.enum(['local', 'ci', 'staging', 'production']),
  })
  .parse(process.env);
if (env.APP_ENV === 'production') {
  process.stderr.write('Refusing: production generates sessions on its nightly schedule.\n');
  process.exit(1);
}
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue('platform-jobs', { connection });
await queue.add(
  'manual-sessions',
  {},
  { removeOnComplete: { count: 30 }, removeOnFail: { count: 30 } },
);
await queue.close();
connection.disconnect();
process.stdout.write(
  'Queued: the API generates the next 28 days of classes for every open academy.\n',
);

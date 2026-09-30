import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

export const REDIS_IMAGE = 'redis:7-alpine';

export type StartedRedis = {
  container: StartedRedisContainer;
  url: string;
  stop: () => Promise<void>;
};

export async function startRedis(): Promise<StartedRedis> {
  const container = await new RedisContainer(REDIS_IMAGE)
    .withCommand(['redis-server', '--maxmemory-policy', 'noeviction'])
    .start();
  return {
    container,
    url: container.getConnectionUrl(),
    stop: async () => void (await container.stop()),
  };
}

/**
 * Upstash Redis 客户端封装
 * ------------------------
 * - 通过 @upstash/redis 提供的 Redis REST SDK 访问云端 Redis
 * - 在本地开发且未配置 Upstash 环境变量时，自动退化为「进程内内存计数器」，避免 500 报错
 * - 对外暴露一个通用的限流帮助方法：incrementAndCheckLimit
 *   - 使用递增计数 + 过期时间控制访问频率
 *   - 典型用法：IP 限流、地址限流、接口限流等
 */
import { Redis } from "@upstash/redis";

type RedisLike = {
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<unknown>;
};

function createRedisClient(): RedisLike {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  // 如果本地未配置 Upstash，则使用内存版 Redis，避免本地开发时报错 500
  if (!url || !token) {
    // 简单的进程内计数器实现，满足 incr / expire 语义即可
    const store = new Map<string, { value: number; expireAt: number | null }>();

    return {
      async incr(key: string): Promise<number> {
        const now = Date.now();
        const current = store.get(key);

        if (current && current.expireAt && now > current.expireAt) {
          // 过期后重置计数
          store.set(key, { value: 1, expireAt: current.expireAt });
          return 1;
        }

        if (!current) {
          store.set(key, { value: 1, expireAt: null });
          return 1;
        }

        const next = current.value + 1;
        store.set(key, { ...current, value: next });
        return next;
      },
      async expire(key: string, ttlSeconds: number): Promise<unknown> {
        const current = store.get(key);
        const expireAt = Date.now() + ttlSeconds * 1000;

        if (!current) {
          store.set(key, { value: 0, expireAt });
        } else {
          store.set(key, { ...current, expireAt });
        }

        return true;
      },
    };
  }

  // 生产或已配置 Upstash 时，使用真实 Redis 客户端
  return Redis.fromEnv();
}

const redis: RedisLike = createRedisClient();

/**
 * 自增某个限流 key，并判断是否仍在允许范围内。
 *
 * @param key 限流键，例如 faucet:ip:1.2.3.4 或 faucet:addr:0xabc...
 * @param maxCount 在 TTL 时间内允许的最大请求次数
 * @param ttlSeconds 过期时间（秒），用于控制限流窗口大小
 * @returns 允许访问返回 true，超出限额返回 false
 */
export async function incrementAndCheckLimit(
  key: string,
  maxCount: number,
  ttlSeconds: number
): Promise<boolean> {
  // 自增该 key 的访问计数，如果 key 不存在则会初始化为 1。
  const current = await redis.incr(key);

  // 第一次访问时设置过期时间，形成「滑动窗口」风格的固定周期限流。
  if (current === 1) {
    await redis.expire(key, ttlSeconds);
  }

  return current <= maxCount;
}


/**
 * Upstash Redis 客户端封装
 * ------------------------
 * - 通过 @upstash/redis 提供的 Redis REST SDK 访问云端 Redis
 * - 对外暴露一个通用的限流帮助方法：incrementAndCheckLimit
 *   - 使用递增计数 + 过期时间控制访问频率
 *   - 典型用法：IP 限流、地址限流、接口限流等
 */
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

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


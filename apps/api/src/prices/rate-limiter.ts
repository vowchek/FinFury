/**
 * Простой rate limiter для внешних API.
 * Ограничивает количество запросов в минуту.
 */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxRequestsPerMinute: number,
  ) {}

  /** Проверить, не превышен ли лимит. Если превышен — бросить RateLimitError. */
  check(): void {
    const now = Date.now();
    const windowStart = now - 60_000;
    // очищаем старые записи
    this.timestamps = this.timestamps.filter((t) => t > windowStart);

    if (this.timestamps.length >= this.maxRequestsPerMinute) {
      throw new RateLimitError(this.maxRequestsPerMinute);
    }

    this.timestamps.push(now);
  }
}

export class RateLimitError extends Error {
  constructor(limit: number) {
    super(`Rate limit exceeded: max ${limit} req/min`);
    this.name = 'RateLimitError';
  }
}

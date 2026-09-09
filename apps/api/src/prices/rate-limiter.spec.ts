import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter, RateLimitError } from './rate-limiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('пропускает запросы в пределах лимита', () => {
    const limiter = new RateLimiter(3);
    expect(() => limiter.check()).not.toThrow();
    expect(() => limiter.check()).not.toThrow();
    expect(() => limiter.check()).not.toThrow();
  });

  it('бросает RateLimitError при превышении лимита', () => {
    const limiter = new RateLimiter(2);
    limiter.check();
    limiter.check();
    expect(() => limiter.check()).toThrow(RateLimitError);
  });

  it('сбрасывает окно через 60 секунд', () => {
    const limiter = new RateLimiter(1);
    limiter.check(); // 1-й запрос — ок
    expect(() => limiter.check()).toThrow(RateLimitError); // превышение

    vi.advanceTimersByTime(60_001); // +60 сек

    expect(() => limiter.check()).not.toThrow(); // окно сброшено
  });
});

// Reference implementation. The page runs this file to produce its scenario and its
// burst chart, and shows this same file in the code tab, so what you read is what ran.
//
// The algorithms are stateless: each one turns (state, now) into allow or reject and
// updates the state. RateLimiter keeps one state per client in a store. Here the store is
// a Map; in production it is Redis, and `take` runs as one Lua script so it is atomic.

// Refills `rate` tokens per second up to `capacity`. Each request spends one.
export class TokenBucket {
  constructor(rate, capacity) { this.rate = rate; this.capacity = capacity; }
  init(now) { return { tokens: this.capacity, at: now }; }
  take(s, now) {
    s.tokens = Math.min(this.capacity, s.tokens + ((now - s.at) / 1000) * this.rate);
    s.at = now;
    if (s.tokens < 1) return false;
    s.tokens -= 1;
    return true;
  }
  describe(s) { return `${s.tokens.toFixed(2)} tokens`; }
}

// Counts requests in fixed windows aligned to the clock: [0,1000), [1000,2000), ...
export class FixedWindow {
  constructor(limit, windowMs) { this.limit = limit; this.windowMs = windowMs; }
  init(now) { return { start: now - (now % this.windowMs), count: 0 }; }
  take(s, now) {
    const start = now - (now % this.windowMs);
    if (start !== s.start) { s.start = start; s.count = 0; } // a new window forgets the old one
    if (s.count >= this.limit) return false;
    s.count += 1;
    return true;
  }
  describe(s) { return `${s.count} of ${this.limit} in window from ${s.start} ms`; }
}

// Keeps the time of every allowed request in the last window. Exact, but memory grows with the limit.
export class SlidingLog {
  constructor(limit, windowMs) { this.limit = limit; this.windowMs = windowMs; }
  init() { return { times: [] }; }
  take(s, now) {
    while (s.times.length && s.times[0] <= now - this.windowMs) s.times.shift();
    if (s.times.length >= this.limit) return false;
    s.times.push(now);
    return true;
  }
  describe(s) { return `${s.times.length} timestamps kept`; }
}

export class RateLimiter {
  constructor(algorithm, store = new Map()) { this.algorithm = algorithm; this.store = store; }
  allow(clientId, now) {
    const state = this.store.get(clientId) ?? this.algorithm.init(now);
    const ok = this.algorithm.take(state, now);
    this.store.set(clientId, state);
    return ok;
  }
  describe(clientId) {
    const s = this.store.get(clientId);
    return s ? this.algorithm.describe(s) : "no state yet";
  }
}

// Reference implementation. The page runs this file to produce its scenario and its
// measured chart, and shows this same file in the code tab, so what you read is what ran.

// 32-bit FNV-1a, then a murmur3 finaliser so nearby strings land far apart.
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

// The naive way: server = hash(key) mod N. Change N and almost every key moves.
export class ModuloSharding {
  constructor(servers) { this.servers = [...servers]; }
  add(server) { this.servers.push(server); }
  remove(server) { this.servers = this.servers.filter((s) => s !== server); }
  lookup(key) { return this.servers[hash(key) % this.servers.length]; }
}

// Consistent hashing: servers and keys hash onto the same circle of 2^32 points.
// A key belongs to the first server point clockwise from it. Each server is placed
// `vnodes` times, so its share of the circle is the sum of many small arcs.
export class HashRing {
  constructor(servers = [], vnodes = 100) {
    this.vnodes = vnodes;
    this.points = []; // sorted by pos: { pos, server }
    for (const s of servers) this.add(s);
  }
  add(server) {
    for (let i = 0; i < this.vnodes; i++) this.points.push({ pos: hash(`${server}#${i}`), server });
    this.points.sort((a, b) => a.pos - b.pos);
  }
  remove(server) {
    this.points = this.points.filter((p) => p.server !== server);
  }
  lookup(key) {
    if (!this.points.length) throw new Error("ring is empty");
    const h = hash(key);
    let lo = 0, hi = this.points.length; // first point with pos >= h
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.points[mid].pos < h) lo = mid + 1; else hi = mid; }
    return this.points[lo === this.points.length ? 0 : lo].server; // past the end wraps to the start
  }
}

// Helpers the page uses to measure the two properties that matter.
export function placement(router, keys) {
  const out = {};
  for (const k of keys) out[k] = router.lookup(k);
  return out;
}

export function moved(before, after) {
  return Object.keys(before).filter((k) => before[k] !== after[k]).length;
}

// Busiest server's key count divided by the average. 1.0 is perfectly even.
export function imbalance(router, keys, servers) {
  const count = Object.fromEntries(servers.map((s) => [s, 0]));
  for (const k of keys) count[router.lookup(k)]++;
  return Math.max(...Object.values(count)) / (keys.length / servers.length);
}

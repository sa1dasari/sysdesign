// Concept example: consistent hashing.
// The scenario and both measured chart series come from running ring.mjs at build time,
// and the code tab shows ring.mjs itself.
import { readFileSync } from "node:fs";
import { HashRing, ModuloSharding, placement, moved, imbalance } from "./ring.mjs";

const source = readFileSync(new URL("ring.mjs", import.meta.url), "utf8");
const VNODES = 100;
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));

// ----- measured: share of keys that move when one server joins -----
const keys = range(20000, (i) => `user:${i}`);
const sizes = [2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50, 64, 80, 100];
const movedMod = [], movedRing = [];
for (const n of sizes) {
  const servers = range(n, (i) => `cache-${i}`);
  const mod = new ModuloSharding(servers), ring = new HashRing(servers, VNODES);
  const a = placement(mod, keys), b = placement(ring, keys);
  mod.add("cache-new"); ring.add("cache-new");
  movedMod.push(moved(a, placement(mod, keys)) / keys.length);
  movedRing.push(moved(b, placement(ring, keys)) / keys.length);
}

// ----- measured: busiest server vs average, by virtual nodes (10 servers, 8 trials) -----
const vn = [1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000];
const loadKeys = range(50000, (i) => `user:${i}`);
const spread = vn.map((v) => {
  let sum = 0;
  for (let t = 0; t < 8; t++) {
    const servers = range(10, (i) => `node${t}-${i}`);
    sum += imbalance(new HashRing(servers, v), loadKeys, servers);
  }
  return +(sum / 8).toFixed(3);
});

// ----- scenario: the same changes applied to a ring and to mod N, side by side -----
const few = range(12, (i) => `user:${i}`);
const ring = new HashRing(["A", "B", "C"], VNODES), mod = new ModuloSharding(["A", "B", "C"]);
const steps = [];
let prevRing = placement(ring, few), prevMod = placement(mod, few);
function snap(movedRingN, movedModN) {
  const state = placement(ring, few);
  state["moved this step, ring"] = movedRingN == null ? "-" : `${movedRingN} of ${few.length}`;
  state["moved this step, mod N"] = movedModN == null ? "-" : `${movedModN} of ${few.length}`;
  return state;
}
function change(title, call, fn, note) {
  let result;
  try { result = fn(); } catch (e) { result = `${e.constructor.name}: ${e.message}`; }
  const r = placement(ring, few), m = placement(mod, few);
  steps.push({ title, call, result: String(result), note, state: snap(moved(prevRing, r), moved(prevMod, m)) });
  prevRing = r; prevMod = m;
}
steps.push({ title: "Three servers", call: `new HashRing(["A","B","C"], ${VNODES})`, result: `3 servers, ${3 * VNODES} points`, note: `Each server is hashed onto the circle ${VNODES} times. The table shows which server owns each of twelve keys.`, state: snap() });
steps.push({ title: "Look up a key", call: 'ring.lookup("user:7")', result: ring.lookup("user:7"), note: "Hash the key, binary-search for the first server point at or after it, wrap past the end. About log2(300) = 9 comparisons.", state: snap() });
change("Add server D", 'ring.add("D")  // and mod.add("D")', () => { ring.add("D"); mod.add("D"); return "added"; }, "Every key the ring moved went to D. No key moved between A, B and C. Mod N, given the same change, reshuffled most keys between the old servers too.");
change("Server B dies", 'ring.remove("B")  // and mod.remove("B")', () => { ring.remove("B"); mod.remove("B"); return "removed"; }, "The ring moves only B's keys, spread over the survivors because B's 100 points were scattered. Mod N moves keys that never touched B.");
const hot = ring.lookup("user:7");
steps.push({ title: "One key gets hot", call: 'for 10,000 requests: ring.lookup("user:7")', result: `all 10,000 go to ${hot}`, note: "The weak point. Consistent hashing spreads keys, not traffic. A hot key stays on one server no matter how many servers you add. Fix it above the ring: replicate that key, or split it into user:7#1..k.", state: snap() });
{
  let result;
  try { result = new HashRing([]).lookup("user:1"); } catch (e) { result = `${e.constructor.name}: ${e.message}`; }
  steps.push({ title: "Empty ring", call: 'new HashRing([]).lookup("user:1")', result, note: "With no servers there is no owner. The caller must treat this as an outage, not as a cache miss.", state: snap() });
}

export default {
  kind: "concept",
  title: "Consistent hashing",
  subtitle: "How a cluster decides which server owns a key, and why adding a server should not move every key you have.",
  idea: "With hash mod N, changing N moves almost every key. Put servers and keys on the same circle and a change moves only the keys next to the server that changed: about 1/N of them.",
  sections: [
    {
      type: "text",
      title: "The problem",
      body: [
        "You have a cluster of cache servers and want each key (say, a user id) stored on exactly one of them, chosen without asking anyone. A **hash** turns any key into a big, random-looking number, always the same for the same key. The obvious rule is `server = hash(key) mod N`, the remainder after dividing by the number of servers N. It spreads keys evenly and costs nothing.",
        "Then you add a server. N changes, so `hash(key) mod N` changes for almost every key. Each one now looks on the wrong server, misses, and falls through to the database. Adding capacity has just caused an outage.",
        "Consistent hashing fixes this. Hash servers and keys onto the same circle. A key belongs to the first server clockwise from it. A new server takes over only the arcs just before its points, so only those keys move.",
      ],
    },
    {
      type: "estimation",
      title: "What a change costs",
      lede: "Drag the assumptions. The charts below follow the same sliders.",
      inputs: [
        { id: "servers", label: "Servers in the cluster", value: 10, min: 2, max: 100, step: 1 },
        { id: "keys", label: "Keys stored", value: 1e8, min: 1e4, max: 1e10, log: true, fmt: "si" },
        { id: "vnodes", label: "Virtual nodes per server", value: VNODES, min: 1, max: 1000, log: true, fmt: "int" },
        { id: "rereadHours", label: "Moved keys are read again within", value: 1, min: 0.25, max: 24, step: 0.25, unit: "hours" },
      ],
      rows: [
        { id: "modMoves", label: "Keys moved by adding one server, mod N", expr: "=p.keys*p.servers/(p.servers+1)", fmt: "si", why: "A key stays put only if its hash gives the same answer mod N and mod N+1: about 1 in N+1." },
        { id: "ringMoves", label: "Keys moved by adding one server, ring", expr: "=p.keys/(p.servers+1)", fmt: "si", why: "Only the new server's share. That is the minimum any scheme can move, since the new server must own something." },
        { id: "factor", label: "How many times more mod N moves", expr: "=r.modMoves/r.ringMoves", fmt: "int", unit: "x", why: "Exactly N. The bigger the cluster, the worse mod N gets." },
        { id: "missMod", label: "Extra database reads after the change, mod N", expr: "=r.modMoves/(p.rereadHours*3600)", fmt: "si", unit: "reads/s", why: "Every moved key misses once and is read from the database. This lands on top of normal traffic." },
        { id: "missRing", label: "Extra database reads after the change, ring", expr: "=r.ringMoves/(p.rereadHours*3600)", fmt: "si", unit: "reads/s" },
        { id: "points", label: "Points on the ring", expr: "=p.servers*p.vnodes", fmt: "int", why: "Servers times virtual nodes. Every client keeps this sorted list." },
        { id: "ringBytes", label: "Ring size in each client's memory", expr: "=r.points*16", fmt: "bytes", why: "About 16 bytes per point: a 4-byte position and a reference to the server." },
        { id: "steps", label: "Comparisons per lookup", expr: "=ceil(log2(r.points))", fmt: "int", why: "Binary search over the sorted points. Cheap at any realistic size." },
      ],
    },
    {
      type: "chart",
      title: "Keys that move when one server joins",
      lede: "Measured by running ring.mjs on 20,000 keys at each cluster size. Hover for exact values. Drag the server count above to move the marker.",
      x: { label: "Servers before the change", values: sizes, log: true, param: "servers", fmt: "int" },
      y: { label: "Share of keys that move", fmt: "pct", min: 0, max: 1 },
      series: [
        { label: "mod N, measured", y: movedMod },
        { label: "Ring, measured", y: movedRing },
        { label: "Ideal, 1/(N+1)", expr: "=1/(x+1)" },
      ],
      note: "Mod N heads towards 100% as the cluster grows. The ring tracks the ideal line. It wobbles around it because 100 virtual nodes give the new server a share that is close to 1/(N+1), not exactly that.",
    },
    {
      type: "chart",
      title: "How even is the load",
      lede: `Measured with 10 servers and 50,000 keys, averaged over 8 different sets of server names.`,
      x: { label: "Virtual nodes per server", values: vn, log: true, param: "vnodes", fmt: "int" },
      y: { label: "Busiest server's keys ÷ average", min: 1 },
      series: [{ label: "Busiest ÷ average, measured", y: spread }],
      note: "With one point per server, arcs are random lengths and the busiest server holds more than twice its share. Each server's load is a sum of many small arcs, so it evens out roughly as 1/√(virtual nodes). Past a few hundred, more points cost memory and buy little.",
    },
    {
      type: "sequence",
      title: "Finding a key's server",
      hint: "Press play. Nothing here talks to a coordinator: every client computes the same answer from the same ring.",
      actors: ["Client", "Ring", "Server"],
      messages: [
        { from: "Client", to: "Ring", text: "lookup(key)", note: "The ring is a sorted array held by each client (or each proxy), not a service." },
        { from: "Ring", to: "Ring", text: "h = hash(key)", note: "The same hash function as the server points. If two clients use different hashes they disagree on every key." },
        { from: "Ring", to: "Ring", text: "binary search: first point >= h", note: "About log2(points) comparisons, then wrap to the start if h is past the last point." },
        { from: "Ring", to: "Client", text: "server", ret: true, note: "The owner of that point." },
        { from: "Client", to: "Server", text: "GET key", note: "A direct request. The only shared state is the list of servers." },
        { from: "Server", to: "Client", text: "value or miss", ret: true, note: "A miss after a membership change is expected for the moved keys, about 1/N of them." },
      ],
    },
    {
      type: "scenario",
      title: "Run it",
      lede: "These steps were produced by running ring.mjs. Each change is applied to a ring and to mod N, so you can count what each one moves. Changed rows are highlighted.",
      steps,
    },
    {
      type: "code",
      title: "The code",
      lede: "The exact file that produced the scenario and both measured charts.",
      files: [{ name: "ring.mjs", src: source }],
    },
    {
      type: "tradeoffs",
      title: "Decisions",
      items: [
        {
          question: "How many virtual nodes per server?",
          options: [
            { name: "1", pros: ["Tiny ring"], cons: ["Busiest server carries more than twice its share (see the chart)", "A dead server dumps all its keys on one neighbour"] },
            { name: "100 to 200", pick: true, pros: ["Busiest server about 10 to 15% above average", "A dead server's keys spread over all survivors"], cons: ["A few thousand points per client. Negligible."] },
            { name: "1000+", pros: ["Slightly more even"], cons: ["Memory and rebuild time grow 10x for a few percent"] },
          ],
          why: "The load chart flattens after about 100. Weighted servers are easy too: give a bigger machine more points.",
        },
        {
          question: "Ring, rendezvous hashing, or jump hash?",
          options: [
            { name: "Ring with virtual nodes", pick: true, pros: ["Any server can join or leave, by name", "Weights by point count", "O(log points) lookup"], cons: ["Needs virtual nodes to be even", "Memory per client"] },
            { name: "Rendezvous (highest random weight)", pros: ["Even without virtual nodes", "Very simple"], cons: ["O(N) hashes per lookup, slow past a few hundred servers"] },
            { name: "Jump hash", pros: ["No memory, perfectly even, fast"], cons: ["Servers must be numbered 0..N-1", "Can only add or remove the last one, so a random failure is not handled"] },
          ],
          why: "Cache clusters lose arbitrary servers, which rules out jump hash. The ring scales to large clusters where rendezvous gets slow.",
        },
      ],
    },
    {
      type: "failures",
      title: "Where it still goes wrong",
      items: [
        { what: "A hot key", effect: "One key's traffic lands on one server however many you add. Consistent hashing balances keys, not requests.", mitigation: "Replicate the hot key to the next k servers on the ring and read from any, or split it into sub-keys." },
        { what: "Clients disagree on membership", effect: "Silent. A client with an old server list reads from the wrong server, misses, and writes there. Two copies drift apart and nothing errors.", mitigation: "One source of truth for membership (a config service or gossip with versions), and clients refuse to route with a stale version." },
        { what: "Different hash functions", effect: "A Python client and a Go client that hash differently agree on nothing. Every key lives in two places.", mitigation: "Pin the hash function and the point naming (`server#i`) in a shared spec, with test vectors." },
        { what: "A server flaps", effect: "Each leave and rejoin moves 1/N of keys twice. A flapping server keeps a slice of the cache permanently cold.", mitigation: "Remove a server only after it has been down for a while, and add it back slowly." },
      ],
    },
    {
      type: "qa",
      title: "What an interviewer asks next",
      items: [
        { q: "Why is mod N so bad if the hash is uniform?", a: ["Uniform spread is not the issue. Stability is. A key keeps its server only if hash mod N equals hash mod N+1, which happens for about 1 in N+1 keys. The other N/(N+1) all miss at once."] },
        { q: "How do you replicate data on a ring?", a: ["Walk clockwise from the key and take the first R distinct servers. That is what Dynamo and Cassandra do. Skip points that belong to a server you already picked, or two replicas can land on the same machine."] },
        { q: "How do you add a big server next to small ones?", a: ["Give it more virtual nodes. Its share of the circle is proportional to its point count, so twice the points is about twice the keys."] },
        { q: "What happens to keys while a new server warms up?", a: ["They miss on the new server and are fetched from the database. To soften it, read from the old owner on a miss during a warm-up window, or copy the moving arcs before switching ownership."] },
      ],
    },
  ],
};

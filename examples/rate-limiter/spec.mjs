// Combined example: a rate limiter is a service under load (system view) and an algorithm
// with swappable state (object view), so the page covers both. The scenario and the burst
// chart come from running limiter.mjs, and the code tab shows limiter.mjs itself.
import { readFileSync } from "node:fs";
import { RateLimiter, TokenBucket, FixedWindow, SlidingLog } from "./limiter.mjs";

const source = readFileSync(new URL("limiter.mjs", import.meta.url), "utf8");

// ----- measured: a bot fires 1 request per ms from 950 to 1050 ms, limit 10 per second -----
const LIMIT = 10;
const ticks = Array.from({ length: 41 }, (_, i) => 900 + i * 5);
function cumulative(algorithm) {
  const rl = new RateLimiter(algorithm), allowedAt = [];
  for (let t = 950; t <= 1050; t++) if (rl.allow("bot", t)) allowedAt.push(t);
  return ticks.map((x) => allowedAt.filter((t) => t <= x).length);
}
const fixedBurst = cumulative(new FixedWindow(LIMIT, 1000));
const bucketBurst = cumulative(new TokenBucket(LIMIT, LIMIT));
const logBurst = cumulative(new SlidingLog(LIMIT, 1000));

// ----- scenario: the same requests sent to a fixed window and a token bucket -----
const fixed = new RateLimiter(new FixedWindow(3, 1000));
const bucket = new RateLimiter(new TokenBucket(3, 3));
const gwA = new RateLimiter(new FixedWindow(3, 1000)), gwB = new RateLimiter(new FixedWindow(3, 1000));
const steps = [];
let viaTwo = "-";
function snap() {
  return {
    "fixed window, c1": fixed.describe("c1"),
    "token bucket, c1": bucket.describe("c1"),
    "fixed window, bot": fixed.describe("bot"),
    "token bucket, bot": bucket.describe("bot"),
    "two gateways, own counters, bot": viaTwo,
  };
}
function send(title, call, list, note) {
  let f = 0, b = 0;
  for (const [client, t] of list) { if (fixed.allow(client, t)) f++; if (bucket.allow(client, t)) b++; }
  steps.push({ title, call, result: `fixed window allowed ${f} of ${list.length}, token bucket allowed ${b} of ${list.length}`, note, state: snap() });
}
steps.push({ title: "Two limiters", call: "new FixedWindow(3, 1000)  and  new TokenBucket(3, 3)", note: "Both allow 3 requests per second per client. Every request below goes to both, so you can compare.", state: snap() });
send("Three requests at t=0", 'allow("c1", 0) x3', [["c1", 0], ["c1", 0], ["c1", 0]], "Both start full, so a fresh client gets its whole allowance at once.");
send("A fourth at t=100", 'allow("c1", 100)', [["c1", 100]], "Both reject. The bucket has refilled only 0.3 of a token.");
send("Three more at t=1000", 'allow("c1", 1000) x3', [["c1", 1000], ["c1", 1000], ["c1", 1000]], "A new window starts, and the bucket has refilled 3 tokens. Same answer, different reasons.");
send("A bot at the window edge", 'allow("bot", 1990..1992), allow("bot", 2000..2002)', [["bot", 1990], ["bot", 1991], ["bot", 1992], ["bot", 2000], ["bot", 2001], ["bot", 2002]],
  "The fixed window forgets everything at t=2000, so the bot gets 6 requests in 12 ms, twice the limit. The bucket has no edge to exploit.");
{
  let ok = 0;
  for (let i = 0; i < 6; i++) if ((i % 2 ? gwB : gwA).allow("bot", 3000 + i)) ok++;
  viaTwo = `${ok} of 6 allowed in 6 ms, limit 3`;
  steps.push({ title: "Two gateways, separate counters", call: 'gatewayA.allow("bot", t) / gatewayB.allow("bot", t), alternating', result: `${ok} of 6 allowed`, note: "Each gateway keeps its own Map, so each enforces the full limit. With N gateways a client gets N times its limit, and nothing reports an error. This is why the counters live in one shared store.", state: snap() });
}

export default {
  kind: ["hld", "lld"],
  title: "Rate limiter",
  subtitle: "Capping how fast each client can call an API, across a fleet of gateways, without slowing down everyone else.",
  idea: "A limit is only as good as the counter behind it. Count in one shared place, with an algorithm that has no window edge to exploit, or a client quietly gets several times its limit.",
  sections: [
    {
      type: "text",
      title: "The big picture",
      body: [
        "An API serves many clients. A few of them, such as scrapers or a broken retry loop, can send more traffic than everyone else together. A **rate limiter** caps how many requests each client may make per second, so one client cannot slow the API down for all the others.",
        "It sits in the **gateway**, the front door every request passes through. For each request it checks a counter for that client and either lets the request through or answers **429 Too Many Requests**.",
        "Two things make it hard. The counter must be shared by every gateway server, or each one enforces the full limit on its own. And the counting rule must have no gap a client can exploit. Walk through a normal request and a flood below, then try breaking it.",
      ],
    },
    {
      type: "requirements",
      title: "What we are building",
      functional: [
        "Each client (API key or user) may make at most L requests per second, with short bursts allowed.",
        "Requests over the limit get HTTP 429 with a Retry-After header.",
        "The limit holds across every gateway, not per gateway.",
        "Limits can differ per client tier and change without a deploy.",
      ],
      nonfunctional: [
        "Adds under 2 ms to each request.",
        "A limiter outage must not take the API down with it.",
        "Real users at normal rates are never throttled.",
      ],
      outOfScope: ["Billing and quotas per month", "DDoS at the network layer (handled before the gateway)", "Per-endpoint cost weighting"],
    },
    {
      type: "arch",
      title: "The architecture",
      lede: "Start with **How it works**: pick a walkthrough and press Next. Then pick something to **Try** and watch what real clients would notice. Click any box for what it does.",
      latencyBudget: 100,
      intro: "Normal traffic: abusive clients are cut to their limit at the gateway. Dots are requests.",
      groups: [
        { id: "edge", label: "At the gateway", note: "every request" },
        { id: "backend", label: "Behind the gateway", note: "allowed requests only" },
      ],
      nodes: [
        { id: "users", label: "Real clients", col: 0, row: 0, kind: "clients", rps: "=r.legitRps", role: "People and apps using the API normally.", why: "The traffic the API exists for. The failure rate shown is theirs." },
        { id: "bots", label: "Abusive clients", col: 0, row: 1, kind: "clients", rps: "=r.botRps", internal: true, role: "Scrapers, broken retry loops, credential stuffing.", why: "Load that must be cut before it reaches the API. Excluded from the failure rate: their 429s are the point." },
        { id: "gw", label: "API gateway", group: "edge", col: 1, row: 0, instances: "=p.gwInst", cap: 25000, ms: 1, role: "Terminates requests and asks the limiter before passing them on.", why: "The one place every request passes, so the only place a limit can be enforced cheaply.", scale: "Stateless, add instances. Their count matters only if counters are local.", fails: "Saturates if abusive traffic grows past what it can reject." },
        { id: "redis", label: "Counter store", group: "edge", col: 1, row: 1, kind: "store", instances: "=p.shards*p.redisUp", cap: 50000, ms: 0.5, role: "One counter per client, shared by every gateway (Redis).", why: "A limit across N gateways needs one count. The check-and-update runs as one Lua script, so two gateways cannot both spend the last token.", scale: "Shard by client id.", fails: "If it is down, the gateway must choose: fail open (no limits) or fail closed (reject everyone)." },
        { id: "api", label: "API servers", group: "backend", col: 2, row: 0, instances: "=p.apiInst", cap: 2000, ms: 15, role: "Does the actual work.", why: "Sized for real traffic plus headroom, not for abuse.", scale: "Add instances.", fails: "Overloaded the moment abusive traffic gets through." },
        { id: "db", label: "Database", group: "backend", col: 3, row: 0, kind: "store", instances: 30, cap: 5000, ms: 5, role: "Source of truth behind the API.", why: "The most expensive thing to protect. Most limits exist to keep load off it.", scale: "Read replicas and shards, slowly.", fails: "Falls over after the API does." },
      ],
      edges: [
        { from: "users", to: "gw" },
        { from: "bots", to: "gw" },
        { from: "gw", to: "redis", call: true, share: "=p.on*p.central*(p.redisUp+(1-p.redisUp)*(1-p.failOpen))", label: "check" },
        { from: "gw", to: "api", share: "=r.passFrac", label: "allowed" },
        { from: "api", to: "db", call: true },
      ],
      flows: [
        {
          label: "A normal request",
          steps: [
            { path: ["users", "gw"], text: "Your app calls the API. The **gateway** identifies the client by its API key." },
            { path: ["gw", "redis"], text: "It asks the **counter store** (Redis): does this client have a request left right now? Checking and counting happen in one atomic step, so two gateways cannot both spend the last one." },
            { path: ["gw", "api"], text: "The answer is yes, so the request goes on to the **API servers**..." },
            { path: ["api", "db"], text: "...which do the work and read the **database**." },
            { path: ["api", "gw", "users"], text: "The answer goes back. The limiter added about 1.5 ms, inside the 2 ms budget." },
          ],
        },
        {
          label: "A scraper floods the API",
          steps: [
            { path: ["bots", "gw"], text: "A scraper sends 100 requests a second: 20 times the limit of 5." },
            { path: ["gw", "redis"], text: "The counter store allows its first 5 each second and refuses the rest." },
            { path: ["gw", "bots"], text: "The gateway answers the refused ones with **429 Too Many Requests** and a time to retry. They never reach the API, so real clients are not slowed down." },
          ],
        },
        {
          label: "The counter store goes down",
          steps: [
            { path: ["gw", "redis"], text: "The gateway cannot check anyone's limit. It has to choose what to do." },
            { path: ["gw", "api"], text: "**Fail open**: let requests through unchecked. The API stays up, but abuse gets through too. Try \"Counter store down, fail open\"." },
            { path: ["gw", "users"], text: "**Fail closed**: refuse every request. Abuse stops, and so does everyone else. Try \"Counter store down, fail closed\"." },
          ],
        },
      ],
      presets: [
        { label: "Normal traffic", set: {}, note: "Central counters, limiter on. Abusive clients are cut to 5 req/s each, the API runs at about two thirds." },
        { label: "Limiter off", set: { on: 0 }, note: "Abusive traffic reaches the API. Watch the API servers pass 100% and real clients start failing." },
        { label: "Count on each gateway", set: { central: 0 }, note: "No counter store and no errors on the limiter, but each client now gets 12 times its limit. The API fills up and the database tips over, and nothing points at the limiter." },
        { label: "Counter store down, fail closed", set: { redisUp: 0, failOpen: 0 }, note: "Every check fails, so every request is rejected, real clients included. The limiter has become the outage." },
        { label: "Counter store down, fail open", set: { redisUp: 0, failOpen: 1 }, note: "Requests skip the check and nothing is limited. The API survives only if it has headroom for the abuse. Here it does not: the API servers run at 125% and a quarter of real requests fail." },
        { label: "Limit too low", set: { limit: 0.3 }, note: "Abuse is crushed, but watch the throttled metric: real clients averaging 0.5 req/s now get 429s." },
      ],
      controls: [
        { id: "on", label: "Rate limiting", value: 1, min: 0, max: 1, step: 1, fmt: "onoff" },
        { id: "central", label: "Shared counter store", value: 1, min: 0, max: 1, step: 1, fmt: "onoff" },
        { id: "redisUp", label: "Counter store up", value: 1, min: 0, max: 1, step: 1, fmt: "onoff" },
        { id: "failOpen", label: "Fail open if store is down", value: 1, min: 0, max: 1, step: 1, fmt: "onoff" },
        { id: "gwInst", label: "Gateway instances", value: 12, min: 2, max: 40, step: 1 },
        { id: "shards", label: "Counter store shards", value: 6, min: 1, max: 20, step: 1 },
        { id: "apiInst", label: "API instances", value: 80, min: 10, max: 200, step: 1 },
      ],
      metrics: [
        { label: "Real clients throttled", expr: "=1-r.legitAllowed/r.legitRps", fmt: "pct" },
        { label: "Abuse let through", expr: "=r.botAllowed/r.botRps", fmt: "pct" },
        { label: "Counter store", expr: "=p.redisUp ? 'up' : (p.failOpen ? 'down, open' : 'down, closed')", bad: "=!p.redisUp" },
      ],
    },
    {
      type: "estimation",
      title: "Estimating the load",
      lede: "Drag the assumptions. The architecture above uses the same numbers.",
      inputs: [
        { id: "users", label: "Real clients active at peak", value: 2e5, min: 1e4, max: 1e7, log: true, fmt: "si" },
        { id: "userRate", label: "Requests per second from a real client", value: 0.5, min: 0.1, max: 5, step: 0.1 },
        { id: "bots", label: "Abusive clients", value: 1000, min: 10, max: 1e5, log: true, fmt: "si" },
        { id: "botRate", label: "Requests per second from an abusive client", value: 100, min: 10, max: 1000, log: true, fmt: "si" },
        { id: "limit", label: "Limit per client", value: 5, min: 0.2, max: 50, step: 0.1, unit: "req/s" },
      ],
      rows: [
        { id: "legitRps", label: "Real traffic", expr: "=p.users*p.userRate", fmt: "si", unit: "req/s" },
        { id: "botRps", label: "Abusive traffic", expr: "=p.bots*p.botRate", fmt: "si", unit: "req/s", why: "A few clients can send as much as everyone else together." },
        { id: "enforce", label: "Limiter is enforcing", expr: "=p.on*(p.central ? p.redisUp : 1)", fmt: "onoff", why: "Off when switched off, or when the shared counter store is down." },
        { id: "closed", label: "Rejecting everyone", expr: "=p.on*p.central*(1-p.redisUp)*(1-p.failOpen)", fmt: "onoff", why: "The store is down and the gateway fails closed: no check can pass." },
        { id: "effLimit", label: "Limit a client actually gets", expr: "=p.limit*(p.central ? 1 : p.gwInst)", fmt: "si", unit: "req/s", why: "With a counter on each gateway, a client spread across N gateways gets N times the limit." },
        { id: "legitAllowed", label: "Real traffic let through", expr: "=(1-r.closed)*p.users*(r.enforce ? min(p.userRate, r.effLimit) : p.userRate)", fmt: "si", unit: "req/s" },
        { id: "botAllowed", label: "Abusive traffic let through", expr: "=(1-r.closed)*p.bots*(r.enforce ? min(p.botRate, r.effLimit) : p.botRate)", fmt: "si", unit: "req/s", why: "The number the limiter exists to shrink." },
        { id: "passFrac", label: "Share of requests passed to the API", expr: "=(r.legitAllowed+r.botAllowed)/(r.legitRps+r.botRps)", fmt: "pct", why: "The rest get 429 at the gateway." },
        { id: "counterOps", label: "Counter store operations", expr: "=(r.legitRps+r.botRps)*p.on*p.central", fmt: "si", unit: "ops/s", why: "Every request, allowed or not, is one atomic read-and-update." },
        { id: "bucketBytes", label: "Counter memory, token bucket", expr: "=(p.users+p.bots)*64", fmt: "bytes", why: "Two numbers and a key per client, about 64 bytes." },
        { id: "logBytes", label: "Counter memory, sliding log", expr: "=(p.users+p.bots)*(48+16*p.limit)", fmt: "bytes", why: "A timestamp per allowed request in the window. Grows with the limit." },
      ],
    },
    {
      type: "chart",
      title: "A burst at the window edge",
      lede: `Measured by running limiter.mjs. A bot sends 1 request per millisecond from 950 to 1050 ms. The limit is ${LIMIT} per second.`,
      x: { label: "Time (ms)", values: ticks, fmt: "int" },
      y: { label: "Requests allowed so far", min: 0, fmt: "int" },
      series: [
        { label: "Fixed window", y: fixedBurst },
        { label: "Token bucket", y: bucketBurst },
        { label: "Sliding log", y: logBurst },
      ],
      note: `The fixed window allows ${LIMIT} before 1000 ms and ${LIMIT} more right after, ${fixedBurst.at(-1)} in about 60 ms. Token bucket and sliding log allow ${bucketBurst.at(-1)} and ${logBurst.at(-1)}: their lines are on top of each other. The bucket has no edge because it refills continuously.`,
    },
    {
      type: "classes",
      title: "The limiter as code",
      lede: "Click a class for its role.",
      hint: "Click a class. The algorithm holds no state, which is what lets the state live in Redis.",
      classes: [
        { name: "RateLimiter", at: [1, 0], fields: ["algorithm: Algorithm", "store: Map | Redis"], methods: ["allow(clientId, now): boolean"], role: "Loads a client's state, asks the algorithm, saves the state. It knows nothing about how limits are counted." },
        { name: "Store", at: [0, 0], stereotype: "interface", fields: [], methods: ["get(clientId)", "set(clientId, state)"], role: "Where state lives. A Map in one process, Redis across a fleet. In Redis, get-take-set must be one Lua script or two gateways race." },
        { name: "Algorithm", at: [2, 0], stereotype: "interface", fields: [], methods: ["init(now): State", "take(state, now): boolean"], role: "Pure decision: given the state and the time, allow or not, and update the state." },
        { name: "TokenBucket", at: [1, 1], fields: ["rate", "capacity"], methods: ["take(state, now)"], role: "The default. Two numbers per client, bursts up to capacity, no window edge." },
        { name: "FixedWindow", at: [2, 1], fields: ["limit", "windowMs"], methods: ["take(state, now)"], role: "Simplest and cheapest, but allows twice the limit across a window edge." },
        { name: "SlidingLog", at: [3, 1], fields: ["limit", "windowMs"], methods: ["take(state, now)"], role: "Exact, but stores a timestamp per request, so memory grows with the limit." },
      ],
      relations: [
        { from: "RateLimiter", to: "Store", type: "uses" },
        { from: "RateLimiter", to: "Algorithm", type: "uses" },
        { from: "TokenBucket", to: "Algorithm", type: "implements" },
        { from: "FixedWindow", to: "Algorithm", type: "implements" },
        { from: "SlidingLog", to: "Algorithm", type: "implements" },
      ],
    },
    {
      type: "sequence",
      title: "One request",
      hint: "Press play. Each step shows what that message is for.",
      actors: ["Client", "Gateway", "Redis", "API"],
      messages: [
        { from: "Client", to: "Gateway", text: "GET /orders  (API key)", note: "The client id comes from the key, never from something the client can change, like an IP behind a proxy." },
        { from: "Gateway", to: "Redis", text: "EVALSHA take(key, now)", note: "One round trip. The script reads the bucket, refills it, spends a token and writes it back atomically." },
        { from: "Redis", to: "Gateway", text: "allowed, tokens left", ret: true, note: "Under a millisecond inside one data centre." },
        { from: "Gateway", to: "API", text: "forward request", note: "Only allowed requests reach the API." },
        { from: "API", to: "Gateway", text: "200", ret: true },
        { from: "Gateway", to: "Client", text: "200  (or 429 + Retry-After)", ret: true, note: "A rejected client is told when to retry, so well-behaved clients back off instead of hammering." },
      ],
    },
    {
      type: "scenario",
      title: "Run it",
      lede: "These steps were produced by running limiter.mjs. Each request goes to a fixed window and a token bucket. Changed values are highlighted.",
      steps,
    },
    {
      type: "code",
      title: "The code",
      lede: "The exact file that produced the scenario and the burst chart.",
      files: [{ name: "limiter.mjs", src: source }],
    },
    {
      type: "tradeoffs",
      title: "Decisions",
      items: [
        {
          question: "Which algorithm?",
          options: [
            { name: "Token bucket", pick: true, pros: ["Two numbers per client", "Bursts up to a set size, then a steady rate", "No window edge"], cons: ["Two parameters to explain to customers"] },
            { name: "Fixed window", pros: ["One counter, trivially cheap"], cons: ["Twice the limit across a window edge (see the chart)"] },
            { name: "Sliding log", pros: ["Exact"], cons: ["A timestamp per request: memory grows with the limit (see the estimate)"] },
          ],
          why: "The bucket has no window edge and costs as little as the window. It is not exact: in one second it can pass its capacity plus its rate, so capacity sets the largest burst.",
        },
        {
          question: "Where do the counters live?",
          options: [
            { name: "One shared store (Redis)", pick: true, pros: ["The limit holds across all gateways"], cons: ["One network round trip per request", "A dependency that can fail"] },
            { name: "On each gateway", pros: ["No extra hop, no dependency"], cons: ["A client gets N times its limit (try the preset)", "Silent: nothing reports an error"] },
          ],
          why: "A sub-millisecond hop is cheap. A limit that is silently 12 times too high is not.",
        },
        {
          question: "If the counter store is down?",
          options: [
            { name: "Fail open, with a local fallback", pick: true, pros: ["The API stays up", "A rough per-gateway limit still blocks the worst abuse"], cons: ["Limits are loose until the store is back"] },
            { name: "Fail closed", pros: ["Never over the limit"], cons: ["The limiter becomes the outage (try the preset)"] },
          ],
          why: "For most APIs, availability wins. Fail closed only where abuse costs more than downtime, such as login or payments.",
        },
      ],
    },
    {
      type: "failures",
      title: "What breaks",
      items: [
        { what: "Counters on each gateway", effect: "Silent. Each client gets limit times the number of gateways. Load climbs and nothing points at the limiter.", mitigation: "One shared store, or local counters that sync and divide the limit by the gateway count.", inject: { central: 0 } },
        { what: "Counter store down, fail closed", effect: "Every request is rejected. A protection layer has caused a full outage.", mitigation: "Fail open with a local fallback limit, and alert on the store.", inject: { redisUp: 0, failOpen: 0 } },
        { what: "Limit set below real usage", effect: "Abuse stops, and so do real users. 429s look like success to the servers.", mitigation: "Set limits from the real usage distribution (p99 per client, not the mean), and alert on 429s to known-good clients.", inject: { limit: 0.3 } },
        { what: "Check-then-set race", effect: "Two gateways read 1 token left, both allow. Under load a client exceeds its limit.", mitigation: "Do read, refill, spend and write as one atomic Lua script in Redis." },
      ],
    },
    {
      type: "qa",
      title: "What an interviewer asks next",
      items: [
        { q: "Why not limit by IP address?", a: ["Many real users share one IP behind a NAT or proxy, and one attacker can use thousands of IPs. Limit by API key or user id where you have one, and use IP only as a coarse first line."] },
        { q: "Does a Redis round trip per request not hurt latency?", a: ["It adds well under a millisecond inside a data centre. If that matters, keep a small local token allowance per gateway and refill it from Redis in batches, trading a little accuracy for fewer calls."] },
        { q: "How do you give some customers higher limits?", a: ["Store the rate and capacity per client tier and pass them to the algorithm. The algorithm is already parameterised; RateLimiter does not change."] },
        { q: "What about limits across regions?", a: ["A global counter needs a cross-region round trip. Usually each region gets a share of the limit, rebalanced every few seconds, and the global total is approximately right."] },
      ],
    },
  ],
};

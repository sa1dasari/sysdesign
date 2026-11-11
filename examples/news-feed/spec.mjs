// HLD example: a social media news feed.
// Every number on the page comes from the inputs and expressions below. Move a slider
// in "Estimating the load" and the simulator in "The system under load" moves with it.

const FEED_ENTRY_BYTES = 16; // one post id plus a score, packed
const FEED_LEN = 800; // entries kept per user

export default {
  kind: "hld",
  title: "Social media news feed",
  subtitle: "How a feed of posts from people you follow is built, stored and served to a hundred million people a day.",
  idea: "A feed is a list you can build when someone posts or when someone reads. Celebrities break the first way and heavy followers break the second, so real systems use both.",
  sections: [
    {
      type: "text",
      title: "The big picture",
      body: [
        "A news feed shows you recent posts from everyone you follow, newest first. Reading it has to be fast, and people read far more often than they post.",
        "So the work is moved to when someone posts. Each new post is copied into the cached feed of every follower (this is called **fan-out**), and opening your feed becomes a single lookup. That works until someone with millions of followers posts: one post becomes millions of copies.",
        "Real systems mix two approaches. Posts from normal accounts are pushed to followers when they are written. Posts from celebrities are pulled in when you read. Walk through both below, then try pushing everything and watch the fan-out workers drown.",
      ],
    },
    {
      type: "requirements",
      title: "What we are building",
      functional: [
        "A user publishes a post (text plus media links).",
        "A user follows and unfollows other users.",
        "A user opens their feed: recent posts from everyone they follow, newest first.",
        "Scrolling loads older posts without gaps or repeats.",
      ],
      nonfunctional: [
        "Feed read p99 under 200 ms. Reads are far more common than writes.",
        "A new post shows up in followers' feeds within a few seconds, not instantly.",
        "Availability over strict consistency: a briefly stale feed is fine, an error page is not.",
        "Survives the loss of a node, and a celebrity posting, without an outage.",
      ],
      outOfScope: ["Ranking and recommendations (a model on top of this list)", "Ads", "Search", "Media upload and transcoding"],
    },
    {
      type: "arch",
      title: "The architecture",
      lede: "Start with **How it works**: pick a walkthrough and press Next. Then pick something to **Try** and watch what users would notice. Click any box for what it does.",
      latencyBudget: 200,
      intro: "A normal day. Dots are requests and posts moving through the system. Pick a walkthrough above to follow one.",
      groups: [
        { id: "read", label: "Read path", note: "you open your feed" },
        { id: "write", label: "Write path", note: "someone posts" },
      ],
      nodes: [
        { id: "readers", label: "Feed readers", col: 0, row: 0, kind: "clients", rps: "=r.peakRead", role: "Apps opening the feed.", why: "Offered load, taken from the estimate above." },
        { id: "writers", label: "Post writers", col: 0, row: 2, kind: "clients", rps: "=r.peakWrite", role: "Apps publishing posts.", why: "Offered load, taken from the estimate above." },
        { id: "gw", label: "API gateway", col: 1, row: 1, instances: 12, cap: 5000, ms: 2, role: "Auth, rate limits, routing.", why: "One front door. Also where abusive clients get cut off.", scale: "Add instances. Stateless.", fails: "Saturates at peak if sized for the average." },
        { id: "feedSvc", label: "Feed service", group: "read", col: 2, row: 0, instances: "=p.feedInst", cap: 2000, ms: 12, role: "Assembles one page of the feed.", why: "Reads the user's timeline, merges celebrity posts if needed, hydrates post bodies.", scale: "Stateless, add instances.", fails: "CPU bound on hydration when cache hit rate drops." },
        { id: "tlRead", label: "Timeline cache", group: "read", col: 3, row: 0, kind: "cache", instances: 8, cap: 30000, ms: 1, hit: "=zipf(p.cacheGB*1e9/12800,p.dau,0.8)*p.warm", role: "Precomputed feed for each active user.", why: "Reading a feed becomes one cache lookup. Hit rate depends on how many of the most active users fit in memory. A few users make most reads, so a partial cache still catches most of them.", scale: "More memory raises hit rate.", fails: "A restart empties it and every read falls through to the rebuild tier. In production reads and inserts share one cluster; they are split here so each can be sized and broken separately." },
        { id: "rebuild", label: "Feed rebuild", group: "read", col: 4, row: 0, kind: "store", instances: "=p.shards", cap: 2500, ms: 22, role: "Rebuilds a feed from follows plus recent posts.", why: "The slow path for users whose feed is not cached.", scale: "Add shards.", fails: "Overloaded by a cold cache. It was sized for misses, not for everyone." },
        { id: "celeb", label: "Celebrity cache", group: "read", col: 3, row: 1, kind: "cache", instances: 4, cap: 25000, ms: 3, role: "Recent posts of accounts too large to push.", why: "Hybrid mode: celebrity posts are not pushed to millions of feeds. They are merged in at read time from this small, hot cache.", scale: "Small by design: a few thousand accounts.", fails: "Only used when hybrid mode is on." },
        { id: "postSvc", label: "Post service", group: "write", col: 2, row: 2, instances: 4, cap: 2500, ms: 10, role: "Validates and stores posts.", why: "Writes the post, then hands fan-out to a queue so the author is not kept waiting.", scale: "Stateless, add instances.", fails: "Fine at this write rate." },
        { id: "postDb", label: "Post store", group: "write", col: 3, row: 2, kind: "store", instances: 8, cap: 1500, ms: 8, role: "Durable posts.", why: "Source of truth. Everything else can be rebuilt from it.", scale: "Shard by post_id.", fails: "Hot shard if ids are not well spread." },
        { id: "queue", label: "Fan-out queue", group: "write", col: 2, row: 3, kind: "queue", instances: 12, cap: 20000, ms: 2, role: "Buffers posts waiting to be fanned out.", why: "Decouples publishing from fan-out so a slow tier does not slow authors.", scale: "Add partitions.", fails: "Backlog grows if workers fall behind." },
        { id: "workers", label: "Fan-out workers", group: "write", col: 3, row: 3, instances: "=p.workers", cap: 40000, role: "For each post, insert it into each follower's timeline.", why: "Does the push. One post becomes hundreds of inserts, which is where the write amplification lives.", scale: "Add workers.", fails: "Falling behind means feeds go stale, not errors." },
        { id: "tlWrite", label: "Cache inserts", group: "write", col: 4, row: 3, kind: "cache", instances: 16, cap: 40000, ms: 1, role: "Receives the pushed entries.", why: "Same cluster as the read cache in real life.", scale: "More shards.", fails: "Saturates if fan-out is unbounded." },
      ],
      edges: [
        { from: "readers", to: "gw" },
        { from: "writers", to: "gw" },
        { from: "gw", to: "feedSvc", share: "=r.peakRead/(r.peakRead+r.peakWrite)" },
        { from: "gw", to: "postSvc", share: "=r.peakWrite/(r.peakRead+r.peakWrite)" },
        { from: "feedSvc", to: "tlRead" },
        { from: "feedSvc", to: "celeb", call: true, share: "=p.hybrid", label: "merge" },
        { from: "tlRead", to: "rebuild", miss: true, label: "miss" },
        { from: "postSvc", to: "postDb", call: true },
        { from: "postSvc", to: "queue", async: true },
        { from: "queue", to: "workers", async: true, mult: "=(1-p.celebPostShare)*p.avgFollowers+(1-p.hybrid)*p.celebPostShare*p.celebFollowers", label: "x N" },
        { from: "workers", to: "tlWrite", async: true },
      ],
      flows: [
        {
          label: "You open your feed",
          steps: [
            { path: ["readers", "gw"], text: "Your app asks for your feed. The **API gateway** checks who you are and sends the request on." },
            { path: ["gw", "feedSvc"], text: "The **feed service** builds one page of your feed." },
            { path: ["feedSvc", "tlRead"], text: "Your feed is already built: a list of post ids kept in the **timeline cache**, written there when people you follow posted. Reading it is one lookup." },
            { path: ["tlRead", "rebuild"], text: "If your feed is not in the cache, for example because you have not opened the app in weeks, it is rebuilt from who you follow and their recent posts. Slower, and about 1 read in 7 takes this path." },
            { path: ["feedSvc", "celeb"], text: "Posts from celebrities you follow were not copied into your list. The feed service merges them in now from a small **celebrity cache**." },
            { path: ["feedSvc", "gw", "readers"], text: "The page goes back to your app. The expensive work happened earlier, when the posts were written." },
          ],
        },
        {
          label: "You publish a post",
          steps: [
            { path: ["writers", "gw", "postSvc"], text: "Your post reaches the **post service**." },
            { path: ["postSvc", "postDb"], text: "It is saved in the **post store** first. Once that succeeds your post exists, and the app tells you so." },
            { path: ["postSvc", "queue"], text: "Copying it to your followers is handed to a **queue**, so you are not kept waiting while it happens." },
            { path: ["queue", "workers"], text: "**Fan-out workers** look up your followers. One post becomes one insert per follower: about 200 for a typical account." },
            { path: ["workers", "tlWrite"], text: "Each insert puts the post id at the top of a follower's cached feed. Next time they open the app, it is there." },
          ],
        },
        {
          label: "A celebrity posts",
          steps: [
            { path: ["writers", "gw", "postSvc", "postDb"], text: "A celebrity's post is saved the same way." },
            { path: ["postSvc", "queue", "workers"], text: "But the fan-out workers skip accounts with millions of followers. Copying one post into millions of feeds would swamp them." },
            { path: ["readers", "gw", "feedSvc", "celeb"], text: "Instead, followers pull it in when they read, from the celebrity cache. Try \"Push every post to every follower\" to see what happens without this." },
          ],
        },
      ],
      presets: [
        { label: "Normal day", set: {}, note: "Hybrid fan-out, a warm cache, sized for a peak of 3 times the daily average." },
        { label: "Push every post to every follower", set: { hybrid: 0 }, note: "Celebrity posts are pushed to millions of feeds. Watch the fan-out workers: the insert rate jumps about 50 times and feeds stop updating." },
        { label: "Feed cache restarts", set: { warm: 0 }, note: "Every feed read misses and hits the rebuild tier, which was sized for a small fraction of traffic. Latency climbs and requests start to fail." },
        { label: "Viral spike", set: { peak: 9 }, note: "Three times the planned peak. The gateway runs out first, so some requests fail before they reach anything else." },
        { label: "Lose most fan-out workers", set: { workers: 3 }, note: "Users see no errors, but about two thirds of new posts fall behind and reach feeds late. Watch \"Fan-out keeping up\". This is the failure that does not page anyone." },
      ],
      controls: [
        { id: "hybrid", label: "Hybrid fan-out", value: 1, min: 0, max: 1, step: 1, fmt: "onoff" },
        { id: "cacheGB", label: "Timeline cache memory", value: 600, min: 50, max: 2000, step: 50, unit: "GB" },
        { id: "warm", label: "Cache warmth", value: 1, min: 0, max: 1, step: 0.05, fmt: "pct" },
        { id: "shards", label: "Rebuild tier shards", value: 12, min: 2, max: 48, step: 1 },
        { id: "feedInst", label: "Feed service instances", value: 32, min: 4, max: 60, step: 1 },
        { id: "workers", label: "Fan-out workers", value: 12, min: 1, max: 40, step: 1 },
      ],
      metrics: [
        { label: "Cache hit rate", expr: "=m.nodes.tlRead.hit", fmt: "pct" },
        { label: "Fan-out keeping up", expr: "=m.nodes.workers.accFrac", fmt: "pct" },
      ],
    },
    {
      type: "estimation",
      title: "The numbers that force the design",
      lede: "Drag the assumptions. Everything below, and the architecture above, recomputes.",
      inputs: [
        { id: "dau", label: "Daily active users", value: 1e8, min: 1e6, max: 1e9, log: true, fmt: "si" },
        { id: "opens", label: "Feed opens per user per day", value: 10, min: 1, max: 40, step: 1 },
        { id: "posts", label: "Posts per user per day", value: 0.5, min: 0.1, max: 5, step: 0.1 },
        { id: "peak", label: "Peak to average ratio", value: 3, min: 1, max: 10, step: 0.5, unit: "x" },
        { id: "avgFollowers", label: "Followers of a typical poster", value: 200, min: 20, max: 2000, step: 10 },
        { id: "celebPostShare", label: "Share of posts by celebrity accounts", value: 0.002, min: 0.0001, max: 0.01, log: true, fmt: "pct" },
        { id: "celebFollowers", label: "Followers of a celebrity", value: 5e6, min: 1e5, max: 1e8, log: true, fmt: "si" },
      ],
      rows: [
        { id: "avgRead", label: "Feed reads, average", expr: "=p.dau*p.opens/86400", fmt: "si", unit: "req/s", why: "Daily opens spread over 86,400 seconds." },
        { id: "peakRead", label: "Feed reads, peak", expr: "=r.avgRead*p.peak", fmt: "si", unit: "req/s", why: "Capacity is sized for this number, not the average." },
        { id: "avgWrite", label: "Posts published, average", expr: "=p.dau*p.posts/86400", fmt: "si", unit: "posts/s" },
        { id: "peakWrite", label: "Posts published, peak", expr: "=r.avgWrite*p.peak", fmt: "si", unit: "posts/s" },
        { id: "readWrite", label: "Read to write ratio", expr: "=r.peakRead/r.peakWrite", fmt: "int", unit: ": 1", why: "Why we spend effort at write time to make reads cheap." },
        { id: "fanPerPost", label: "Feed inserts per post if we push to everyone", expr: "=(1-p.celebPostShare)*p.avgFollowers+p.celebPostShare*p.celebFollowers", fmt: "si", why: "A rare celebrity post dominates the average." },
        { id: "fanoutAll", label: "Insert rate, push to everyone, at peak", expr: "=r.peakWrite*r.fanPerPost", fmt: "si", unit: "inserts/s", why: "The number that sinks the naive design." },
        { id: "fanoutHybrid", label: "Insert rate, skip celebrities, at peak", expr: "=r.peakWrite*(1-p.celebPostShare)*p.avgFollowers", fmt: "si", unit: "inserts/s" },
        { id: "feedBytes", label: "Memory to hold every active user's feed", expr: `=p.dau*${FEED_LEN}*${FEED_ENTRY_BYTES}`, fmt: "bytes", why: `${FEED_LEN} entries of ${FEED_ENTRY_BYTES} bytes each. Not all of it needs to be hot.` },
        { id: "postBytes", label: "New post storage per day (1 KB each)", expr: "=r.avgWrite*86400*1000", fmt: "bytes" },
      ],
    },
    {
      type: "chart",
      title: "Where latency turns",
      lede: "Each point reruns the simulator above with a different peak ratio and every other setting as it is now. Change a control above, such as rebuild shards or cache memory, and the curve moves.",
      x: { label: "Peak to average ratio", from: 1, to: 10, steps: 72, param: "peak", fmt: "si" },
      y: { label: "Average latency (ms)", fmt: "ms", min: 0 },
      series: [{ label: "Average feed and post latency", expr: "=m.lat" }],
      note: "A slow rise, then a wall. Latency creeps up while the busiest tier on the read path fills, then queueing takes over. The flat line past the wall is not recovery: the model caps queueing at 97% busy, and from there the extra traffic is shed as failed requests instead (try the Viral spike preset). Capacity planning is about staying left of the knee at the peak you expect.",
    },
    {
      type: "tradeoffs",
      title: "The decisions that matter",
      items: [
        {
          question: "Build the feed when a post is written, or when the feed is read?",
          options: [
            { name: "Fan-out on write (push)", pros: ["A read is one cache lookup", "Cost is paid once per post, not once per read"], cons: ["One celebrity post means millions of inserts", "Wasted work for followers who never open the app"] },
            { name: "Fan-out on read (pull)", pros: ["No write amplification", "Always fresh"], cons: ["Every read queries hundreds of followees and merges", "Reads are about 20 times more common, so this is the expensive side"] },
            { name: "Hybrid", pick: true, pros: ["Push for normal accounts, pull for celebrities", "Bounds both the write and the read cost"], cons: ["Two code paths to keep correct", "Needs a rule for who counts as a celebrity"] },
          ],
          why: "The simulator shows it. Switch hybrid off and the worker tier collapses. A pure pull design would instead move that cost into every one of the thirty-odd thousand reads per second.",
        },
        {
          question: "How do we paginate?",
          options: [
            { name: "Offset and limit", cons: ["New posts shift every page, so users see repeats", "Deep offsets are slow"] },
            { name: "Cursor on post id", pick: true, pros: ["Stable under inserts", "Index range scan, constant cost"], cons: ["Cannot jump to page N"] },
          ],
        },
      ],
    },
    {
      type: "failures",
      title: "What breaks",
      items: [
        { what: "Cache restart", effect: "Hit rate drops to zero. All reads fall through to the rebuild tier.", mitigation: "Warm gradually from a snapshot, rate-limit rebuilds, serve a slightly stale feed from a replica while warming.", inject: { warm: 0 } },
        { what: "Celebrity posts with push-only fan-out", effect: "Millions of inserts for one post. Workers fall minutes behind and every other user's feed goes stale with it.", mitigation: "Hybrid mode with a follower-count threshold, and a separate queue for large fan-outs.", inject: { hybrid: 0 } },
        { what: "Fan-out workers die", effect: "Nothing errors. Feeds quietly stop updating.", mitigation: "Alert on queue lag and on time-since-last-insert, not only on error rate. Workers must be idempotent so replays are safe.", inject: { workers: 3 } },
        { what: "Traffic spike beyond plan", effect: "The gateway sheds first and a fraction of users get errors.", mitigation: "Autoscale on request rate, shed low-priority traffic first, and degrade by serving the cached page without hydration.", inject: { peak: 9 } },
      ],
    },
    {
      type: "api",
      title: "The API",
      endpoints: [
        { method: "POST", path: "/v1/posts", desc: "Publish. Returns once the post is durable; fan-out happens after.", req: '{ "text": "...", "media": ["m_81"] }', res: '{ "post_id": "p_9f3", "created_at": 1767225600 }' },
        { method: "GET", path: "/v1/feed?cursor=&limit=20", desc: "Cursor pagination. The cursor is a post id, not an offset, so new posts never shift the page.", res: '{ "posts": [...], "next_cursor": "p_7c1" }' },
        { method: "PUT", path: "/v1/follows/{user_id}", desc: "Follow. Triggers a backfill of that user's recent posts into your feed." },
      ],
    },
    {
      type: "data",
      title: "Data model",
      lede: "Three stores, each chosen for how it is read.",
      tables: [
        { name: "posts", store: "sharded SQL by post_id", columns: [{ key: "PK", name: "post_id", type: "bigint", note: "time-ordered id" }, { name: "author_id", type: "bigint" }, { name: "body", type: "text" }, { name: "created_at", type: "ts" }], why: "The source of truth. A feed entry is just a post_id pointing here." },
        { name: "follows", store: "wide-column, by follower and by followee", columns: [{ key: "PK", name: "user_id", type: "bigint" }, { key: "CK", name: "followee_id", type: "bigint" }, { name: "since", type: "ts" }], why: "Stored twice (who I follow, who follows me) because both directions are queried." },
        { name: "timeline:{user_id}", store: "Redis sorted set", columns: [{ name: "member", type: "post_id" }, { name: "score", type: "created_at" }], why: `Capped at ${FEED_LEN}. Reading a feed is one ZREVRANGE.` },
      ],
    },
    {
      type: "qa",
      title: "What an interviewer asks next",
      items: [
        { q: "What if a user follows 10,000 accounts?", a: ["The push path is per author, so it does not care. The read path is the one to watch: the timeline is capped at a fixed length, so reading stays constant. The cost shows up on follow, when we backfill. Cap or throttle that backfill."] },
        { q: "How do you keep a post from appearing twice?", a: ["Timeline entries are keyed by post_id in a sorted set, so an insert is idempotent. A replayed fan-out job changes nothing. The cursor is also a post id, which makes pagination stable."] },
        { q: "How do you add ranking later?", a: ["Keep this list as the candidate set. A ranking service takes the top few hundred candidates, scores them, and reorders. The storage and fan-out design does not change."] },
        { q: "What would you monitor?", a: ["Feed read latency p99, cache hit rate, rebuild tier utilisation, queue lag, and the age of the newest entry in a sample of timelines. The last one catches silent failures that error rates miss."] },
      ],
    },
  ],
};

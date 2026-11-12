// HLD example written for a learner: Netflix recommendations.
// Architecture from Netflix's 2013 post "System Architectures for Personalization and
// Recommendation" (Amatriain and Basilico). Component names are theirs; traffic and
// capacity numbers are illustrative, chosen to show how the parts behave.

const SOURCE = "https://netflixtechblog.com/system-architectures-for-personalization-and-recommendation-e081aa94b5d8";

export default {
  kind: "hld",
  title: "Netflix recommendations",
  subtitle: "How Netflix picks the rows and titles on your home page, and why the work is split into three speeds.",
  idea: "Most of the work happens before you open the app. Heavy models run offline over everyone's history, quick updates run nearline right after you do something, and only a light final ranking runs online while you wait.",
  sections: [
    {
      type: "text",
      title: "The big picture",
      body: [
        "When you open Netflix, the home page is already personal: rows like \"Because you watched...\" filled with titles picked and ordered for you. Working that out from scratch while you wait would be far too slow. So Netflix splits the work by how fresh each part needs to be.",
        "**Offline** jobs run in big batches, over hours, on everyone's viewing history. They train the models and precompute a list of candidate titles for every member. **Nearline** jobs react within seconds or minutes when you do something, like finishing an episode, and update your stored results. **Online** is the only part that runs while you wait: it takes the stored results and adjusts them using things only known right now, such as your device and the time of day.",
        `This page follows the architecture Netflix described in its tech blog post [System Architectures for Personalization and Recommendation](${SOURCE}) (Xavier Amatriain and Justin Basilico, 2013). The component names are theirs. The traffic and capacity numbers are illustrative, chosen to show how the parts behave, not Netflix's real figures.`,
      ],
    },
    {
      type: "arch",
      title: "The architecture",
      lede: "Start with **How it works**: pick a walkthrough and press Next. Then pick something to **Try** and watch what a viewer would notice. Click any box for what it does.",
      latencyBudget: 200,
      intro: "A normal evening. Pick a walkthrough above to see how a request or an event moves through the system.",
      groups: [
        { id: "online", label: "Online", note: "while you wait, in milliseconds" },
        { id: "nearline", label: "Nearline", note: "right after you act, in seconds to minutes" },
        { id: "offline", label: "Offline", note: "in batches, over hours" },
        { id: "store", label: "Stored results" },
      ],
      nodes: [
        { id: "member", label: "You (the app)", icon: "phone", kind: "clients", rps: "=r.homeRps", group: "online", col: 0, row: 0, role: "The Netflix app on your TV, phone or laptop.", why: "It asks for your home page and reports what you do (play, pause, finish, rate) as events." },
        { id: "api", label: "Netflix API", group: "online", col: 1, row: 0, instances: 20, cap: 1000, ms: 5, role: "The front door for every app request.", why: "Turns \"give me my home page\" into calls to the services that know the answer.", scale: "Stateless, add servers.", fails: "Overloaded if every request becomes expensive." },
        { id: "online", label: "Online ranking", group: "online", col: 2, row: 0, instances: 30, cap: "=p.precompute ? (p.onlineRank ? 600 : 3000) : 40", ms: "=p.precompute ? (p.onlineRank ? 25 : 4) : 300", role: "Puts the final order on your rows while you wait.", why: "Uses fresh context that offline jobs cannot know: your device, the time of day, what you did a minute ago. It starts from stored candidates, so the work is small.", scale: "Add servers. Each one is cheap because the heavy work is already done.", fails: "If ranking would miss its deadline, it falls back to the stored list as it is. You still get a page." },
        { id: "evcache", label: "EVCache", kind: "cache", group: "store", col: 3, row: 0, instances: 12, cap: 10000, ms: 1, hit: 0.97, role: "In-memory cache of your precomputed recommendations.", why: "Reading from memory takes about a millisecond, so the online step can afford to read many candidates.", scale: "Add memory and nodes.", fails: "A restart sends reads to Cassandra until it warms up." },
        { id: "cassandra", label: "Cassandra", kind: "store", group: "store", col: 3, row: 1, instances: 12, cap: 4000, ms: 6, role: "Durable store for recommendation results.", why: "Durable, scalable store for results, so they survive if the cache is lost.", scale: "Add nodes; data is spread by member.", fails: "Slower than the cache, so it should only see cache misses on the read path." },
        { id: "events", label: "Event stream", kind: "queue", group: "nearline", col: 1, row: 1, instances: 30, cap: 10000, ms: 2, role: "Carries small, time-sensitive messages: play, pause, finish, rate.", why: "Lets many jobs react to the same event without the app knowing about them. Netflix handled this event flow with Manhattan, an internal stream-processing framework similar to Twitter's Storm.", scale: "Add partitions.", fails: "If consumers fall behind, events wait in the queue." },
        { id: "nearline", label: "Nearline jobs", icon: "worker", group: "nearline", col: 2, row: 1, instances: "=p.nearWorkers", cap: 1200, role: "Updates your stored recommendations right after you act.", why: "Finishing a show should change your home page now, not tomorrow. Nobody is waiting on this job, so it can do more work than the online step.", scale: "Add workers.", fails: "If events arrive faster than workers handle them, your home page stops reflecting what you just did. Nothing errors." },
        { id: "logs", label: "Logs in Hadoop", icon: "storage", kind: "batch store", group: "offline", col: 1, row: 2, role: "Everyone's full history: every play, search and rating.", why: "Offline jobs need all of it. Netflix collected logs with Chukwa into Hadoop.", scale: "Add storage." },
        { id: "jobs", label: "Offline jobs", icon: "batch", kind: "batch", group: "offline", col: 2, row: 2, role: "Train the models and precompute candidate lists for every member.", why: "With no one waiting, these jobs can use the most data and the heaviest models. Written in Hive and Pig on Hadoop; results were published to the online stores through Hermes, a publish-subscribe system.", scale: "More machines, or more hours.", fails: "If a nightly run fails, members get yesterday's baseline. Nothing errors." },
      ],
      edges: [
        { from: "member", to: "api" },
        { from: "api", to: "online", call: true },
        { from: "online", to: "evcache", call: true },
        { from: "evcache", to: "cassandra", miss: true, label: "miss" },
        { from: "member", to: "events", async: true, share: "=r.eventRps/r.homeRps", label: "events" },
        { from: "events", to: "nearline", async: true, share: "=p.triggerShare*p.nearlineOn" },
        { from: "nearline", to: "evcache", async: true, label: "update" },
        { from: "nearline", to: "cassandra", async: true },
        { from: "events", to: "logs", async: true, label: "log" },
        { from: "logs", to: "jobs", async: true },
        { from: "jobs", to: "cassandra", async: true, share: "=p.precompute*0.02", label: "publish" },
      ],
      flows: [
        {
          label: "You open the home page",
          steps: [
            { path: ["member", "api"], carry: "GET /home", text: "You open Netflix. The app asks the **Netflix API** for your home page: rows of titles, picked and ordered for you." },
            { path: ["api", "online"], carry: "rank request", text: "The API calls **online ranking**. This step has a strict time limit, because you are looking at a loading screen." },
            { path: ["online", "evcache"], carry: "read candidates", text: "Online ranking does not start from scratch. It reads the candidates already computed for you from **EVCache**, an in-memory cache. About a millisecond." },
            { path: ["evcache", "cassandra"], carry: "cache miss", text: "If they are not in the cache, they come from **Cassandra**, the durable store behind it. Slower, but rare: about 3% of reads here." },
            { path: ["online"], text: "Now the light, fresh part: it re-orders the candidates using what it only knows now, such as your device and the time of day." },
            { path: ["online", "api", "member"], carry: "your rows", text: "Your rows go back to the app. Almost all the work behind them was done before you opened it." },
          ],
        },
        {
          label: "You finish an episode",
          steps: [
            { path: ["member", "events"], carry: "▶ finished ep.", text: "The app sends an **event**: you finished an episode. Events are small messages about something that just happened." },
            { path: ["events", "nearline"], carry: "▶ finished ep.", text: "A **nearline job** picks the event up within seconds to minutes. You are not waiting on it, so it can do more work than the online step." },
            { path: ["nearline", "evcache"], carry: "new picks", text: "It recomputes the parts of your recommendations this event changes, for example dropping the show you finished and adding similar ones, and writes them to EVCache..." },
            { path: ["nearline", "cassandra"], carry: "new picks", text: "...and to Cassandra, so they survive a cache restart. Next time you open the home page, online ranking reads these fresh results." },
          ],
        },
        {
          label: "Every night",
          steps: [
            { path: ["member", "events", "logs"], carry: "event log", text: "Every event is also logged. Over a day that is everyone's full history, stored in **Hadoop**." },
            { path: ["logs", "jobs"], carry: "viewing history", text: "**Offline jobs** run over all of it. They train the models and precompute a candidate list for every member. They can take hours, so they can use the most data and the heaviest models." },
            { path: ["jobs", "cassandra"], carry: "fresh baselines", text: "The results are published to the stored results. By morning every member has a fresh baseline, which nearline then keeps up to date during the day." },
          ],
        },
        {
          label: "When the live step is too slow",
          steps: [
            { path: ["member", "api", "online"], carry: "GET /home", text: "Online ranking has a deadline. Sometimes ranking a page would take too long: a slow model, a busy server." },
            { path: ["online", "evcache"], carry: "stored list", text: "Then it **falls back**: it serves the stored list from the cache without the live adjustments. You still get a good page, just not tuned to this exact moment. Try the \"Online ranking too slow\" change." },
          ],
        },
      ],
      presets: [
        { label: "Normal evening", set: {}, note: "All three speeds on. Your page loads quickly and reflects what you did a minute ago." },
        { label: "Turn off nearline", set: { nearlineOn: 0 }, expect: "=!p.nearlineOn && m.err < 0.001 && m.nodes.nearline.util < 0.01", note: "Nothing breaks and nothing gets slower. But finish a show and it stays on your home page until the next nightly run. Watch \"New activity shows up\"." },
        { label: "Big premiere night", set: { surge: 3 }, expect: "=m.err < 0.001 && m.nodes.events.util > 1 && m.nodes.nearline.util > 1", note: "Three times the usual events as everyone hits play at once. Pages still load. But the event stream is overloaded and the nearline workers fall behind, so your home page lags behind what you just did." },
        { label: "Online ranking too slow", set: { onlineRank: 0 }, expect: "=!p.onlineRank && m.err < 0.001 && m.lat < 40", note: "Online ranking falls back to the stored list. Pages get faster and nothing fails; you just lose the adjustments for this moment. Watch \"Your rows are\"." },
        { label: "Skip precomputing, do it all live", set: { precompute: 0 }, expect: "=m.nodes.online.util > 5 && m.err > 0.5 && m.lat > 1000", note: "Every page now runs the full models while you wait. Online ranking runs out of capacity, pages slow to a crawl and most fail. This is why the heavy work runs offline." },
      ],
      controls: [
        { id: "nearlineOn", label: "Nearline updates", value: 1, min: 0, max: 1, step: 1, fmt: "onoff" },
        { id: "onlineRank", label: "Live re-ranking", value: 1, min: 0, max: 1, step: 1, fmt: "onoff" },
        { id: "precompute", label: "Precompute offline", value: 1, min: 0, max: 1, step: 1, fmt: "onoff" },
        { id: "surge", label: "Event surge", value: 1, min: 1, max: 5, step: 0.5, unit: "x" },
        { id: "nearWorkers", label: "Nearline workers", value: 20, min: 2, max: 60, step: 1 },
      ],
      metrics: [
        { label: "New activity shows up", expr: "=p.nearlineOn ? (m.nodes.nearline.util < 1 ? 'in ~1 min' : 'falling behind') : 'next day'", warn: "=!p.nearlineOn", bad: "=p.nearlineOn && m.nodes.nearline.util >= 1" },
        { label: "Your rows are", expr: "=!p.precompute ? 'built live' : p.onlineRank ? 'tuned live' : 'stored list'", warn: "=p.precompute && !p.onlineRank" },
      ],
    },
    {
      type: "patterns",
      title: "Three speeds, side by side",
      lede: "The core idea of the design. Each speed does what the others cannot.",
      items: [
        { name: "Offline", where: "Runs in batches over hours, on everyone's history.", why: "Can use the most data and the heaviest models, and costs least per result. But results are hours old, and it knows nothing about this moment." },
        { name: "Nearline", where: "Runs seconds to minutes after you act, triggered by events.", why: "Fresh enough to react to what you just watched, without making you wait. Results are stored, so the online step can use them." },
        { name: "Online", where: "Runs while you wait, in milliseconds.", why: "The only step that knows your device and the time right now. Must be light, so it re-orders stored candidates instead of computing from scratch, and falls back if it is late." },
        { name: "Signals, models and data", where: "What every step combines.", why: "**Models** are trained offline. **Data** is prepared information, such as title metadata and popularity. **Signals** are fresh inputs, such as what you watched last and your device. Each speed uses the freshest inputs it can afford." },
      ],
    },
    {
      type: "tradeoffs",
      title: "The decisions that shape it",
      items: [
        {
          question: "Where should recommendations be computed?",
          options: [
            { name: "Everything online", pros: ["Always uses the very latest signals"], cons: ["Heavy models on every page view: slow and expensive (try \"Skip precomputing\")"] },
            { name: "Everything offline", pros: ["Cheapest, simplest"], cons: ["Hours out of date: a show you just finished keeps being recommended (try \"Turn off nearline\")"] },
            { name: "Layered: offline, nearline, online", pick: true, pros: ["Heavy work done once in batch", "Fresh reactions within minutes", "A light, fast final step"], cons: ["Three systems to build and keep consistent"] },
          ],
          why: "Each layer covers the others' weakness. The presets show what you lose when one is missing.",
        },
        {
          question: "Where do precomputed results live?",
          options: [
            { name: "MySQL", pros: ["Familiar, flexible queries"], cons: ["Hard to scale to this volume of writes from batch and nearline jobs"] },
            { name: "Cassandra alone", pros: ["Scales writes, durable"], cons: ["Slower reads than memory on every page load"] },
            { name: "EVCache in front of Cassandra", pick: true, pros: ["Memory-speed reads", "Durable copy if the cache is lost"], cons: ["Two stores to keep in step"] },
          ],
          why: "The read path needs memory speed and the results need a durable home. The blog post names all three stores and says each suits different data: MySQL for structured data, Cassandra for scalable storage, and EVCache for heavy, constant writes. The cache-in-front layout here is a simplification.",
        },
      ],
    },
    {
      type: "failures",
      title: "What can go wrong",
      items: [
        { what: "Nearline falls behind", effect: "Pages load fine, but they stop reflecting what you just did. No error anywhere.", mitigation: "Watch how far behind the event queue is. Before big releases, add event stream partitions as well as workers.", inject: { surge: 3 } },
        { what: "Online ranking is too slow", effect: "It falls back to the stored list. Pages still load, slightly less tuned to the moment.", mitigation: "This is the designed behaviour: a deadline plus a fallback, so a slow model never blocks your home page.", inject: { onlineRank: 0 } },
        { what: "The nightly job fails", effect: "Members get yesterday's baseline. Nearline keeps adding recent activity, so most people never notice.", mitigation: "Keep the last good results and alert when a run is late, rather than publishing partial results." },
        { what: "Someone tries to do it all live", effect: "Every page runs the full models. Servers run out of capacity and pages fail.", mitigation: "Keep heavy work offline. Online only re-orders.", inject: { precompute: 0 } },
      ],
    },
    {
      type: "estimation",
      title: "Go deeper: the numbers behind the simulator",
      lede: "Illustrative numbers, not Netflix's real ones. Drag them and the architecture above recomputes.",
      inputs: [
        { id: "members", label: "Members active at peak", value: 2e7, min: 1e6, max: 1e8, log: true, fmt: "si" },
        { id: "loads", label: "Home page loads per member per hour", value: 2, min: 0.5, max: 10, step: 0.5 },
        { id: "actions", label: "Events per member per hour (play, pause, rate, browse)", value: 30, min: 5, max: 120, step: 5 },
        { id: "triggerShare", label: "Share of events that change recommendations", value: 0.1, min: 0.01, max: 0.5, step: 0.01, fmt: "pct" },
      ],
      rows: [
        { id: "homeRps", label: "Home page requests", expr: "=p.members*p.loads/3600", fmt: "si", unit: "req/s", why: "The online path must answer every one of these within the time limit." },
        { id: "eventRps", label: "Events", expr: "=p.members*p.actions/3600*p.surge", fmt: "si", unit: "events/s", why: "Many more events than page loads: most of what you do is not opening the home page." },
        { id: "nearRps", label: "Events that trigger a nearline update", expr: "=r.eventRps*p.triggerShare*p.nearlineOn", fmt: "si", unit: "updates/s", why: "Finishing a show matters; pausing does not." },
        { id: "liveServers", label: "Online servers needed if pages are tuned from stored lists", expr: "=ceil(r.homeRps/600/0.7)", fmt: "int", why: "One server handles about 600 pages a second, kept 70% busy." },
        { id: "scratchServers", label: "Online servers needed if every page ran the full models", expr: "=ceil(r.homeRps/40/0.7)", fmt: "int", why: "About 40 pages a second each. This gap is why the heavy work is precomputed." },
      ],
    },
    {
      type: "qa",
      title: "Questions a learner asks",
      items: [
        { q: "Why not just compute my recommendations when I open the app?", a: ["Because the good models are heavy. Running them for every page view would need many times more servers and make you wait (compare the last two rows above). Precomputing does the heavy part once, ahead of time."] },
        { q: "What is a \"model\" here?", a: ["A function learned from everyone's viewing history that scores how likely you are to enjoy a title. It is trained offline, because training needs all the data and takes hours."] },
        { q: "How does finishing a show change my home page so quickly?", a: ["The app sends an event, a nearline job reacts within seconds to minutes and rewrites your stored results, and the next page load reads them. Try turning nearline off to see the difference."] },
        { q: "Is this how Netflix works today?", a: ["This page follows the architecture Netflix published in 2013. Their systems have changed since, but splitting work into offline, nearline and online stages is still a common way large recommendation systems are built."] },
      ],
    },
  ],
};

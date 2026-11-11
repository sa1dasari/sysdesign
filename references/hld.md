# HLD pages

Section order for a learner (the default). For interview prep, move `estimation`, `api` and `data` up after `requirements`. Cut a section only if it truly has nothing to say.

1. **text** "The big picture": three short paragraphs. What the system does for the user, the one idea that shapes it, and for a real product a link to its source.
2. **requirements** (optional for a learner): functional, non-functional with numbers (latency, freshness), out of scope.
3. **arch**, the centrepiece:
   - 6 to 10 nodes, each with `role`, `why`, `scale`, `fails` in plain words.
   - Lanes (`groups`) for the layers or paths the design is built from (read path and write path; online, nearline, offline), with `col` and `row` on every node so each lane is a clean band.
   - 2 or 3 walkthroughs (`flows`): the main request, the main write or event, and the background or failure path. One or two sentences per step, defining each term the first time.
   - 3 or 4 presets named for what a user would notice, each with a note saying what to watch. 2 or 3 controls.
   - One or two custom `metrics` in user terms (freshness, what the user sees), next to latency and errors.
4. **chart** (optional): one curve that sweeps the input the force depends on and reruns the simulator at each point. Latency against peak traffic is the default.
5. **patterns** or **tradeoffs**: the two or three decisions that define the design, each with a `pick` and a reason tied to a preset.
6. **failures**: three or four, each with an `inject` preset where possible. Include one that raises no error.
7. **estimation** "Go deeper": inputs and derived rows, including one row that shows why the naive design fails. Say that numbers for a real product are illustrative.
8. **api** and **data**: only when they are part of the idea (cursor pagination, a store chosen for how it is read).
9. **qa**: what a learner asks next, two or three sentences each.

## Worked examples

These are shortcuts for common topics, not a limit. Any topic works: for one not listed, use "Any topic" in `SKILL.md`. Many of these also need the object or mechanism view (see step 1 of the workflow).

| Topic | The force | The break-it presets |
|---|---|---|
| News feed | Write amplification from celebrities | No hybrid, cold cache, worker loss |
| Cache | Hit rate vs memory, hot keys, stampede | Cold start, one hot key, eviction policy swap |
| Rate limiter | Counting accurately across nodes | Clock skew, one limiter node lost, burst at window edge |
| Real-time ride matching | Geo-index update rate vs query rate | City-wide surge, region split, driver location update storm |
| URL shortener | Read-heavy key lookup, id generation | Viral link (hot key), id collisions |
| Chat | Fan-out to online vs offline, ordering | Group of 100k, reconnect storm |
| Notification service | Provider rate limits, retries | Provider outage, retry storm |
| Video upload and streaming | Transcode CPU per uploaded minute; egress bandwidth on reads | Upload spike, transcoder pool loss, CDN miss storm |
| Payments and ledger | Exactly-once money movement across services | Duplicate request without idempotency key, processor timeout, ledger shard hot account |
| Search typeahead | Prefix lookups per keystroke | Keystroke spike, cold prefix cache, long-tail prefixes |
| Distributed job scheduler | Firing many jobs at the same instant | Top-of-the-hour burst, worker loss, stuck lease |
| Metrics and time series | Write rate of points, cardinality of series | Cardinality explosion, ingest spike, slow query fan-out |
| Web crawler | Politeness per host vs total throughput | One huge host, DNS resolver saturation, duplicate URLs |
| Collaborative editing | Ops per second per document, ordering | One viral doc, reconnect storm, server restart |
| Stock exchange matching | One ordered book per symbol, latency | Hot symbol, sequencer failover, market-open burst |


For ride matching, the model is geospatial: cells per city, driver updates per second, match queries per second. The load is on the location index, not the web tier. Put that tier in the graph.

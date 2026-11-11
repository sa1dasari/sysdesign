# HLD pages

Section order. Cut a section only if it truly has nothing to say.

1. **requirements**: functional (4 or so), non-functional with numbers (latency, availability, freshness), and out of scope. Scope is a design decision. State it.
2. **estimation**: inputs, then derived rows. Include one row that exposes the naive design's problem.
3. **api**: 3 to 5 endpoints. For each, one line on the design choice (cursor vs offset, sync vs async).
4. **data**: the stores and why each fits how it is read. Two or three tables.
5. **arch**: the simulator. 8 to 14 nodes. Presets (4 to 6), controls (4 to 6), and two or three custom `metrics` that expose what the generic ones hide (cache hit rate, fan-out lag).
6. **chart** (optional, recommended): one curve that sweeps the input the force depends on and reruns the simulator at each point. Latency against peak traffic is the default. See "Charts" in `model.md`.
7. **tradeoffs**: the two or three decisions that define the design, each with a `pick` and why. Tie each back to something the simulator shows.
8. **failures**: four. Each has an `inject` preset so the reader can trigger it. Include one that raises no error.
9. **qa**: what the interviewer asks next. Answers of two or three sentences.

## Topic patterns

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

For a topic not listed, use the "Any topic" method in `SKILL.md`: the obvious design, the moment it fails, the quantity that measures it, and the preset that shows it.

For ride matching, the model is geospatial: cells per city, driver updates per second, match queries per second. The load is on the location index, not the web tier. Put that tier in the graph.

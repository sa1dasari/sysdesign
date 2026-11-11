# HLD pages

Section order. Cut a section only if it truly has nothing to say.

1. **requirements**: functional (4 or so), non-functional with numbers (latency, availability, freshness), and out of scope. Scope is a design decision. State it.
2. **estimation**: inputs, then derived rows. Include one row that exposes the naive design's problem.
3. **api**: 3 to 5 endpoints. For each, one line on the design choice (cursor vs offset, sync vs async).
4. **data**: the stores and why each fits how it is read. Two or three tables.
5. **arch**: the simulator. 8 to 14 nodes. Presets (4 to 6), controls (4 to 6), and two or three custom `metrics` that expose what the generic ones hide (cache hit rate, fan-out lag).
6. **tradeoffs**: the two or three decisions that define the design, each with a `pick` and why. Tie each back to something the simulator shows.
7. **failures**: four. Each has an `inject` preset so the reader can trigger it. Include one that raises no error.
8. **qa**: what the interviewer asks next. Answers of two or three sentences.

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

For ride matching, the model is geospatial: cells per city, driver updates per second, match queries per second. The load is on the location index, not the web tier. Put that tier in the graph.

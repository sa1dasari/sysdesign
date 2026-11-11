# Writing the model

The model is the part that makes the page true. Spend most of your effort here.

## HLD: three layers

1. **Inputs** (`estimation.inputs`). Daily users, actions per user, peak ratio, sizes. Use `log: true` for ranges that span orders of magnitude (users, followers). Defaults are a realistic mid-large product, and each input must be read by at least one expression (the validator rejects a dead slider).
2. **Derived rows** (`estimation.rows`). Averages, then peaks, then the amplified numbers that shape the design (fan-out, storage, bandwidth). Order matters: a row can read earlier rows through `r.id`. Put the *naive design's* number next to the *chosen design's* number so the reader sees what the decision buys.
3. **Graph** (`arch`). Source nodes carry `rps: "=r.peakRead"`. Each node has:
   - `instances` and `cap` (requests per second one instance serves), `ms` (service time at low load).
   - `kind`: `cache`, `store`, `queue`, `clients`. A queue that is overloaded shows a growing backlog instead of errors.
   - `hit` (cache only): hit ratio. Pair with an outgoing edge marked `miss: true`. Use `zipf(...)` for a cache sized in memory.
   - Text for the click-through panel: `role`, `why`, `scale`, `fails`.

## Edge semantics

| Edge | Meaning |
|---|---|
| default | One of several alternatives. Traffic splits equally, or by `share`. |
| `share: "=expr"` | Fraction of the node's accepted traffic taking this edge. |
| `miss: true` | Carries `(1 - hit)` of the node's traffic. The hit part ends at the node. |
| `call: true` | Every request makes this call (with probability `share`). Latency adds and success multiplies. |
| `async: true` | Loads the target but is not on the user's path. No latency or errors for the user. Use for queues and fan-out. |
| `mult: "=expr"` | Multiplies the flow. One post becomes N inserts. This is how write amplification appears. |

## How the numbers are computed

Rates propagate through the graph in topological order. A node serves `min(inflow, instances x cap)`; the rest is shed. Utilisation is `inflow / capacity`. Latency per node is `ms / (1 - utilisation)`, capped at 97% utilisation, the M/M/1 shape. Success probability and expected latency are computed along synchronous edges. Async edges affect load only.

That is enough to show *which tier saturates first* and *what the user feels*. It is not a performance prediction. Say so.

## Sizing the healthy baseline

Set capacities so that at default inputs, the busiest tier is around 60 to 75%, nothing sheds, and latency is under budget. Then choose presets that each push one tier past 100%. If a preset changes nothing, the model is not capturing the idea. Rework it.

## LLD: run the real code

The reference implementation lives in a file next to the spec (for example `lot.mjs`). The spec imports it, drives a scenario, and records `snapshot()` after each step. The `code` section shows that same file, read from disk, so the page cannot disagree with the code that ran.

- Write the implementation in JavaScript by default. It must be small enough to read: under about 120 lines.
- Include the failure paths in the scenario (full lot, duplicate plate, unknown ticket). The interesting step is usually where a policy does something questionable.
- If the user wants Java, Python or Go, add the translation as extra `code` files and label them in the lede as not executed. Never present unexecuted code as the thing that ran.

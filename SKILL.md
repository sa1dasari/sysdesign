---
name: sysdesign
description: Explain any system design or distributed-systems topic as a live, interactive page. Use when someone asks to understand, learn, or prepare for the design of a system (news feed, cache, chat, URL shortener, ride matching, payments, video streaming), an object model (parking lot, elevator, LRU cache, vending machine), or how a mechanism works (consistent hashing, Raft, Bloom filters, LSM trees, rate limiting algorithms, CAP, OAuth), including interview prep. Builds one self-contained HTML page with math that recomputes as you drag, live charts, a request-flow simulator you can stress and break, and for object models and algorithms a class diagram, sequence diagram, state machine and a scenario run from real code.
license: MIT
compatibility: Needs Node.js 20.10+. Chrome or Chromium is used for the checks.
---

# sysdesign

Turn a system design topic into a page the reader can poke. The reader should finish knowing why the design is shaped the way it is, because they moved a slider and watched the thing that forces the shape fail.

## The one idea that matters

**Truth first, then show it.** Every number on the page comes from one small model the page itself runs. Drag "daily active users" and the estimate, the load on each box and the failure rate all move. If a number is typed into prose and not computed, it will drift out of agreement with the rest of the page. Write the model before the prose.

Two ways this fails:
- **A gallery of boxes and arrows.** A diagram nobody can disturb teaches nothing. Every architecture needs presets that break it.
- **A wall of correct text.** Interview-prep pages are usually this. The page must have a moment where the reader sees the naive design collapse.

## Workflow

1. **Decide which views the topic needs.** Any topic can be explained. Do not pick one label and squeeze the topic into it. Ask three questions and answer each from the topic itself:
   - **Does it run on many machines or face load?** Requests per second, storage, replicas, a service in front of a database. Then it needs the **system view** (HLD): `requirements`, `estimation`, `api`, `data`, `arch`.
   - **Is there code with state and behaviour worth designing?** A class whose state changes, policies that must be swappable, a lifecycle. Then it needs the **object view** (LLD): `classes`, `sequence`, `states`, `scenario`, `code`, `patterns`.
   - **Is there a mechanism whose behaviour is the point?** An algorithm, data structure or protocol, where the insight is a curve or an order of messages. Then it needs the **mechanism view** (concept): `chart`, `sequence`, `states`, `scenario`, `code`.

   Include every view that gets a yes, on one page. Most interview topics get two: a rate limiter is a service under load and a token-bucket algorithm; a URL shortener is a read-heavy service and an ID-generation scheme; an LRU cache is a class and, at scale, a cache cluster. Set `kind` to the views the page covers, main one first: `"hld"`, or `["hld", "lld"]`. It sets the page's label. Each view should still earn its place: drop one if it would only repeat the other.

   An explicit `--hld`, `--lld` or `--concept` means that view leads and gets the most depth. Others can still appear if the topic needs them. In the reply, say in one line which views the page covers and why.
2. **Find the force.** Name the one constraint that shapes the design: write amplification (feed), hot keys (cache), a policy that must change independently (parking lot), the keys that move when N changes (consistent hashing). The page's `idea` is one sentence about it. If you cannot state it, you do not understand the topic yet. Research if needed, using current sources for anything about real products. The tables in `references/` are worked examples for common topics, not a list of what is supported. For anything else, use the method in "Any topic" below.
3. **Write the model.** HLD: the inputs, the derived rows, and the node graph with capacities. LLD and concept: the reference implementation that you will run. Read `references/model.md`.
4. **Write the spec** (`spec.mjs`). For one view, follow the section order in `references/hld.md`, `references/lld.md` or `references/concept.md`. For several, use the combined order below.
5. **Build:** `node scripts/build.mjs path/to/spec.mjs`. It validates first and refuses to build a page that is silently wrong.
6. **Check like a reviewer:** `node scripts/check.mjs path/to/index.html --shots /tmp/shots`. It prints what each preset does to the numbers. Read the screenshots. Fix and repeat. Read `references/verify.md`.
7. **Deliver** the page. Give a one-line summary and the one decision on the page the reader should poke first.

**Combined order** for a page with several views: the problem or requirements, then the system (`estimation`, `api`, `data`, `arch`), then the mechanism (`chart`, `scenario`), then the objects (`classes`, `sequence`, `states`, `code`), then `tradeoffs`, `failures` and `qa` covering all of it. Keep one `idea` for the whole page. The views should explain the same force from different distances, not be two pages stapled together. See `examples/rate-limiter/`.

Size the work before starting: a Figure is one topic with one simulator or one class model (build without asking). If the user names something huge ("design YouTube"), pick the one subsystem that carries the idea (upload and transcode, or the read path), say so, and offer the rest as follow-up pages.

## Any topic

The tables in `references/` are worked examples. For any other topic, work it out in this order. Do not refuse a topic or force it into the wrong view.

1. **Ask what goes wrong with the obvious design.** Every topic exists because the first idea fails. `hash mod N` reshuffles everything; a single database runs out of writes; one lock serialises everything; a counter on one node disagrees with another. That failure is the force.
2. **Name what the force is measured in.** Requests per second, bytes, keys moved, messages per decision, false positive rate, round trips, time to converge. That quantity goes on a slider, a derived row or a chart's y axis.
3. **Pick the moment the reader sees it fail.** HLD: a simulator preset. LLD: a scenario step from real code. Concept: a chart where the naive line and the real one diverge, or a scenario step where the protocol saves the day (a leader dies, a replica lags).
4. **Pick the sections from what the topic has, not from a template.** A protocol has messages (`sequence`) and states (`states`). A data structure has operations to run (`scenario`, `code`) and a curve (`chart`). A system has load (`estimation`, `arch`). Any page may use any section.
5. **If the topic has no numbers at all** (an auth flow, a consistency model), the interactive part is the state machine, the stepped sequence, and a scenario where the reader sees the wrong order of events. Still run real code to produce it.
6. **If the topic is a real product** (Kafka, DynamoDB, Spanner), explain the design idea that makes it work, cite where the claims come from in a `text` section, and model that idea. Do not invent product internals or numbers.

Every page, whatever the topic, needs at least one thing the reader can move that changes a number they care about.

## The kit

`kit/runtime.js` renders the page from the spec JSON; `kit/style.css` styles it. No dependencies. Edit them only to add a capability, never per topic.

| Section type | Use it for |
|---|---|
| `requirements`, `text`, `qa`, `patterns` | Prose. Keep each item to a sentence or two. |
| `estimation` | Sliders (`inputs`) and live derived `rows`. Expressions are strings starting `=`, reading `p.id` (inputs) and `r.id` (earlier rows). |
| `api`, `data` | Endpoints and tables, each with a reason. |
| `arch` | The flow simulator. Nodes with capacity, edges with shares, controls, presets, metrics. |
| `chart` | A quantity as a curve: an expression of `x`, or data recorded by running real code. With `x.param` it follows a slider and marks the current value. Each point can rerun the simulator (latency against load). |
| `tradeoffs`, `failures` | Decisions with a chosen option, and failures that can inject themselves into the simulator. |
| `classes`, `sequence`, `states` | LLD and concept diagrams. The state machine runs its own transition table. |
| `scenario`, `code` | Steps recorded by running the real implementation, and the same source shown beside it. |

Expressions read `p` (sliders), `r` (rows), `m` (the simulation result) and, in a chart, `x`. Helpers: `min max ceil floor round log log2 log10 pow sqrt abs clamp` and `zipf(items, total, s)`, the hit ratio of an ideal cache over Zipf-distributed popularity.

## Craft rules

- **One idea per page.** Everything on it serves the `idea`. Cut sections that do not.
- **Numbers carry units and a reason.** Each estimation row says what it is for in its `why`.
- **Every node justifies itself.** Fill `role`, `why`, `scale` and `fails` on each node. The click-through panel is the explanation, so an empty one is a defect.
- **Presets are experiments.** Each preset's `note` states what the reader should watch. The check script must confirm that the numbers actually do that. If a preset's note says latency climbs and it does not, fix the model or the note.
- **Presets are absolute.** A preset applies on top of the page defaults, so the defaults must be a healthy system (low error rate, utilisation under about 75%, latency under budget).
- **Show the failure that does not page anyone.** Silent staleness, lag and wrong answers teach more than outages.
- **Choose, do not survey.** Each tradeoff has a `pick` and a reason. A table of pros and cons with no decision is a Wikipedia page.
- **Plain writing.** Short sentences. No buzzwords, no em dashes, no "robust", "seamless", "leverage". Name real technologies only where the choice matters, and say why.
- **Honest scope.** Say what the model leaves out. The simulator is a fluid model with M/M/1-shaped latency. It shows where saturation starts and which tier goes first, not exact production numbers.

## Limits

The simulator is a steady-state fluid model. It does not model queueing transients, retries, tail latency distributions, or correlated failures. Say so when a topic depends on them (for example retry storms) and explain that part in text. The page needs a browser; it cannot be a PDF.

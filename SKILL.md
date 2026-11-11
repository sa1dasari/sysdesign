---
name: sysdesign
description: Explain any system design or distributed-systems topic as a live, interactive page. Use when someone asks to understand, learn, or prepare for the design of a system (news feed, Netflix recommendations, cache, chat, URL shortener, ride matching, payments, video streaming), an object model (parking lot, elevator, LRU cache, vending machine), or how a mechanism works (consistent hashing, Raft, Bloom filters, LSM trees, rate limiting algorithms, CAP, OAuth), including interview prep. Builds one self-contained HTML page and opens it in the browser - an architecture diagram with step-by-step walkthroughs of how requests and events move, changes the reader can try and watch the effect of, live charts, and for object models and algorithms a class diagram, sequence diagram, state machine and a scenario run from real code.
license: MIT
compatibility: Needs Node.js 20.10+. Chrome or Chromium is used for the checks.
---

# sysdesign

Turn a system design topic into a page the reader can poke. The reader should finish able to explain how the system works and why it is shaped that way, because they walked through it step by step and then changed something and watched what happened.

## Who is reading

**Assume a learner**, unless the user says they are preparing for an interview or asks for depth. A learner wants to know what the parts are, how a request moves through them, and why each part exists. Capacity math comes after that, not before.

- **Big picture first.** Open with a `text` section of three short paragraphs: what the system does for the user, the one idea that shapes it, and (for a real product) the source.
- **The architecture is the centrepiece.** Group boxes into labelled lanes (`groups`), and give it 2 to 4 walkthroughs (`flows`) that light up the path step by step, one plain sentence per step: "You open the app", "You finish an episode", "Every night". This is how the reader learns how it works.
- **Changes the reader can try are named for what a user would notice**, not for tiers: "Turn off nearline", "Big premiere night". Each note says what to watch. Add custom `metrics` in user terms ("New activity shows up: next day") alongside latency and errors.
- **Plain words.** Define every term the first time it appears ("EVCache, an in-memory cache"). No unexplained acronyms. Short sentences.
- **Numbers go late.** Put `estimation` near the end as "Go deeper", unless the topic is about scale itself.

See `examples/netflix-recommendations/` for this style.

## Be quick: aim for under 5 minutes

The tools take seconds. The time goes into research, reading, writing and rework, so budget those:

1. **Research only what you do not know.** For a well-known topic, write from knowledge. For a real product, fetch the source the user gave, or at most two searches. Do not browse further.
2. **Read little.** This file, `references/spec-format.md` (every field, one page), and the one reference for the main view (`hld.md`, `lld.md` or `concept.md`). Do not read the example specs or the kit source unless something fails.
3. **Write the spec once, at the right size.** 6 to 8 sections. A learner page does not need `api` or `data` unless they are the point. Write a reference implementation only when the page has an object or mechanism view.
4. **One command builds, checks and opens it:** `node <skill dir>/scripts/make.mjs <spec>`. Fix only `FAIL` lines and presets whose numbers contradict their note. At most two fix rounds.
5. **Screenshots are optional.** Take them (`--shots dir`) only if the check reports a layout problem, and then look at the one section it names.

## Workflow

1. **Decide which views the topic needs.** Any topic can be explained. Do not pick one label and squeeze the topic into it. Ask three questions and answer each from the topic itself:
   - **Does it run on many machines or face load?** Then it needs the **system view** (HLD): `arch` with walkthroughs, plus `estimation`, and `api` and `data` when they matter.
   - **Is there code with state and behaviour worth designing?** A class whose state changes, policies that must be swappable, a lifecycle. Then it needs the **object view** (LLD): `classes`, `sequence`, `states`, `scenario`, `code`, `patterns`.
   - **Is there a mechanism whose behaviour is the point?** An algorithm, data structure or protocol, where the insight is a curve or an order of messages. Then it needs the **mechanism view** (concept): `chart`, `sequence`, `states`, `scenario`, `code`.

   Include every view that gets a yes, on one page. Set `kind` to the views the page covers, main one first: `"hld"`, or `["hld", "lld"]`. Drop a view if it would only repeat another. An explicit `--hld`, `--lld` or `--concept` means that view leads. In the reply, say in one line which views the page covers.
2. **Find the force.** Name the one constraint that shapes the design: write amplification (feed), how fresh results must be (recommendations), hot keys (cache), a policy that must change independently (parking lot). The page's `idea` is one sentence about it, in plain words. The tables in `references/` are worked examples, not a list of what is supported. For anything else, use "Any topic" below.
3. **Write the spec** to `./sysdesign/<topic-slug>/spec.mjs` in the user's working directory (and the reference implementation beside it, if any). Follow `references/spec-format.md` for fields and the section order for the main view. For a page with several views, use the combined order below.
4. **Build, check and open:** `node <skill dir>/scripts/make.mjs ./sysdesign/<topic-slug>/spec.mjs`. It validates the spec, writes `index.html` next to it, checks it in headless Chrome (every preset's numbers, every walkthrough step, charts, layout), and opens it in the default browser. Compare each preset's numbers with its note. Read `references/verify.md` only if something fails.
5. **Deliver.** Give the path to `index.html`, a one-line summary, and the walkthrough to start with. The page is already open in the browser; if `make.mjs` printed that there is no display, tell the user to open the file.

**Combined order** for a page with several views: the big picture or requirements, then the system (`arch`, `estimation`, `api`, `data`), then the mechanism (`chart`, `scenario`), then the objects (`classes`, `sequence`, `states`, `code`), then `tradeoffs`, `failures` and `qa` covering all of it. Keep one `idea` for the whole page. See `examples/rate-limiter/`.

**Size.** If the user names something huge ("design YouTube"), pick the one subsystem that carries the idea (upload and transcode, or the read path), say so, and offer the rest as follow-up pages.

## Any topic

For a topic not in the tables, work it out in this order. Do not refuse a topic or force it into the wrong view.

1. **Ask what goes wrong with the obvious design.** Every design exists because the first idea fails: computing everything live is too slow, `hash mod N` reshuffles everything, one database runs out of writes. That failure is the force.
2. **Name what the force is measured in.** Latency, freshness, keys moved, false positive rate, requests per second. That goes in a metric, a slider or a chart.
3. **Pick the moment the reader sees it fail.** HLD: a change to try. LLD: a scenario step from real code. Concept: a chart where the naive line and the real one diverge.
4. **Pick the sections from what the topic has, not from a template.** A system has parts and paths (`arch` with `flows`). A protocol has messages (`sequence`) and states (`states`). A data structure has operations to run (`scenario`, `code`) and a curve (`chart`). Any page may use any section.
5. **If the topic has no numbers** (an auth flow, a consistency model), the interactive part is the walkthrough, the state machine and the stepped sequence.
6. **If the topic is a real product** (Netflix, Kafka, DynamoDB), follow its own published description, link it in the big-picture text, use its component names, and say that capacities are illustrative. Do not invent internals or real-world numbers.

## The kit

`kit/runtime.js` renders the page from the spec; `kit/style.css` styles it. No dependencies. Edit them only to add a capability, never per topic. All fields are in `references/spec-format.md`.

| Section type | Use it for |
|---|---|
| `text`, `requirements`, `patterns`, `qa` | Prose. Keep each item to a sentence or two. `**bold**`, `` `code` `` and `[links](https://...)` work. |
| `arch` | The architecture. Boxes in labelled lanes (`groups`), walkthroughs that light up each step (`flows`), changes to try (`presets`), sliders (`controls`), and `metrics`. Load, latency and errors are simulated. |
| `estimation` | Sliders (`inputs`) and live derived `rows`. |
| `api`, `data` | Endpoints and tables, each with a reason. |
| `chart` | A quantity as a curve: an expression of `x`, or data recorded by running real code. |
| `tradeoffs`, `failures` | Decisions with a chosen option, and failures that can inject themselves into the architecture. |
| `classes`, `sequence`, `states` | Object and protocol diagrams. The state machine runs its own transition table. |
| `scenario`, `code` | Steps recorded by running the real implementation, and the same source shown beside it. |

## Craft rules

- **One idea per page.** Everything on it serves the `idea`. Cut sections that do not.
- **Truth first.** Every number on the page comes from the spec's model. A number typed into prose drifts out of agreement. Write the model, then quote it.
- **Every box explains itself.** Fill `role`, `why`, `scale` and `fails` on each node. The click-through panel is the explanation.
- **Every walkthrough step lights up something and says one thing.** `path` is the boxes involved, in order; `text` is one or two plain sentences.
- **Changes to try are experiments.** Each preset's `note` states what to watch, and the check output must show it. If the note says pages slow down and they do not, fix the model or the note.
- **The default state is healthy**: no errors, nothing over about 75% busy, latency under budget. Presets apply on top of it.
- **Show the failure that does not page anyone.** Stale results, lag and wrong answers teach more than outages.
- **Choose, do not survey.** Each tradeoff has a `pick` and a reason.
- **Plain writing.** Short sentences. No buzzwords, no em dashes, no "robust", "seamless", "leverage".
- **Honest scope.** The simulator is a fluid model with M/M/1-shaped latency. It shows which part saturates first and what users feel, not exact production numbers. Say so where it matters.

## Limits

The simulator is a steady-state fluid model. It does not model queueing transients, retries, tail latency distributions, or correlated failures. Explain those in text when a topic depends on them. The page needs a browser; it cannot be a PDF.

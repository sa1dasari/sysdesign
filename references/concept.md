# Concept pages

For how one mechanism works: an algorithm, a data structure or a protocol. Use `kind: "concept"`. See `examples/consistent-hashing/`.

Section order. Cut a section only if it truly has nothing to say.

1. **text** "The problem": the obvious design, the moment it fails, and the one-paragraph fix. Three short paragraphs.
2. **estimation**: sliders for the inputs the force depends on, and rows that put the naive number next to the real one.
3. **chart**: the force as a curve. The naive line and the real line on one chart, so the reader sees them diverge. Tie `x.param` to a slider so the marker shows "you are here". A second chart is fine if it shows a second property (cost against a tuning knob).
4. **sequence** and/or **states**: for protocols. Who sends what, and the states a node moves through. The reader steps through it or fires events.
5. **scenario**: steps recorded by running the reference implementation. Include the step where the mechanism earns its keep (a node dies, a key moves, a replica lags) and the step where it does not help (its weak point).
6. **code**: the exact file the scenario ran.
7. **tradeoffs**: the tuning knob (how many virtual nodes, how many hash functions, what quorum) and the alternative mechanisms. Each with a `pick`.
8. **failures**: what still goes wrong. Include one that is silent.
9. **qa**: what an interviewer asks next.

## Rules

- **Measure, do not assert.** If the page says "about 1/N of keys move", a chart series computed by running the code must show it. Use closed-form expressions for the ideal line and recorded `y` data for what the code does.
- **Put the naive line next to the real one.** `mod N` next to the ring. One lock next to striped locks. A single counter next to a sharded one.
- **One unit per chart, at most four series.** Two quantities with different units are two charts.
- **Prose must match the measured numbers.** Write the note after looking at the chart, and quote the chart's numbers.
- **Topics with no numbers** (an auth flow, a consistency model) still get real code: a small simulation of the participants, run to produce the scenario, plus `states` and `sequence`. The moment to show is the wrong order of events: a stale read, a replayed token, a split brain.

## Topic patterns

| Topic | The force | What the reader moves or watches |
|---|---|---|
| Consistent hashing | Keys that move when N changes | Chart: keys moved against servers, mod N vs ring. Chart: imbalance against virtual nodes |
| Bloom filter | False positives against bits per item | Chart: false positive rate against bits per item for k = 1..4, live from `(1-exp(-k*n/m))^k`. Scenario: insert, lookup, a false positive |
| LSM tree vs B-tree | Write amplification vs read amplification | Chart: write amplification against size ratio. Scenario: flush, compaction, a read that checks every level |
| Raft (leader election, log replication) | Agreeing with a majority while nodes fail | States: follower, candidate, leader. Scenario: leader dies, election, a stale leader's write rejected |
| Two-phase commit | A coordinator that crashes after prepare | Sequence of prepare and commit. Scenario: crash between the phases leaves participants blocked |
| Quorums, R + W > N | Reading your own write with replicas | Sliders N, R, W. Chart: chance a read sees the latest write. Scenario: R + W <= N returns stale data |
| Token bucket and leaky bucket | Allowing bursts while capping the rate | Chart: requests allowed over time for a bursty input, recorded from the code. Sliders rate and burst |
| Vector clocks and CRDTs | Merging concurrent writes without a coordinator | Scenario: two replicas edit offline, merge. Show the conflict last-writer-wins loses |
| MVCC | Readers that never block writers | Scenario: a long read sees a snapshot while writes commit. Failure: version bloat |
| Gossip | Spreading state in log(N) rounds | Chart: share of nodes informed against rounds, for several fan-outs |
| OAuth 2 / TLS handshake | Proving identity without sharing the secret | Sequence, states, and a scenario where a missing check (state parameter, certificate name) lets an attacker in |

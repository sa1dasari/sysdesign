# LLD pages

Section order:

1. **requirements**: functional, non-functional (extension points, concurrency), out of scope.
2. **classes**: 6 to 9 classes with fields, methods and a `role` each (the click-through text). Relations: `has` (composition), `uses`, `implements`, `inherits`. Place with `at: [col, row]`. Keep arrows from crossing boxes.
3. **sequence**: the main flow, 5 to 8 messages, each with a `note` saying why it exists. Mark returns `ret: true`.
4. **states**: only if some object has a real lifecycle (spot, order, elevator). The reader fires events, and the machine allows only listed transitions. Use `bend` (negative bends upward) for a transition that would cross a box.
5. **scenario**: steps recorded from the reference implementation. 6 to 10 steps. Include a failure path and one step where the design's weak point shows.
6. **code**: the exact file the scenario ran.
7. **patterns**: each pattern with where it appears and why. Include one "not used" entry (inheritance you declined) because it shows judgment.
8. **qa**: concurrency, extension ("add EV spots"), and scale.

## Rules

- Start with the entities and the single class that holds changing state. Everything else is a value or a policy.
- Anything likely to change independently (pricing, allocation, matching rule) goes behind an interface. Say which change it protects against.
- Do not draw a class unless it has behaviour or a reason to exist. A type tag does not need a subclass.
- Every class gets a `role` sentence. The validator enforces it.
- Concurrency gets its own answer in `qa`: name the window (check then act), and the fix (lock, compare-and-set, single writer).

// LLD example: a parking lot.
// The scenario below is produced by running lot.mjs, and the code tab shows lot.mjs itself.
import { readFileSync } from "node:fs";
import { Vehicle, makeLot } from "./lot.mjs";

const here = new URL(".", import.meta.url);
const source = readFileSync(new URL("lot.mjs", here), "utf8");

// ----- run the real code and record each step -----
const lot = makeLot();
const steps = [];
const tickets = {};
function run(title, call, fn, note) {
  let result;
  try { result = fn(); } catch (e) { result = `${e.constructor.name}: ${e.message}`; }
  steps.push({ title, call, result: String(result), note, state: lot.snapshot() });
}
const H = 3600;
steps.push({ title: "Empty lot", call: "makeLot()", note: "Two small, two medium and one large spot, one level.", state: lot.snapshot() });
run("Motorcycle arrives", 'park(motorcycle "MC-1", t=0)', () => (tickets.a = lot.park(new Vehicle("MC-1", "motorcycle"), 0)).spotId, "The allocator picks the smallest spot that fits, so the motorcycle takes a small one and leaves bigger spots for bigger vehicles.");
run("Car arrives", 'park(car "CAR-1", t=60)', () => (tickets.b = lot.park(new Vehicle("CAR-1", "car"), 60)).spotId);
run("Second car", 'park(car "CAR-2", t=120)', () => (tickets.c = lot.park(new Vehicle("CAR-2", "car"), 120)).spotId);
run("Third car", 'park(car "CAR-3", t=180)', () => (tickets.d = lot.park(new Vehicle("CAR-3", "car"), 180)).spotId, "Medium spots are gone, so the car takes the large spot. Legal, but it is the design's weak point.");
run("Truck arrives", 'park(truck "TRK-1", t=240)', () => lot.park(new Vehicle("TRK-1", "truck"), 240).spotId, "A free small spot exists, but a truck fits only in a large one. The lot is full for trucks while three spots sit idle.");
run("Third car leaves", `unpark(ticket ${tickets.d.id}, t=${2 * H + 600})`, () => `fee = ${lot.unpark(tickets.d.id, 2 * H + 600)}`, "2h10m rounds up to 3 hours at 4 per hour for a large spot.");
run("Truck retries", 'park(truck "TRK-1", t=7900)', () => lot.park(new Vehicle("TRK-1", "truck"), 7900).spotId);
run("Same car twice", 'park(car "CAR-1", t=8000)', () => lot.park(new Vehicle("CAR-1", "car"), 8000).spotId, "A plate that already holds a ticket is rejected before any spot is touched.");

export default {
  kind: "lld",
  title: "Parking lot",
  subtitle: "Which spot does a vehicle get, what does the stay cost, and how do you keep the design open to change.",
  idea: "Keep the lot's bookkeeping dull and push every policy question, which spot and what price, behind a small interface so each can change on its own.",
  sections: [
    {
      type: "text",
      title: "The big picture",
      body: [
        "This is a **low-level design** question: not how to run a service on many machines, but how to shape the code inside one program so it stays easy to change.",
        "A parking lot does three things: it gives each arriving vehicle a spot that fits, it charges a fee when the vehicle leaves, and it knows when it is full. The bookkeeping (which spot holds which car) rarely changes. The rules (which spot to choose, what to charge) change all the time.",
        "So the design keeps the bookkeeping in one plain class and puts each rule behind a small **interface**, a promise of what a piece of code does without saying how. A new pricing rule becomes a new class instead of an edit to the lot. Step through the scenario below: it was produced by running the real code shown on this page.",
      ],
    },
    {
      type: "requirements",
      title: "What we are building",
      functional: ["Vehicles of three types (motorcycle, car, truck) enter and receive a ticket.", "Each vehicle is assigned a free spot it fits in.", "On exit the ticket is turned into a fee based on time and spot size.", "The lot knows when it is full for a given vehicle type."],
      nonfunctional: ["Adding a pricing rule or allocation rule must not change ParkingLot.", "Two gates must never assign the same spot.", "All state needed to price a stay is on the ticket."],
      outOfScope: ["Payment processing", "Reservations", "Multi-lot routing"],
    },
    {
      type: "classes",
      title: "Classes and relationships",
      lede: "Click a class for its role.",
      hint: "Click a class for its role. The two strategy interfaces are where the design bends.",
      classes: [
        { name: "ParkingLot", at: [1, 0], fields: ["spots: Spot[]", "tickets: Map<id, Ticket>", "allocator: AllocationStrategy", "pricing: PricingStrategy"], methods: ["park(vehicle, now): Ticket", "unpark(ticketId, now): fee"], role: "The only class with state that changes. It coordinates and decides nothing about policy: it asks the allocator for a spot and the pricing strategy for a fee." },
        { name: "Spot", at: [0, 0], fields: ["id", "size: S | M | L", "level", "plate: string | null"], methods: ["free: boolean"], role: "One physical space. Knows its size and who is in it." },
        { name: "Ticket", at: [2, 0], fields: ["id", "plate", "spotId", "entry: seconds"], methods: [], role: "A receipt that carries everything needed to price the stay later, so pricing never has to look anything up." },
        { name: "Vehicle", at: [0, 1], fields: ["plate", "type"], methods: [], role: "Input to the lot. Only its type matters for fitting." },
        { name: "AllocationStrategy", at: [1, 1], stereotype: "interface", fields: [], methods: ["pick(spots, vehicle): Spot | null"], role: "Policy: which free spot. Swap it to prefer low levels, spread wear, or keep large spots free." },
        { name: "SmallestFit", at: [1, 2], fields: [], methods: ["pick(spots, vehicle)"], role: "The default: the smallest free spot that fits, nearest level first." },
        { name: "PricingStrategy", at: [2, 1], stereotype: "interface", fields: [], methods: ["charge(ticket, spot, exit): fee"], role: "Policy: what a stay costs. Hourly today; flat, tiered or surge tomorrow." },
        { name: "HourlyPricing", at: [2, 2], fields: ["rate: size -> per hour"], methods: ["charge(ticket, spot, exit)"], role: "Rounds the stay up to whole hours, minimum one, times the rate for the spot size." },
      ],
      relations: [
        { from: "ParkingLot", to: "Spot", type: "has", label: "1..*" },
        { from: "ParkingLot", to: "Ticket", type: "has", label: "0..*" },
        { from: "ParkingLot", to: "AllocationStrategy", type: "uses" },
        { from: "ParkingLot", to: "PricingStrategy", type: "uses" },
        { from: "SmallestFit", to: "AllocationStrategy", type: "implements" },
        { from: "HourlyPricing", to: "PricingStrategy", type: "implements" },
        { from: "Vehicle", to: "AllocationStrategy", type: "uses" },
      ],
    },
    {
      type: "sequence",
      title: "Parking a vehicle",
      hint: "Press play. Each step shows what that message is for.",
      actors: ["Gate", "ParkingLot", "Allocator", "Spot"],
      messages: [
        { from: "Gate", to: "ParkingLot", text: "park(vehicle, now)", note: "A gate hands over the vehicle and the current time." },
        { from: "ParkingLot", to: "ParkingLot", text: "reject duplicate plate", note: "Fail fast: a plate that already has a ticket cannot park again." },
        { from: "ParkingLot", to: "Allocator", text: "pick(spots, vehicle)", note: "Policy lives here. The lot does not know how a spot is chosen." },
        { from: "Allocator", to: "ParkingLot", text: "spot or null", ret: true, note: "Null means nothing fits. The lot raises LotFull." },
        { from: "ParkingLot", to: "Spot", text: "occupy(plate)", note: "This write is the one that must be atomic if two gates run at once (see the concurrency answer below)." },
        { from: "ParkingLot", to: "Gate", text: "Ticket", ret: true, note: "The ticket carries the entry time. Pricing later needs nothing else." },
      ],
    },
    {
      type: "states",
      title: "Life of a spot",
      lede: "Fire events. The machine only allows the transitions in its table, the same table the code enforces.",
      initial: "free",
      states: [
        { id: "free", label: "Free", at: [1, 0], note: "Available to the allocator." },
        { id: "occupied", label: "Occupied", at: [2, 0], note: "A ticket points at this spot." },
        { id: "reserved", label: "Reserved", at: [0, 0], note: "Held for a booking (an extension, not built here)." },
        { id: "oos", label: "Out of service", at: [1, 1], note: "Skipped by every allocator." },
      ],
      transitions: [
        { from: "free", to: "occupied", event: "park", note: "ticket issued" },
        { from: "occupied", to: "free", event: "unpark", note: "fee charged, ticket closed" },
        { from: "free", to: "oos", event: "close" },
        { from: "oos", to: "free", event: "reopen" },
        { from: "free", to: "reserved", event: "reserve" },
        { from: "reserved", to: "occupied", event: "arrive", bend: -62 },
        { from: "reserved", to: "free", event: "expire" },
      ],
    },
    {
      type: "scenario",
      title: "Run it",
      lede: "These steps were produced by running the reference implementation. Changed values are highlighted.",
      steps,
    },
    {
      type: "code",
      title: "The code",
      lede: "This is the exact file that produced the scenario above.",
      files: [{ name: "lot.mjs", src: source }],
    },
    {
      type: "patterns",
      title: "Patterns used, and why",
      items: [
        { name: "Strategy (allocation)", where: "`AllocationStrategy` and `SmallestFit`.", why: "Spot choice is the part most likely to change. Behind an interface, a new rule is a new class, not an edit to ParkingLot." },
        { name: "Strategy (pricing)", where: "`PricingStrategy` and `HourlyPricing`.", why: "Same reasoning, and prices change for business reasons far more often than the lot changes." },
        { name: "Value object", where: "`Ticket`.", why: "It carries the entry time and spot, so charging a fee needs no second lookup and cannot disagree with what was recorded." },
        { name: "Not used: inheritance for vehicles", where: "`Vehicle` is one class with a type field.", why: "The three types differ only in which sizes they fit. A class hierarchy would add structure with no behaviour to put in it." },
      ],
    },
    {
      type: "qa",
      title: "What an interviewer asks next",
      items: [
        { q: "How do you make park() safe with two gates?", a: ["The dangerous window is between picking a spot and marking it taken. Make that one atomic step: a lock around the allocation, or a compare-and-set on the spot (set plate only if it is still empty) with a retry on failure. A per-spot lock scales better than one lock on the whole lot, but then `pick` must tolerate a spot being taken underneath it."] },
        { q: "The scenario shows a car taking the last large spot. Is that a bug?", a: ["It is a policy question, which is why it lives in the strategy. A stricter allocator could refuse to place cars in large spots while any truck demand exists, or keep a reserve count of large spots. The lot class would not change."] },
        { q: "How do you add EV charging spots?", a: ["Add a spot attribute and let the allocator filter on it, or add a new size-like category. If a vehicle needs charging, the allocator looks for spots with a charger first. ParkingLot is unchanged because it never looks inside the choice."] },
        { q: "What if the lot has thousands of spots?", a: ["Scanning every spot on each arrival is linear. Keep a free list per size, ordered by level, and pick from the front. The strategy interface stays the same; only SmallestFit's internals change."] },
      ],
    },
  ],
};

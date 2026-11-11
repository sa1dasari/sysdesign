// Reference implementation. The page runs this file to produce its scenario steps,
// and shows this same file in the code tab, so what you read is what ran.

const FITS = { motorcycle: ["S", "M", "L"], car: ["M", "L"], truck: ["L"] };
const RANK = { S: 0, M: 1, L: 2 };

export class LotFull extends Error {}
export class UnknownTicket extends Error {}

export class Vehicle {
  constructor(plate, type) { this.plate = plate; this.type = type; }
}

export class Spot {
  constructor(id, size, level) { this.id = id; this.size = size; this.level = level; this.plate = null; }
  get free() { return this.plate === null; }
}

export class Ticket {
  constructor(id, plate, spotId, entry) { this.id = id; this.plate = plate; this.spotId = spotId; this.entry = entry; }
}

// Strategy: which free spot does a vehicle get?
export class SmallestFit {
  pick(spots, vehicle) {
    return spots
      .filter((s) => s.free && FITS[vehicle.type].includes(s.size))
      .sort((a, b) => RANK[a.size] - RANK[b.size] || a.level - b.level || a.id.localeCompare(b.id))[0] ?? null;
  }
}

// Strategy: what does a stay cost?
export class HourlyPricing {
  constructor(ratePerHour) { this.rate = ratePerHour; }
  charge(ticket, spot, exitSec) {
    const hours = Math.max(1, Math.ceil((exitSec - ticket.entry) / 3600));
    return hours * this.rate[spot.size];
  }
}

export class ParkingLot {
  constructor(spots, allocator, pricing) {
    this.spots = spots; this.allocator = allocator; this.pricing = pricing;
    this.tickets = new Map(); this.nextId = 1;
  }
  park(vehicle, nowSec) {
    for (const t of this.tickets.values()) if (t.plate === vehicle.plate) throw new Error(`${vehicle.plate} is already parked`);
    const spot = this.allocator.pick(this.spots, vehicle);
    if (!spot) throw new LotFull(`no free spot for a ${vehicle.type}`);
    spot.plate = vehicle.plate;
    const ticket = new Ticket(this.nextId++, vehicle.plate, spot.id, nowSec);
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }
  unpark(ticketId, nowSec) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new UnknownTicket(`ticket ${ticketId}`);
    const spot = this.spots.find((s) => s.id === ticket.spotId);
    const fee = this.pricing.charge(ticket, spot, nowSec);
    spot.plate = null;
    this.tickets.delete(ticketId);
    return fee;
  }
  snapshot() {
    const out = {};
    for (const s of this.spots) out[`${s.id} (${s.size})`] = s.plate ?? "free";
    out["open tickets"] = this.tickets.size;
    return out;
  }
}

export function makeLot() {
  const spots = [
    new Spot("S1", "S", 1), new Spot("S2", "S", 1),
    new Spot("M1", "M", 1), new Spot("M2", "M", 1),
    new Spot("L1", "L", 1),
  ];
  return new ParkingLot(spots, new SmallestFit(), new HourlyPricing({ S: 1, M: 2, L: 4 }));
}

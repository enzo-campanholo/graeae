// The events a tab has recorded and not yet handed over (ticket 48). It holds at most a
// fixed number, dropping the oldest and counting the drops, so a long outage cannot grow
// it without end. A batch taken from it is the taker's until it is confirmed delivered,
// or put back at the front when its way out failed: a batch sent on a socket that then
// turned out dead comes back with the next one. Each way out confirms or puts back only
// its own batches. Pure, so it is tested on its own.

export interface Batch<T> {
  events: T[];
  /** How many events were dropped, the oldest first, since the last batch. */
  dropped: number;
}

export class LogBuffer<T> {
  private events: T[] = [];
  private dropped = 0;

  constructor(private readonly cap: number) {}

  /** How many events wait to be taken. */
  get size(): number {
    return this.events.length;
  }

  add(event: T) {
    this.events.push(event);
    this.trim();
  }

  /**
   * Takes up to `max` events, the oldest first, with the count of drops since the last
   * batch. Null when there is nothing to say.
   */
  take(max: number): Batch<T> | null {
    if (this.events.length === 0 && this.dropped === 0) return null;
    const batch = { events: this.events.splice(0, max), dropped: this.dropped };
    this.dropped = 0;
    return batch;
  }

  /**
   * `batches`, taken earlier and given in the order they were taken, did not arrive:
   * their events go back to the front, oldest first, before anything recorded since.
   */
  putBack(...batches: Batch<T>[]) {
    this.events = [...batches.flatMap((batch) => batch.events), ...this.events];
    this.dropped += batches.reduce((sum, batch) => sum + batch.dropped, 0);
    this.trim();
  }

  private trim() {
    const over = this.events.length - this.cap;
    if (over <= 0) return;
    this.events.splice(0, over);
    this.dropped += over;
  }
}

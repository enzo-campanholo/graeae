// Hand-overs under way: each new share's id, with the id of the share it replaces. Kept
// in the instance's key-value storage beside the share records, like retries: there are
// few, and briefly, and they outlast a restart. A mark goes once either share's record
// is dropped.

/** Where the hand-overs are kept. */
const HAND_OVERS_KEY = "shares:hand-overs";

export class HandOvers {
  constructor(
    private readonly sql: SqlStorage,
    private readonly kv: SyncKvStorage,
  ) {}

  /** Every hand-over under way: the old share's id by the new one's. */
  all(): Record<string, string> {
    return this.kv.get<Record<string, string>>(HAND_OVERS_KEY) ?? {};
  }

  /** Marks the new share `by` as replacing the share `old`. */
  mark(by: string, old: string) {
    this.save({ ...this.all(), [by]: old });
  }

  /** The id of the share replacing the share `old`, or undefined when none is. */
  replacing(old: string): string | undefined {
    return Object.entries(this.all()).find(([, replaced]) => replaced === old)?.[0];
  }

  /** The ids of the shares a hand-over has replaced with a share that is live. */
  replaced(): Set<string> {
    const handOvers = Object.entries(this.all());
    if (handOvers.length === 0) return new Set();
    const live = new Set(
      this.sql
        .exec<{ id: string }>(
          `SELECT id FROM share WHERE live_at IS NOT NULL AND id IN (${handOvers.map(() => "?").join(", ")})`,
          ...handOvers.map(([id]) => id),
        )
        .toArray()
        .map((row) => row.id),
    );
    return new Set(handOvers.filter(([id]) => live.has(id)).map(([, old]) => old));
  }

  /** Forgets every hand-over the share `id` is part of, as the new share or the old. */
  forget(id: string) {
    const handOvers = this.all();
    const left = Object.entries(handOvers).filter(([by, old]) => by !== id && old !== id);
    if (left.length !== Object.keys(handOvers).length) this.save(Object.fromEntries(left));
  }

  private save(handOvers: Record<string, string>) {
    if (Object.keys(handOvers).length > 0) this.kv.put(HAND_OVERS_KEY, handOvers);
    else this.kv.delete(HAND_OVERS_KEY);
  }
}

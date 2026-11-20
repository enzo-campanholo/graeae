// The instance's schema changes: numbered, forward-only SQL files in ./migrations, named
// `NNNN-what-it-does.sql` and numbered 1, 2, 3… with none shared or skipped. The instance
// applies each one once, in order, the first time it starts on code that has it.

export interface Migration {
  number: number;
  name: string;
  sql: string;
}

export const migrations: readonly Migration[] = fromFiles(
  import.meta.glob<string>("./migrations/*.sql", { query: "?raw", import: "default", eager: true }),
);

/** Applies every migration the instance has not yet had, each in its own transaction. Returns the names of those it applied. */
export function applyMigrations(storage: DurableObjectStorage, list: readonly Migration[]): string[] {
  checkNumbering(list);
  const { sql } = storage;
  sql.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    number INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);
  const latest = sql.exec<{ latest: number | null }>("SELECT MAX(number) AS latest FROM _migrations").one().latest ?? 0;
  const applied: string[] = [];
  for (const migration of list) {
    if (migration.number <= latest) continue;
    applied.push(migration.name);
    storage.transactionSync(() => {
      sql.exec(migration.sql);
      sql.exec(
        "INSERT INTO _migrations (number, name, applied_at) VALUES (?, ?, ?)",
        migration.number,
        migration.name,
        Date.now(),
      );
    });
  }
  return applied;
}

/** Throws unless the migrations are numbered 1, 2, 3… in order, with none shared or skipped. */
export function checkNumbering(list: readonly Migration[]) {
  list.forEach((migration, index) => {
    const previous = list[index - 1];
    if (previous && previous.number === migration.number) {
      throw new Error(
        `Migrations "${previous.name}" and "${migration.name}" share number ${migration.number}`,
      );
    }
    if (migration.number !== index + 1) {
      throw new Error(
        `Migrations are out of order: expected number ${index + 1}, found ${migration.number} ("${migration.name}")`,
      );
    }
  });
}

function fromFiles(files: Record<string, string>): Migration[] {
  return Object.entries(files)
    .map(([path, sql]) => {
      const file = path.slice(path.lastIndexOf("/") + 1);
      const named = /^(\d{4})-(.+)\.sql$/.exec(file);
      if (!named) throw new Error(`Migration file "${file}" is not named NNNN-what-it-does.sql`);
      return { number: Number(named[1]), name: named[2] as string, sql };
    })
    .sort((a, b) => a.number - b.number);
}

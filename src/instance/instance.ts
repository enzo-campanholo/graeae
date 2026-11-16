import { DurableObject } from "cloudflare:workers";
import { applyMigrations, migrations, type Migration } from "./migrations.ts";
import { nothingHere } from "./nothing-here.ts";

/** The instance: one Durable Object holding all of its state (ADR 0002). */
export class Instance extends DurableObject<Env> {
  /** The migrations this code ships with. The test harness swaps them to start on an older schema. */
  static migrations: readonly Migration[] = migrations;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Nothing reaches the instance until its storage is on this code's schema.
    void ctx.blockConcurrencyWhile(async () => applyMigrations(ctx.storage, Instance.migrations));
  }

  override async fetch(request: Request): Promise<Response> {
    return nothingHere(this.env.ASSETS, request);
  }
}

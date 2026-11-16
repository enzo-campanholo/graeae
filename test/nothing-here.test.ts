import { describe, expect, it } from "vitest";
import { startInstance } from "./harness.ts";

describe("nothing here", () => {
  it("answers every address, pages and API alike, with the same page", async () => {
    const instance = await startInstance();

    const answers = await Promise.all([
      instance.fetch("/"),
      instance.fetch("/setup"),
      instance.fetch("/r/a-room-that-does-not-exist"),
      instance.fetch("/invite/not-a-real-invite"),
      instance.fetch("/api/rooms"),
      instance.fetch("/api/invites", { method: "POST", body: "{}" }),
      instance.fetch("/assets/not-a-built-file.js"),
      instance.fetch("/assets/not-a-built-file.js", { headers: { "Sec-Fetch-Mode": "navigate" } }),
      instance.fetch("/a/b/c?d=e"),
    ]);

    const first = await describeAnswer(answers[0]!);
    expect(first.status).toBe(404);
    expect(first.body).toContain('<div id="app"></div>');
    for (const answer of answers.slice(1)) {
      expect(await describeAnswer(answer)).toEqual(first);
    }
  });

  it("refuses a socket with the same page", async () => {
    const instance = await startInstance();
    const page = await describeAnswer(await instance.fetch("/"));

    const { response, socket } = await instance.openSocket("/socket");

    expect(socket).toBeNull();
    expect(await describeAnswer(response)).toEqual(page);
  });

  it("is a page whose own scripts and styles load", async () => {
    const instance = await startInstance();
    const page = await (await instance.fetch("/")).text();

    const files = [...page.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]!);

    expect(files).toEqual(
      expect.arrayContaining([expect.stringMatching(/\.js$/), expect.stringMatching(/\.css$/)]),
    );
    for (const file of files) {
      expect((await instance.fetch(file)).status, file).toBe(200);
    }
  });
});

async function describeAnswer(response: Response) {
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.text(),
  };
}

import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allowed, parseAction, startPanel, type PanelHost } from "./panel.js";

describe("allowed", () => {
  it("takes the panel's own calls only", () => {
    expect(allowed("127.0.0.1:8599", "1", 8599)).toBe(true);
    expect(allowed("localhost:8599", "1", 8599)).toBe(true);
    expect(allowed("127.0.0.1:8599", undefined, 8599)).toBe(false);
    expect(allowed("evil.example:8599", "1", 8599)).toBe(false);
  });
});

describe("parseAction", () => {
  it("accepts the three actions", () => {
    expect(parseAction('{"kind":"recheck","agent":"Ana"}')).toEqual({ kind: "recheck", agent: "Ana" });
    expect(parseAction('{"kind":"answer","agent":"Ana","option":1}')).toEqual({ kind: "answer", agent: "Ana", option: 1 });
    expect(parseAction('{"kind":"rescue","agent":"Ana","rescue":"nudge"}')).toEqual({ kind: "rescue", agent: "Ana", rescue: "nudge" });
  });

  it("refuses anything else", () => {
    for (const body of ["nope", "null", '{"kind":"rescue","agent":"Ana","rescue":"rm"}', '{"kind":"answer","agent":"Ana","option":"1"}', '{"kind":"recheck"}']) {
      expect(parseAction(body)).toBeNull();
    }
  });
});

describe("the server", () => {
  const host: PanelHost = {
    snapshot: () => ({ headline: "All fine", agents: [], sent: [], fleetOk: true, fleetNote: "", checkedAt: 1 }),
    act: vi.fn(async () => ({ ok: true })),
  };
  let close = () => {};
  afterEach(() => close());

  async function serve(): Promise<string> {
    const server = startPanel(host, 0);
    await new Promise((r) => server.once("listening", r));
    close = () => server.close();
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it("serves the page to anyone local", async () => {
    const res = await fetch(await serve());
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>Supervisor</title>");
  });

  it("guards the state behind its header", async () => {
    const base = await serve();
    expect((await fetch(`${base}/state`)).status).toBe(403);
  });
});

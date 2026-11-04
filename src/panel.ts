// The panel: a local page with one light and one sentence per agent, and the
// few buttons that help. It listens on 127.0.0.1 only. Buttons become lines in
// the workspace outbox, which ByteHive types into exactly that agent.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { PANEL_PAGE } from "./panelpage.js";
import type { PanelAction, PanelAgent } from "./panelstate.js";

export const PANEL_PORT = 8599;

export interface PanelSnapshot {
  headline: string;
  agents: PanelAgent[];
  sent: Array<{ at: number; to: string; message: string }>;
  fleetOk: boolean;
  fleetNote: string;
  checkedAt: number;
}

export interface PanelHost {
  snapshot(): PanelSnapshot;
  act(action: PanelAction): Promise<{ ok: boolean; error?: string }>;
}

const MAX_BODY = 2048;

/** A page on another site can't reach here: it can't send this header or Host
 *  without a preflight nothing answers. */
export function allowed(host: string | undefined, marker: string | undefined, port: number): boolean {
  return (host === `127.0.0.1:${port}` || host === `localhost:${port}`) && marker === "1";
}

/** Validate a posted action. Null when it is not one we offer. Pure. */
export function parseAction(body: string): PanelAction | null {
  let v: unknown;
  try {
    v = JSON.parse(body);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.agent !== "string" || !o.agent) return null;
  if (o.kind === "recheck") return { kind: "recheck", agent: o.agent };
  if (o.kind === "sendback") return { kind: "sendback", agent: o.agent };
  if (o.kind === "answer" && typeof o.option === "number" && Number.isInteger(o.option)) {
    return { kind: "answer", agent: o.agent, option: o.option };
  }
  if (o.kind === "rescue" && (o.rescue === "nudge" || o.rescue === "explain")) {
    return { kind: "rescue", agent: o.agent, rescue: o.rescue };
  }
  return null;
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (d: Buffer) => {
      body += d.toString("utf8");
      if (body.length > MAX_BODY) reject(new Error("too large"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export function startPanel(host: PanelHost, port: number = PANEL_PORT): Server {
  const server = createServer((req, res) => {
    void (async () => {
      if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(PANEL_PAGE);
        return;
      }
      const marker = req.headers["x-supervisor"];
      if (!allowed(req.headers.host, Array.isArray(marker) ? marker[0] : marker, port)) {
        json(res, 403, { error: "not from the panel" });
        return;
      }
      if (req.method === "GET" && req.url === "/state") {
        json(res, 200, host.snapshot());
        return;
      }
      if (req.method === "POST" && req.url === "/act") {
        const action = parseAction(await readBody(req));
        if (!action) {
          json(res, 400, { error: "unknown action" });
          return;
        }
        json(res, 200, await host.act(action));
        return;
      }
      json(res, 404, { error: "not found" });
    })().catch(() => json(res, 500, { error: "failed" }));
  });
  server.listen(port, "127.0.0.1");
  return server;
}

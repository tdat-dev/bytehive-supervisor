// Read-only view of a ByteHive workspace board: .bytehive/board.json on disk
// ({ version: 2, lists: [...] }). Never written, only read.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { stateDir } from "./paths.js";

export interface BoardCard {
  id: string;
  title: string;
  desc: string;
  /** Pane name of the agent working this card, when assigned. */
  assignee?: string;
}

export interface BoardList {
  id: string;
  title: string;
  cards: BoardCard[];
}

export interface BoardFile {
  version: number;
  lists: BoardList[];
}

export class BoardFileCorrupt extends Error {}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Parse board.json contents. Throws BoardFileCorrupt on bad JSON/shape. */
export function parseBoardFile(content: string): BoardFile {
  let v: unknown;
  try {
    v = JSON.parse(content);
  } catch {
    throw new BoardFileCorrupt("board.json is not valid JSON");
  }
  if (!v || typeof v !== "object" || !Array.isArray((v as { lists?: unknown }).lists)) {
    throw new BoardFileCorrupt("board.json has no lists array");
  }
  const o = v as { version?: unknown; lists: Array<Record<string, unknown>> };
  return {
    version: typeof o.version === "number" ? o.version : 0,
    lists: o.lists.map((l) => ({
      id: str(l.id),
      title: str(l.title),
      cards: (Array.isArray(l.cards) ? l.cards : []).map((c): BoardCard => {
        const r = (c ?? {}) as Record<string, unknown>;
        const card: BoardCard = { id: str(r.id), title: str(r.title), desc: str(r.desc) };
        if (typeof r.assignee === "string" && r.assignee.trim()) card.assignee = r.assignee;
        return card;
      }),
    })),
  };
}

/** Read the workspace's board.json. Null when the file doesn't exist yet. */
export async function readBoardFile(dir: string): Promise<BoardFile | null> {
  let content: string;
  try {
    content = await readFile(join(stateDir(dir), "board.json"), "utf8");
  } catch (e) {
    if ((e as { code?: string }).code === "ENOENT") return null;
    throw e;
  }
  return parseBoardFile(content);
}

export interface BoardSummary {
  lists: Array<{ title: string; cards: number }>;
  /** Open (not in a Done list) cards per assignee. */
  openByAssignee: Record<string, number>;
}

/** Count cards per list and open cards per agent. Pure. */
export function summarizeBoard(board: BoardFile): BoardSummary {
  const lists = board.lists.map((l) => ({ title: l.title, cards: l.cards.length }));
  const openByAssignee: Record<string, number> = {};
  for (const l of board.lists) {
    if (/done/i.test(l.title)) continue;
    for (const c of l.cards) {
      if (c.assignee) openByAssignee[c.assignee] = (openByAssignee[c.assignee] ?? 0) + 1;
    }
  }
  return { lists, openByAssignee };
}

/** Titles of the open cards assigned to an agent (for its progress summary). */
export function cardsOf(board: BoardFile, agentName: string): string[] {
  const out: string[] = [];
  for (const l of board.lists) {
    if (/done/i.test(l.title)) continue;
    for (const c of l.cards) {
      if (c.assignee === agentName && c.title) out.push(c.title);
    }
  }
  return out;
}

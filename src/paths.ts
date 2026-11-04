// Where a workspace keeps its ByteHive state. Current ByteHive uses .bytehive;
// a folder last opened by a Maestro build still has .maestro, so that one is
// read until the app moves it.

import { existsSync } from "node:fs";
import { join } from "node:path";

export const STATE_DIR = ".bytehive";
export const OLD_STATE_DIR = ".maestro";

/** The state folder of a workspace: .bytehive, or .maestro when only that exists. */
export function stateDir(dir: string, exists: (p: string) => boolean = existsSync): string {
  const current = join(dir, STATE_DIR);
  if (exists(current)) return current;
  const old = join(dir, OLD_STATE_DIR);
  return exists(old) ? old : current;
}

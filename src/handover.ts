// Handover suggestion (days 6-7): who should take over a stuck agent's task.
// Pure suggestion only — the actual handover stays behind ByteHive's manual
// approval, and this module never drives an agent by itself.

export interface HandoverCandidate {
  name: string;
  projectDir: string;
  status: string;
}

export interface HandoverSuggestion {
  from: string;
  to: string;
  reason: string;
  /** Always true: a human clicks before anything moves. */
  needsApproval: true;
}

/** Pick a takeover: an idle agent in the same project first, else any idle
 *  agent; null when nobody is free. */
export function suggestHandover(
  stuckName: string,
  stuckProjectDir: string,
  candidates: HandoverCandidate[],
): HandoverSuggestion | null {
  const free = candidates.filter((c) => c.name !== stuckName && c.status === "idle");
  const same = free.find((c) => c.projectDir === stuckProjectDir);
  const pick = same ?? free[0];
  if (!pick) return null;
  return {
    from: stuckName,
    to: pick.name,
    reason: same
      ? `${pick.name} is idle in the same project`
      : `${pick.name} is idle (different project)`,
    needsApproval: true,
  };
}

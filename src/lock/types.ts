/** Module: core data shapes for a single agent-locks lock file. */

export type LockStatus = 'active' | 'done';

export interface LockFrontmatter {
  /**
   * Canonical id for this lock. By design this is exactly the filename
   * minus its `.md` extension (see README "Timestamp format" for why we
   * chose not to let these drift independently) — e.g. filename
   * `2026-07-17T18-45-12-hindsight-route-tests.md` has
   * `id: 2026-07-17T18-45-12-hindsight-route-tests`.
   */
  id: string;
  /**
   * The calling agent's own id, if it happens to know one from its own
   * context. There is no mechanism for this server to auto-detect it —
   * see README "Honest agent_id / parent_agent_id semantics".
   */
  agent_id: string | null;
  /** The id of whatever spawned the calling agent, if known. Same caveat as agent_id. */
  parent_agent_id: string | null;
  status: LockStatus;
  /** UTC timestamp, same format as timestamp.ts formatTimestamp(). */
  created: string;
  /** UTC timestamp, same format as timestamp.ts formatTimestamp(). Bumped on every mutation. */
  updated: string;
  /** Glob patterns describing which files/paths this lock claims. */
  scope: string[];
}

export interface LockTask {
  text: string;
  done: boolean;
}

/** A lock file fully parsed into structured data (frontmatter + body). */
export interface ParsedLock {
  frontmatter: LockFrontmatter;
  title: string;
  tasks: LockTask[];
  /** Free-text bullet lines under the `## Notes` heading, oldest first. */
  notes: string[];
}

/** A ParsedLock plus where it currently lives on disk. */
export interface LockRecord extends ParsedLock {
  filePath: string;
}

/** The compact shape returned by lock_query — never the full body text. */
export interface LockSummary {
  id: string;
  title: string;
  status: LockStatus;
  percentComplete: number;
  scope: string[];
  agent_id: string | null;
  parent_agent_id: string | null;
}

export function computePercentComplete(tasks: LockTask[]): number {
  if (tasks.length === 0) return 100;
  const done = tasks.filter((t) => t.done).length;
  return Math.round((done / tasks.length) * 100);
}

export function toSummary(record: LockRecord): LockSummary {
  return {
    id: record.frontmatter.id,
    title: record.title,
    status: record.frontmatter.status,
    percentComplete: computePercentComplete(record.tasks),
    scope: record.frontmatter.scope,
    agent_id: record.frontmatter.agent_id,
    parent_agent_id: record.frontmatter.parent_agent_id,
  };
}

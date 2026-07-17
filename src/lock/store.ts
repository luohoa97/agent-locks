/**
 * Module: filesystem-backed CRUD + query operations for lock files.
 *
 * There is no database and no in-memory cache here on purpose (see README
 * "No database, no in-memory state") — every exported function reads
 * whatever is currently on disk at call time, so multiple agents (or
 * multiple server processes) always see each other's latest writes.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { formatTimestamp, slugify } from '../timestamp.js';
import { parseLockFile, serializeLockFile } from './markdown.js';
import { scopesOverlap } from './globOverlap.js';
import { computePercentComplete, toSummary } from './types.js';
import type { LockFrontmatter, LockRecord, LockSummary, LockTask } from './types.js';

const DONE_SUBDIR = 'done';

export class LockNotFoundError extends Error {
  constructor(lockId: string) {
    super(`No lock found with id "${lockId}".`);
    this.name = 'LockNotFoundError';
  }
}

export class TaskNotFoundError extends Error {
  constructor(lockId: string, taskText: string, availableTasks: string[]) {
    super(
      `Lock "${lockId}" has no task with the exact text "${taskText}". ` +
        `Available tasks on this lock: ${
          availableTasks.length > 0 ? availableTasks.map((t) => `"${t}"`).join(', ') : '(none)'
        }. task_text must match an existing task exactly (this tool does not do fuzzy/partial matching).`,
    );
    this.name = 'TaskNotFoundError';
  }
}

export class LockNotActiveError extends Error {
  constructor(lockId: string) {
    super(`Lock "${lockId}" is not active (it may already be finished), so it cannot be finished again.`);
    this.name = 'LockNotActiveError';
  }
}

function activeDir(locksRoot: string): string {
  return locksRoot;
}

function doneDir(locksRoot: string): string {
  return path.join(locksRoot, DONE_SUBDIR);
}

async function ensureDirs(locksRoot: string): Promise<void> {
  await fs.mkdir(doneDir(locksRoot), { recursive: true });
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return entries.filter((name) => name.endsWith('.md')).map((name) => path.join(dir, name));
}

async function readRecord(filePath: string): Promise<LockRecord> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = parseLockFile(raw);
  return { ...parsed, filePath };
}

async function writeRecord(record: LockRecord): Promise<void> {
  const contents = serializeLockFile(record);
  await fs.mkdir(path.dirname(record.filePath), { recursive: true });
  await fs.writeFile(record.filePath, contents, 'utf8');
}

async function readAllRecords(locksRoot: string, status: 'active' | 'done' | 'all'): Promise<LockRecord[]> {
  const dirs: string[] = [];
  if (status === 'active' || status === 'all') dirs.push(activeDir(locksRoot));
  if (status === 'done' || status === 'all') dirs.push(doneDir(locksRoot));

  const files = (await Promise.all(dirs.map(listMarkdownFiles))).flat();
  return Promise.all(files.map(readRecord));
}

/** Finds a lock by id, searching active first, then done. Returns null if not found in either. */
async function findRecordById(locksRoot: string, lockId: string): Promise<LockRecord | null> {
  for (const dir of [activeDir(locksRoot), doneDir(locksRoot)]) {
    const files = await listMarkdownFiles(dir);
    for (const filePath of files) {
      const record = await readRecord(filePath);
      if (record.frontmatter.id === lockId) return record;
    }
  }
  return null;
}

async function uniqueFilePath(dir: string, timestamp: string, slug: string): Promise<{ filePath: string; id: string }> {
  let suffix = 0;
  for (;;) {
    const candidateId = suffix === 0 ? `${timestamp}-${slug}` : `${timestamp}-${slug}-${suffix + 1}`;
    const filePath = path.join(dir, `${candidateId}.md`);
    try {
      await fs.access(filePath);
      suffix += 1; // file exists, try the next suffix
    } catch {
      return { filePath, id: candidateId }; // ENOENT: this path is free
    }
  }
}

export interface CreateLockParams {
  title: string;
  scope: string[];
  tasks: string[];
  agent_id?: string | null;
  parent_agent_id?: string | null;
}

export interface CreateLockResult {
  id: string;
  filePath: string;
}

export async function createLock(locksRoot: string, params: CreateLockParams): Promise<CreateLockResult> {
  await ensureDirs(locksRoot);
  const now = formatTimestamp();
  const slug = slugify(params.title);
  const { filePath, id } = await uniqueFilePath(activeDir(locksRoot), now, slug);

  const frontmatter: LockFrontmatter = {
    id,
    agent_id: params.agent_id ?? null,
    parent_agent_id: params.parent_agent_id ?? null,
    status: 'active',
    created: now,
    updated: now,
    scope: params.scope,
  };
  const record: LockRecord = {
    filePath,
    frontmatter,
    title: params.title,
    tasks: params.tasks.map((text): LockTask => ({ text, done: false })),
    notes: [],
  };
  await writeRecord(record);
  return { id, filePath };
}

export interface QueryLocksParams {
  status?: 'active' | 'done' | 'all';
  scope?: string | string[];
  agent_id?: string | null;
  text?: string;
}

/**
 * Hard requirement: when `status` is omitted, done locks MUST be excluded.
 * `readAllRecords`'s default branch below is what enforces that — see the
 * accompanying test `query excludes done locks by default`.
 */
export async function queryLocks(locksRoot: string, params: QueryLocksParams): Promise<LockSummary[]> {
  const status = params.status ?? 'active';
  const records = await readAllRecords(locksRoot, status);

  const scopeFilter = params.scope === undefined ? undefined : ([] as string[]).concat(params.scope);
  const textFilter = params.text?.trim().toLowerCase();

  const filtered = records.filter((record) => {
    if (params.agent_id !== undefined && record.frontmatter.agent_id !== params.agent_id) {
      return false;
    }
    if (scopeFilter && !scopesOverlap(scopeFilter, record.frontmatter.scope)) {
      return false;
    }
    if (textFilter) {
      const haystack = [record.title, ...record.notes].join('\n').toLowerCase();
      if (!haystack.includes(textFilter)) return false;
    }
    return true;
  });

  return filtered.map(toSummary);
}

/**
 * Returns every *active* lock whose scope glob-overlaps `scope`, using the
 * heuristic in globOverlap.ts. This is informational only: it never raises,
 * never blocks, and lock_create never consults it — the calling agent
 * decides what, if anything, to do with the result.
 */
export async function checkConflicts(locksRoot: string, scope: string[]): Promise<LockSummary[]> {
  const records = await readAllRecords(locksRoot, 'active');
  const conflicting = records.filter((record) => scopesOverlap(scope, record.frontmatter.scope));
  return conflicting.map(toSummary);
}

export interface UpdateLockParams {
  lock_id: string;
  task_text: string;
  done: boolean;
  note?: string;
}

export interface UpdateLockResult {
  id: string;
  percentComplete: number;
}

export async function updateLock(locksRoot: string, params: UpdateLockParams): Promise<UpdateLockResult> {
  const record = await findRecordById(locksRoot, params.lock_id);
  if (!record) throw new LockNotFoundError(params.lock_id);

  const task = record.tasks.find((t) => t.text === params.task_text);
  if (!task) {
    throw new TaskNotFoundError(
      params.lock_id,
      params.task_text,
      record.tasks.map((t) => t.text),
    );
  }
  task.done = params.done;

  if (params.note) {
    record.notes.push(params.note);
  }

  record.frontmatter.updated = formatTimestamp();
  await writeRecord(record);

  return { id: record.frontmatter.id, percentComplete: computePercentComplete(record.tasks) };
}

export interface FinishLockParams {
  lock_id: string;
  summary?: string;
}

export interface FinishLockResult {
  id: string;
  filePath: string;
}

export async function finishLock(locksRoot: string, params: FinishLockParams): Promise<FinishLockResult> {
  await ensureDirs(locksRoot);
  const activeFiles = await listMarkdownFiles(activeDir(locksRoot));

  let record: LockRecord | null = null;
  for (const filePath of activeFiles) {
    const candidate = await readRecord(filePath);
    if (candidate.frontmatter.id === params.lock_id) {
      record = candidate;
      break;
    }
  }

  if (!record) {
    // Distinguish "never existed" from "exists but already done" for a clearer error.
    const doneFiles = await listMarkdownFiles(doneDir(locksRoot));
    for (const filePath of doneFiles) {
      const candidate = await readRecord(filePath);
      if (candidate.frontmatter.id === params.lock_id) {
        throw new LockNotActiveError(params.lock_id);
      }
    }
    throw new LockNotFoundError(params.lock_id);
  }

  if (params.summary) {
    record.notes.push(params.summary);
  }
  record.frontmatter.status = 'done';
  record.frontmatter.updated = formatTimestamp();

  const newFilePath = path.join(doneDir(locksRoot), path.basename(record.filePath));
  const oldFilePath = record.filePath;
  record.filePath = newFilePath;

  await writeRecord(record);
  await fs.unlink(oldFilePath);

  return { id: record.frontmatter.id, filePath: newFilePath };
}

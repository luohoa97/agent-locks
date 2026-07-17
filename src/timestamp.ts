/**
 * Canonical timestamp formatting for agent-locks.
 *
 * Design decision (documented in README "Timestamp format"): we use a single
 * format everywhere a timestamp appears — the lock filename prefix, the
 * frontmatter `id` field, and the frontmatter `created`/`updated` fields —
 * so there is never a mismatch between "what the file is called" and "what
 * the file says about itself".
 *
 * Format: `YYYY-MM-DDTHH-MM-SS` in UTC, e.g. `2026-07-17T18-45-12`.
 *
 * Why this exact shape:
 * - ISO 8601's `:` separators in the time portion are awkward or outright
 *   forbidden in filenames on some filesystems (notably Windows/NTFS), so we
 *   replace them with `-`. The date portion keeps its `-` separators (those
 *   were never a problem) purely for human readability — there is no
 *   functional reason a fully-dashed `2026-07-17T18-45-12` is worse than a
 *   fully-compact `20260717T184512`, and the dashed form is easier to read
 *   at a glance in a directory listing.
 * - Seconds precision (not just hours:minutes) keeps collisions between two
 *   locks created in quick succession rare, without needing milliseconds.
 * - UTC (not local time) means two agents on different machines in
 *   different timezones produce directly comparable, sortable timestamps.
 * - Because every field uses fixed-width, zero-padded components in the
 *   same order, plain string sorting of filenames or `id` values is
 *   equivalent to chronological sorting.
 */
export function formatTimestamp(date: Date = new Date()): string {
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}-${month}-${day}T${hours}-${minutes}-${seconds}`;
}

/**
 * Turns a free-text title into a filesystem- and URL-safe kebab-case slug.
 * Used to build both the lock filename and its `id` frontmatter field.
 */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'untitled';
}

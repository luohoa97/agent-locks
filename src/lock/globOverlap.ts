/**
 * Module: "do these two glob patterns plausibly describe the same files"
 * heuristic, used by lock_check_conflict.
 *
 * There is no exact, general algorithm for "do glob A and glob B ever match
 * a common real file" that doesn't require enumerating the filesystem (and
 * even enumerating the filesystem only answers it for files that exist
 * *right now*, not files either agent is about to create). We use a
 * static-prefix heuristic instead, biased deliberately toward false
 * positives (reporting an overlap that turns out not to matter) rather than
 * false negatives (missing a real conflict) — because this tool is
 * explicitly informational-only (see lock_check_conflict's tool
 * description): a false positive just means the calling agent double-checks
 * something that was actually fine, while a false negative would silently
 * hide a real conflict. See "Known gap" below for a case this heuristic
 * deliberately does not catch, and why.
 *
 * The heuristic, in order:
 *
 * 1. Exact string match → obviously overlapping.
 * 2. Static-prefix comparison: extract the literal (non-wildcard) prefix of
 *    each pattern — everything before the first `* ? [ ] { } ( ) !`
 *    character. If one pattern's static prefix is a (raw string) prefix of
 *    the other's, they overlap. This is deliberately loose:
 *      - `src/foo/**` vs `src/foo/bar.ts` → prefixes "src/foo/" and
 *        "src/foo/bar.ts" → one prefixes the other → overlap. Correct: the
 *        first pattern matches exactly that file.
 *      - `src/**` vs `src/foo/**` → prefixes "src/" and "src/foo/" → one
 *        prefixes the other → overlap. Correct: both can match files under
 *        src/foo/.
 *      - `packages/foo/**` vs `packages/bar/**` → prefixes "packages/foo/"
 *        and "packages/bar/" → neither prefixes the other → no overlap.
 *        Correct: these are different packages entirely.
 *    Any pattern whose first character is itself a wildcard (e.g. `*.ts`,
 *    `**` + `/*.test.ts`) has an empty static prefix, which is a prefix of
 *    everything — so such patterns are conservatively reported as
 *    overlapping with anything sharing that space. This is intentional
 *    over-inclusion, not a bug.
 * 3. Literal cross-match fallback: if the prefixes disagree, we additionally
 *    check whether either pattern, taken as a literal path string, is
 *    matched by the other pattern's glob (via minimatch). This matters for
 *    extglob syntax like `+(foo|bar)`, `@(foo|bar)`, `!(foo|bar)`: the `+`/
 *    `@`/`!` character itself is not treated as a wildcard-start by our
 *    prefix extraction (only the `(` right after it is), so e.g.
 *    `src/+(foo|bar)/**` gets the static prefix `"src/+"`, which does NOT
 *    raw-string-prefix a literal path like `"src/foo/util.ts"` — the prefix
 *    stage alone would wrongly say "no overlap". The fallback's real
 *    minimatch check catches the true positive here. (Plain `{brace,
 *    expansion}` and `[char classes]` don't need this fallback: `{` and `[`
 *    are themselves treated as wildcard-start characters, so the extracted
 *    prefix stops right before them and stays short enough to still
 *    raw-string-prefix any real path under that shared directory — which
 *    means those cases are already over-inclusively caught at the prefix
 *    stage, see the "known gap" test file for the brace case specifically.)
 *
 * Known gap (documented, not fixed): filesystem case-sensitivity is not
 * modeled. `Src/**` and `src/foo.ts` are treated as non-overlapping (glob
 * matching here is case-sensitive, matching minimatch's default), but on a
 * case-insensitive filesystem (default macOS, default Windows) these two
 * patterns can refer to the exact same real file on disk. We do not special
 * case this because "is this filesystem case-sensitive" is not knowable
 * from the pattern strings alone, and guessing wrong in the case-sensitive
 * direction (the common case for the Linux dev environments this tool
 * targets) is the safer default. See the accompanying test that pins this
 * exact false negative down explicitly, so a future reader knows it's a
 * known, accepted limitation rather than an untested edge case.
 */
import { minimatch } from 'minimatch';

const SPECIAL_CHARS = new Set(['*', '?', '[', ']', '{', '}', '(', ')', '!']);

function staticPrefix(pattern: string): string {
  let end = pattern.length;
  for (let i = 0; i < pattern.length; i++) {
    if (SPECIAL_CHARS.has(pattern[i])) {
      end = i;
      break;
    }
  }
  return pattern.slice(0, end);
}

export function patternsOverlap(a: string, b: string): boolean {
  if (a === b) return true;

  const prefixA = staticPrefix(a);
  const prefixB = staticPrefix(b);
  if (prefixA.startsWith(prefixB) || prefixB.startsWith(prefixA)) {
    return true;
  }

  // Fallback: treat each pattern as a literal path and see if the other
  // pattern's glob matches it. Catches cases the prefix check was too
  // conservative about (e.g. a brace/char-class boundary).
  if (minimatch(a, b, { dot: true }) || minimatch(b, a, { dot: true })) {
    return true;
  }

  return false;
}

/** True if any pattern in `a` overlaps any pattern in `b`. */
export function scopesOverlap(a: string[], b: string[]): boolean {
  for (const patternA of a) {
    for (const patternB of b) {
      if (patternsOverlap(patternA, patternB)) return true;
    }
  }
  return false;
}

import { describe, expect, it } from 'vitest';
import { patternsOverlap, scopesOverlap } from '../lock/globOverlap.js';

describe('patternsOverlap', () => {
  it('treats identical patterns as overlapping', () => {
    expect(patternsOverlap('src/foo/**', 'src/foo/**')).toBe(true);
  });

  it('detects a directory glob overlapping a literal file inside it', () => {
    expect(patternsOverlap('src/foo/**', 'src/foo/bar.ts')).toBe(true);
    expect(patternsOverlap('src/foo/bar.ts', 'src/foo/**')).toBe(true);
  });

  it('detects a broader glob overlapping a narrower glob nested under it', () => {
    expect(patternsOverlap('src/**', 'src/foo/**')).toBe(true);
  });

  it('does not flag two disjoint package directories as overlapping', () => {
    expect(patternsOverlap('packages/foo/**', 'packages/bar/**')).toBe(false);
  });

  it('does not flag two unrelated top-level directories as overlapping', () => {
    expect(patternsOverlap('backend/src/**', 'apps/organisely/**')).toBe(false);
  });

  it('conservatively treats an extension-only glob as overlapping anything under the same tree', () => {
    // *.ts has an empty static prefix, so it is deliberately over-inclusive.
    expect(patternsOverlap('*.ts', 'src/foo/bar.ts')).toBe(true);
  });

  it('catches an extglob pattern overlapping a literal path via the fallback, when the naive prefix ' +
    'extraction alone would have missed it', () => {
    // "src/+(foo|bar)/**" has static prefix "src/+" (the '+' isn't a stop
    // character, only the '(' after it is), which does NOT raw-string-prefix
    // "src/foo/util.ts" — so the prefix stage alone says "no overlap" here.
    // The literal cross-match fallback is what catches the real overlap.
    expect(patternsOverlap('src/+(foo|bar)/**', 'src/foo/util.ts')).toBe(true);
    expect(patternsOverlap('src/+(foo|bar)/**', 'src/baz/util.ts')).toBe(false);
  });

  it('is deliberately over-inclusive for brace-expansion patterns (a known, accepted imprecision, ' +
    'not a miss): the static prefix stops right at the "{", so any path under the shared literal ' +
    'directory is flagged even when it names a branch the braces do not actually include', () => {
    expect(patternsOverlap('src/{foo,bar}/**', 'src/bar/util.ts')).toBe(true);
    // A real intersection test would say false here (baz is neither foo nor
    // bar), but our prefix heuristic only looks at the literal text before
    // the "{" — "src/" — which trivially prefixes "src/baz/util.ts" too.
    // This is the SAME over-inclusion bias documented for `*.ts` above, just
    // triggered by "{" instead of "*". Safe direction (false positive), so
    // left as-is rather than special-cased.
    expect(patternsOverlap('src/{foo,bar}/**', 'src/baz/util.ts')).toBe(true);
  });

  describe('documented known gap: filesystem case-sensitivity is not modeled', () => {
    it('does NOT detect an overlap between patterns that differ only in case, even though they refer ' +
      'to the same real file on a case-insensitive filesystem (default macOS/Windows)', () => {
      // This is a known, accepted false negative — see globOverlap.ts's module
      // docstring "Known gap" section for the full reasoning. Pinned here so a
      // future reader sees it was a deliberate call, not an oversight.
      expect(patternsOverlap('Src/**', 'src/foo.ts')).toBe(false);
    });
  });
});

describe('scopesOverlap', () => {
  it('is true if any pair across the two arrays overlaps', () => {
    expect(scopesOverlap(['docs/**', 'backend/src/oauth/**'], ['backend/src/oauth/client.ts'])).toBe(true);
  });

  it('is false if no pair overlaps', () => {
    expect(scopesOverlap(['docs/**'], ['backend/src/oauth/client.ts'])).toBe(false);
  });

  it('is false for empty arrays', () => {
    expect(scopesOverlap([], ['anything/**'])).toBe(false);
    expect(scopesOverlap(['anything/**'], [])).toBe(false);
  });
});

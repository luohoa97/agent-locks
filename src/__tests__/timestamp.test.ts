import { describe, expect, it } from 'vitest';
import { formatTimestamp, slugify } from '../timestamp.js';

describe('formatTimestamp', () => {
  it('formats a UTC date as YYYY-MM-DDTHH-MM-SS with no colons', () => {
    const date = new Date(Date.UTC(2026, 6, 17, 18, 45, 12)); // month is 0-indexed: 6 = July
    expect(formatTimestamp(date)).toBe('2026-07-17T18-45-12');
  });

  it('zero-pads single-digit month/day/hour/minute/second components', () => {
    const date = new Date(Date.UTC(2026, 0, 5, 3, 4, 5));
    expect(formatTimestamp(date)).toBe('2026-01-05T03-04-05');
  });

  it('produces strings that sort lexicographically in chronological order', () => {
    const earlier = formatTimestamp(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)));
    const later = formatTimestamp(new Date(Date.UTC(2026, 0, 1, 0, 0, 1)));
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates a plain title', () => {
    expect(slugify('Hindsight Route Tests')).toBe('hindsight-route-tests');
  });

  it('collapses punctuation and whitespace runs into single hyphens', () => {
    expect(slugify('Fix   the OAuth / MCP bug!!')).toBe('fix-the-oauth-mcp-bug');
  });

  it('strips leading/trailing hyphens', () => {
    expect(slugify('--already-kebab--')).toBe('already-kebab');
  });

  it('falls back to "untitled" for a title with no alphanumeric characters', () => {
    expect(slugify('!!!')).toBe('untitled');
  });
});

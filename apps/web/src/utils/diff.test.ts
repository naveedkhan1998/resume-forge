import { describe, expect, it } from 'vitest';

import { diffLines, diffWords } from './diff';

describe('diffLines', () => {
  it('marks added, removed, and untouched bullets', () => {
    const summary = diffLines(
      ['Kept bullet.', 'Dropped bullet.'],
      ['Kept bullet.', 'Brand new bullet.'],
    );

    expect(summary.entries).toEqual([
      { kind: 'unchanged', value: 'Kept bullet.' },
      { kind: 'removed', value: 'Dropped bullet.' },
      { kind: 'added', value: 'Brand new bullet.' },
    ]);
    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(1);
  });

  it('pairs a reworded bullet into a single word-level change', () => {
    const summary = diffLines(
      ['Built an API that served 2M requests per day.'],
      ['Built an API that served 5M requests per day.'],
    );

    expect(summary.changed).toBe(1);
    expect(summary.added).toBe(0);
    expect(summary.removed).toBe(0);

    const [entry] = summary.entries;
    expect(entry.previousValue).toBe('Built an API that served 2M requests per day.');
    expect(entry.words?.filter((part) => part.kind === 'removed').map((part) => part.value)).toEqual(['2M']);
    expect(entry.words?.filter((part) => part.kind === 'added').map((part) => part.value)).toEqual(['5M']);
  });

  it('keeps unrelated replacements separate instead of pairing them', () => {
    const summary = diffLines(['Mentored three interns.'], ['Migrated billing to Postgres.']);

    expect(summary.changed).toBe(0);
    expect(summary.removed).toBe(1);
    expect(summary.added).toBe(1);
  });
});

describe('diffWords', () => {
  it('reports inserted and deleted words', () => {
    const parts = diffWords('reduced latency', 'reduced p99 latency');

    expect(parts.filter((part) => part.kind === 'added').map((part) => part.value)).toEqual(['p99', ' ']);
    expect(parts.filter((part) => part.kind === 'removed')).toHaveLength(0);
  });
});

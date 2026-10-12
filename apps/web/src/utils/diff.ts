/**
 * Minimal LCS diff utilities used to preview AI section edits before saving.
 */

export type DiffKind = 'added' | 'removed' | 'unchanged' | 'changed';

export interface WordDiffPart {
  kind: 'added' | 'removed' | 'unchanged';
  value: string;
}

export interface DiffEntry {
  kind: DiffKind;
  value: string;
  previousValue?: string;
  words?: WordDiffPart[];
}

export interface DiffSummary {
  entries: DiffEntry[];
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

function lcsMatrix(before: string[], after: string[]): number[][] {
  const table: number[][] = Array.from({ length: before.length + 1 }, () =>
    new Array<number>(after.length + 1).fill(0),
  );
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        before[i] === after[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

function rawDiff(before: string[], after: string[]): Array<{ kind: 'added' | 'removed' | 'unchanged'; value: string }> {
  const table = lcsMatrix(before, after);
  const result: Array<{ kind: 'added' | 'removed' | 'unchanged'; value: string }> = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      result.push({ kind: 'unchanged', value: before[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      result.push({ kind: 'removed', value: before[i] });
      i += 1;
    } else {
      result.push({ kind: 'added', value: after[j] });
      j += 1;
    }
  }
  while (i < before.length) {
    result.push({ kind: 'removed', value: before[i] });
    i += 1;
  }
  while (j < after.length) {
    result.push({ kind: 'added', value: after[j] });
    j += 1;
  }
  return result;
}

export function diffWords(before: string, after: string): WordDiffPart[] {
  const beforeTokens = before.split(/(\s+)/).filter((token) => token.length > 0);
  const afterTokens = after.split(/(\s+)/).filter((token) => token.length > 0);
  return rawDiff(beforeTokens, afterTokens).map(({ kind, value }) => ({ kind, value }));
}

function similarity(before: string, after: string): number {
  const beforeWords = before.toLowerCase().split(/\s+/).filter(Boolean);
  const afterWords = after.toLowerCase().split(/\s+/).filter(Boolean);
  if (beforeWords.length === 0 || afterWords.length === 0) return 0;
  const shared = lcsMatrix(beforeWords, afterWords)[0][0];
  return (2 * shared) / (beforeWords.length + afterWords.length);
}

// Requires substantial overlap so unrelated bullets sharing a stray word are not
// reported as a reword of each other.
const REWORD_SIMILARITY_THRESHOLD = 0.6;

/**
 * Pairs removed/added runs that are close enough to be an edit of the same line
 * so the UI can show a word-level diff instead of a full delete plus insert.
 */
export function diffLines(before: string[], after: string[]): DiffSummary {
  const raw = rawDiff(before, after);
  const entries: DiffEntry[] = [];

  let index = 0;
  while (index < raw.length) {
    if (raw[index].kind !== 'removed') {
      entries.push({ kind: raw[index].kind, value: raw[index].value });
      index += 1;
      continue;
    }

    let removedEnd = index;
    while (removedEnd < raw.length && raw[removedEnd].kind === 'removed') removedEnd += 1;
    let addedEnd = removedEnd;
    while (addedEnd < raw.length && raw[addedEnd].kind === 'added') addedEnd += 1;

    const removed = raw.slice(index, removedEnd).map((item) => item.value);
    const added = raw.slice(removedEnd, addedEnd).map((item) => item.value);
    const pairCount = Math.min(removed.length, added.length);

    for (let pair = 0; pair < pairCount; pair += 1) {
      if (similarity(removed[pair], added[pair]) >= REWORD_SIMILARITY_THRESHOLD) {
        entries.push({
          kind: 'changed',
          value: added[pair],
          previousValue: removed[pair],
          words: diffWords(removed[pair], added[pair]),
        });
      } else {
        entries.push({ kind: 'removed', value: removed[pair] });
        entries.push({ kind: 'added', value: added[pair] });
      }
    }
    for (let extra = pairCount; extra < removed.length; extra += 1) {
      entries.push({ kind: 'removed', value: removed[extra] });
    }
    for (let extra = pairCount; extra < added.length; extra += 1) {
      entries.push({ kind: 'added', value: added[extra] });
    }

    index = addedEnd;
  }

  return {
    entries,
    added: entries.filter((entry) => entry.kind === 'added').length,
    removed: entries.filter((entry) => entry.kind === 'removed').length,
    changed: entries.filter((entry) => entry.kind === 'changed').length,
    unchanged: entries.filter((entry) => entry.kind === 'unchanged').length,
  };
}

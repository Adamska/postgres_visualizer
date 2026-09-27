// Fuzzy matching for the command palette: subsequence matching with bonuses for word starts and
// consecutive characters, so "ordit" finds "order_items" before "product_order_history".

export interface FuzzyMatch {
  score: number;
  /** Indices of the matched characters in the candidate, for highlighting. */
  indices: number[];
}

/** Average bonus per character a scattered match needs (a word start or a run of letters). */
const MIN_SCORE_PER_CHAR = 4;

const WORD_SEPARATORS = new Set([" ", "_", "-", ".", "/", ":", "(", ")"]);

function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true;
  const previous = text[index - 1] ?? "";
  const current = text[index] ?? "";
  if (WORD_SEPARATORS.has(previous)) return true;
  // camelCase boundary
  return previous === previous.toLowerCase() && current !== current.toLowerCase();
}

/**
 * Scores `candidate` against `query`; `null` when the query is not a subsequence. Higher is
 * better. An empty query matches everything with a score of 0.
 */
export function fuzzyMatch(query: string, candidate: string): FuzzyMatch | null {
  const needle = query.trim().toLowerCase();
  if (needle === "") return { score: 0, indices: [] };
  const haystack = candidate.toLowerCase();

  // Exact substring matches win outright, earlier ones more so.
  const substring = haystack.indexOf(needle);
  if (substring !== -1) {
    const indices = Array.from({ length: needle.length }, (_, i) => substring + i);
    const boundary = isWordStart(candidate, substring) ? 40 : 0;
    const exact = haystack.length === needle.length ? 50 : 0;
    return { score: 100 + boundary + exact - substring - haystack.length * 0.1, indices };
  }

  const indices: number[] = [];
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of needle) {
    if (char === " ") continue;
    let found = -1;
    // Prefer the next word start holding the character, else the next occurrence.
    for (let i = from; i < haystack.length; i++) {
      if (haystack[i] === char && isWordStart(candidate, i)) {
        found = i;
        break;
      }
    }
    const next = haystack.indexOf(char, from);
    if (found === -1 || (next !== -1 && next === previous + 1)) found = next;
    if (found === -1) return null;
    score += 1;
    if (found === previous + 1) score += 5;
    if (isWordStart(candidate, found)) score += 8;
    indices.push(found);
    previous = found;
    from = found + 1;
  }
  // Scattered letters with no word starts or runs are noise, not a match.
  if (score < indices.length * MIN_SCORE_PER_CHAR) return null;
  score -= (indices[0] ?? 0) * 0.5;
  score -= haystack.length * 0.1;
  return { score, indices };
}

/** Filters and sorts items by their best fuzzy score over the given keys. */
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  keys: (item: T) => string[],
  limit = Infinity,
): { item: T; match: FuzzyMatch; key: number }[] {
  const scored: { item: T; match: FuzzyMatch; key: number; order: number }[] = [];
  items.forEach((item, order) => {
    let best: { match: FuzzyMatch; key: number } | null = null;
    const texts = keys(item);
    for (let key = 0; key < texts.length; key++) {
      const match = fuzzyMatch(query, texts[key] ?? "");
      if (!match) continue;
      // Secondary keys (descriptions) count for less than the title.
      if (key > 0) match.score -= 20;
      if (best === null || match.score > best.match.score) best = { match, key };
    }
    if (best !== null) scored.push({ item, order, match: best.match, key: best.key });
  });
  scored.sort((a, b) => b.match.score - a.match.score || a.order - b.order);
  return scored.slice(0, limit).map(({ item, match, key }) => ({ item, match, key }));
}

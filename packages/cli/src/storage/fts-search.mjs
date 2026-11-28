const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;
const words = (text) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

export function indexTerms(text) {
  const tokens = [];
  for (const word of text.match(/[\p{L}\p{N}]+/gu) ?? []) {
    const whole = word.toLowerCase();
    tokens.push(whole);
    const expanded = word.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2').replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2');
    tokens.push(...words(expanded).filter((part) => part !== whole));
    for (const match of whole.matchAll(cjk)) {
      const points = Array.from(match[0]);
      for (let i = 1; i < points.length; i += 1) {
        const bigram = points[i - 1] + points[i];
        if (bigram !== whole) tokens.push(bigram);
      }
    }
  }
  return tokens.join(' ');
}

export function ftsCandidates(store, query, corpora, limit, allowed) {
  const literal = query.toLowerCase();
  const exact = [];
  const seen = new Set();
  const budget = Math.max(limit * 4, 120);
  if (corpora.includes('code')) {
    for (const row of store.sql(`SELECT c.meta_json, c.path, c.corpus FROM symbols s JOIN chunks c ON c.id=s.id
      WHERE s.name_lower=? OR s.qualified_name_lower=? ORDER BY c.id`).iterate(literal, literal)) {
      if (!allowed(row.path, row.corpus)) continue;
      const chunk = JSON.parse(row.meta_json);
      seen.add(chunk.id);
      exact.push({ ...chunk, exactNameMatch: true, keywordScore: 3 });
      if (exact.length >= budget) return exact;
    }
  }
  const match = [...new Set(indexTerms(query).split(' '))].filter(Boolean).map((word) => `"${word}"`).join(' OR ');
  if (!match) return exact;
  const paths = new Set();
  for (const row of store.sql(`SELECT c.meta_json, c.path, c.corpus, c.id, bm25(chunks_fts,0,0,2,5,1) AS rank
    FROM chunks_fts JOIN chunks c ON c.rowid=chunks_fts.rowid
    WHERE chunks_fts MATCH ? AND c.corpus IN (?,?) ORDER BY rank,c.id`).iterate(match, corpora[0], corpora[1] ?? corpora[0])) {
    if (seen.has(row.id) || !allowed(row.path, row.corpus) || (row.corpus === 'docs' && paths.has(row.path))) continue;
    if (row.corpus === 'docs') paths.add(row.path);
    exact.push({ ...JSON.parse(row.meta_json), exactNameMatch: false, keywordScore: -row.rank });
    if (exact.length >= budget) break;
  }
  return exact;
}

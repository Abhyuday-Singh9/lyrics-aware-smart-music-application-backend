const { parseLRC } = require("./lrcParser");
const { getSongFiles, hasLyrics, readLyricsText } = require("./mediaLibrary");

const MAX_RESULTS = 4;
const MAX_CANDIDATES = 80;
const MIN_QUERY_LENGTH = 2;
const MIN_ABSOLUTE_SCORE = 0.45;
const MIN_RELATIVE_SCORE = 0.72;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "him",
  "his",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "she",
  "so",
  "than",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "up",
  "us",
  "was",
  "we",
  "were",
  "with",
  "you",
  "your",
]);
const parsedLyricsCache = new Map();
const globalIndexCache = new Map();
const MAIN_INDEX_KEY = "main";

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/['`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalize(text).split(" ").filter(Boolean);
}

function removeStopWords(tokens) {
  return tokens.filter((token) => !STOP_WORDS.has(token));
}

function toTokenCounts(tokens) {
  const counts = Object.create(null);

  for (const token of tokens) {
    counts[token] = (counts[token] || 0) + 1;
  }

  return counts;
}

function countOrderedMatches(queryTokens, candidateTokens) {
  if (!queryTokens.length || !candidateTokens.length) {
    return 0;
  }

  let queryIndex = 0;
  let candidateIndex = 0;
  let matches = 0;

  while (queryIndex < queryTokens.length && candidateIndex < candidateTokens.length) {
    if (queryTokens[queryIndex] === candidateTokens[candidateIndex]) {
      matches += 1;
      queryIndex += 1;
      candidateIndex += 1;
      continue;
    }

    candidateIndex += 1;
  }

  return matches;
}

function getBigrams(text) {
  if (!text) return [];
  if (text.length === 1) return [text];

  const bigrams = [];
  for (let index = 0; index < text.length - 1; index += 1) {
    bigrams.push(text.slice(index, index + 2));
  }

  return bigrams;
}

function diceSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aBigrams = getBigrams(a);
  const bBigrams = getBigrams(b);

  if (!aBigrams.length || !bBigrams.length) {
    return a === b ? 1 : 0;
  }

  const counts = new Map();
  for (const gram of aBigrams) {
    counts.set(gram, (counts.get(gram) || 0) + 1);
  }

  let overlap = 0;
  for (const gram of bBigrams) {
    const current = counts.get(gram) || 0;
    if (current > 0) {
      overlap += 1;
      counts.set(gram, current - 1);
    }
  }

  return (2 * overlap) / (aBigrams.length + bBigrams.length);
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = new Array(b.length + 1);
  const current = new Array(b.length + 1);

  for (let index = 0; index <= b.length; index += 1) {
    previous[index] = index;
  }

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function fuzzySimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const maxLength = Math.max(a.length, b.length);
  if (!maxLength) return 0;

  const distanceScore = 1 - levenshteinDistance(a, b) / maxLength;
  const diceScore = diceSimilarity(a, b);

  return 0.55 * diceScore + 0.45 * Math.max(0, distanceScore);
}

function getParsedLyrics(song) {
  if (parsedLyricsCache.has(song)) {
    return parsedLyricsCache.get(song);
  }

  const parsedLyrics = hasLyrics(song) ? parseLRC(readLyricsText(song)) : [];
  parsedLyricsCache.set(song, parsedLyrics);
  return parsedLyrics;
}

function buildGlobalIndex() {
  if (globalIndexCache.has(MAIN_INDEX_KEY)) {
    return globalIndexCache.get(MAIN_INDEX_KEY);
  }

  const songs = getSongFiles();
  const entries = [];
  const invertedIndex = new Map();
  const songDocumentFrequency = new Map();

  for (const song of songs) {
    const parsedLyrics = getParsedLyrics(song);

    for (let lineIndex = 0; lineIndex < parsedLyrics.length; lineIndex += 1) {
      const line = parsedLyrics[lineIndex];
      const normalized = normalize(line.text);
      const tokens = tokenize(line.text);
      const contentTokens = removeStopWords(tokens);

      if (!normalized || !tokens.length) {
        continue;
      }

      const weightedTokens = contentTokens.length ? contentTokens : tokens;
      const tokenCounts = toTokenCounts(weightedTokens);
      const uniqueTokens = Object.keys(tokenCounts);
      const entryIndex = entries.length;

      entries.push({
        contentTokens,
        lineIndex,
        normalized,
        song,
        text: line.text,
        time: line.time,
        tokenCounts,
        tokens,
        uniqueTokens,
      });

      for (const token of uniqueTokens) {
        if (!invertedIndex.has(token)) {
          invertedIndex.set(token, []);
        }

        invertedIndex.get(token).push({
          entryIndex,
          lineIndex,
          song,
        });
      }
    }
  }

  for (const [token, postings] of invertedIndex.entries()) {
    const songsWithToken = new Set(postings.map((posting) => posting.song));
    songDocumentFrequency.set(token, songsWithToken.size);
  }

  const totalSongs = Math.max(
    1,
    new Set(entries.map((entry) => entry.song)).size || songs.length,
  );
  const idf = new Map();

  for (const token of invertedIndex.keys()) {
    const songsWithToken = songDocumentFrequency.get(token) || 0;
    idf.set(token, Math.log(1 + totalSongs / (1 + songsWithToken)) + 1);
  }

  const index = {
    entries,
    idf,
    invertedIndex,
    indexedAt: new Date().toISOString(),
    totalSongs,
  };

  globalIndexCache.set(MAIN_INDEX_KEY, index);
  return index;
}

function initializeGlobalSearchIndex() {
  return buildGlobalIndex();
}

function getGlobalSearchIndexStats() {
  const index = buildGlobalIndex();

  return {
    indexedAt: index.indexedAt,
    songs: index.totalSongs,
    tokens: index.invertedIndex.size,
    entries: index.entries.length,
  };
}

function getCandidateEntryIndexes(index, queryTokens) {
  const candidateWeights = new Map();

  for (const token of queryTokens) {
    const postings = index.invertedIndex.get(token) || [];

    for (const posting of postings) {
      candidateWeights.set(
        posting.entryIndex,
        (candidateWeights.get(posting.entryIndex) || 0) + 1,
      );
    }
  }

  if (!candidateWeights.size) {
    return index.entries.map((_, entryIndex) => entryIndex);
  }

  return [...candidateWeights.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, MAX_CANDIDATES)
    .map(([entryIndex]) => entryIndex);
}

function scoreTfIdf(entry, queryTokenCounts, uniqueTokens, idf) {
  let score = 0;

  for (const token of uniqueTokens) {
    const queryTf = queryTokenCounts[token] || 0;
    const lineTf = entry.tokenCounts[token] || 0;
    if (!queryTf || !lineTf) {
      continue;
    }

    score += Math.min(queryTf, lineTf) * (idf.get(token) || 1);
  }

  return score;
}

function scoreFuzzy(entry, normalizedQuery, queryTokens) {
  const lineSimilarity = fuzzySimilarity(entry.normalized, normalizedQuery);

  let tokenScore = 0;
  for (const queryToken of queryTokens) {
    let best = 0;

    for (const candidateToken of entry.uniqueTokens) {
      const similarity = fuzzySimilarity(queryToken, candidateToken);
      if (similarity > best) {
        best = similarity;
      }
    }

    tokenScore += best;
  }

  const averageTokenScore = queryTokens.length
    ? tokenScore / queryTokens.length
    : 0;

  return 0.6 * lineSimilarity + 0.4 * averageTokenScore;
}

function scorePhraseMatch(entry, queryTokens) {
  if (!queryTokens.length) {
    return 0;
  }

  const candidateTokens = entry.contentTokens.length ? entry.contentTokens : entry.tokens;
  const orderedMatches = countOrderedMatches(queryTokens, candidateTokens);
  const orderedScore = orderedMatches / queryTokens.length;
  const phraseText = queryTokens.join(" ");
  const phraseBonus = entry.normalized.includes(phraseText) ? 1 : 0;

  return 0.65 * orderedScore + 0.35 * phraseBonus;
}

function prepareQuery(query) {
  const normalized = normalize(query);
  const tokens = tokenize(normalized);
  const contentTokens = removeStopWords(tokens);
  const weightedTokens = contentTokens.length ? contentTokens : tokens;
  const tokenCounts = toTokenCounts(weightedTokens);

  return {
    contentTokens,
    normalized,
    tokenCounts,
    tokens,
    uniqueTokens: Object.keys(tokenCounts),
    weightedTokens,
  };
}

function searchLyricsGlobally(query) {
  const preparedQuery = prepareQuery(query);
  const { normalized: normalizedQuery } = preparedQuery;

  if (normalizedQuery.length < MIN_QUERY_LENGTH) {
    return [];
  }

  if (!preparedQuery.tokens.length) {
    return [];
  }

  const index = buildGlobalIndex();
  const candidateIndexes = getCandidateEntryIndexes(
    index,
    preparedQuery.uniqueTokens,
  );
  const scoredResults = [];

  for (const entryIndex of candidateIndexes) {
    const entry = index.entries[entryIndex];
    const tfIdfScore = scoreTfIdf(
      entry,
      preparedQuery.tokenCounts,
      preparedQuery.uniqueTokens,
      index.idf,
    );
    const fuzzyScore = scoreFuzzy(
      entry,
      normalizedQuery,
      preparedQuery.weightedTokens,
    );
    const phraseScore = scorePhraseMatch(entry, preparedQuery.weightedTokens);
    const score = tfIdfScore * 0.6 + fuzzyScore * 0.2 + phraseScore * 0.2;

    if (score <= 0) {
      continue;
    }

    scoredResults.push({
      score,
      song: entry.song,
      text: entry.text,
      time: entry.time,
    });
  }

  const maxScore =
    scoredResults.reduce(
      (currentMax, result) => Math.max(currentMax, result.score),
      0,
    ) || 1;

  const bestResultBySong = new Map();

  for (const result of scoredResults.sort(
    (a, b) =>
      b.score - a.score ||
      a.song.localeCompare(b.song) ||
      a.time - b.time,
  )) {
    const normalizedScore = result.score / maxScore;

    if (
      result.score < MIN_ABSOLUTE_SCORE ||
      normalizedScore < MIN_RELATIVE_SCORE
    ) {
      continue;
    }

    if (!bestResultBySong.has(result.song)) {
      bestResultBySong.set(result.song, {
        ...result,
        score: Number(normalizedScore.toFixed(4)),
      });
    }
  }

  return [...bestResultBySong.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.song.localeCompare(b.song) ||
        a.time - b.time,
    )
    .slice(0, MAX_RESULTS)
    .map((result) => ({ ...result }));
}

module.exports = {
  getGlobalSearchIndexStats,
  initializeGlobalSearchIndex,
  searchLyricsGlobally,
};

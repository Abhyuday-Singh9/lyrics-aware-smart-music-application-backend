const cache = require("./cache");
const { parseLRC } = require("./lrcParser");
const { detectSections } = require("./sectionDetector");
const { readLyricsText } = require("./mediaLibrary");
const { log } = require("./logger");

const SLANG_EQUIVALENTS = {
  cuz: "because",
  imma: "im going to",
  ive: "i have",
  luv: "love",
  wanna: "want to",
  wasnt: "was not",
  u: "you",
  ur: "your",
  youre: "you are",
};

const MAX_CANDIDATES = 20;
const MIN_TOKEN_LENGTH = 2;

function normalize(text) {
  if (!text) return "";

  const normalized = text
    .toLowerCase()
    .replace(/['`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((token) => SLANG_EQUIVALENTS[token] || token)
    .join(" ");
}

function tokenize(text) {
  return normalize(text)
    .split(" ")
    .filter(Boolean);
}

function toTokenCounts(tokens) {
  const counts = Object.create(null);

  for (const token of tokens) {
    counts[token] = (counts[token] || 0) + 1;
  }

  return counts;
}

function getBigrams(text) {
  if (!text) return [];
  if (text.length === 1) return [text];

  const bigrams = [];
  for (let i = 0; i < text.length - 1; i += 1) {
    bigrams.push(text.slice(i, i + 2));
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

  for (let j = 0; j <= b.length; j += 1) {
    previous[j] = j;
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

function buildVocabulary(parsedLyrics) {
  const vocabulary = [];
  const tokenToVocabularyIndex = new Map();

  for (const line of parsedLyrics) {
    for (const token of tokenize(line.text)) {
      if (!tokenToVocabularyIndex.has(token)) {
        tokenToVocabularyIndex.set(token, vocabulary.length);
        vocabulary.push(token);
      }
    }
  }

  return { tokenToVocabularyIndex, vocabulary };
}

function buildIndex(parsedLyrics) {
  const tokenToLines = new Map();
  const documentFrequency = new Map();
  const items = [];
  const { tokenToVocabularyIndex, vocabulary } = buildVocabulary(parsedLyrics);
  const totalDocuments = parsedLyrics.length || 1;

  for (let i = 0; i < parsedLyrics.length; i += 1) {
    const line = parsedLyrics[i];
    const normalized = normalize(line.text);
    const tokens = tokenize(line.text);
    const tokenCounts = toTokenCounts(tokens);
    const uniqueTokens = Object.keys(tokenCounts);

    for (const token of uniqueTokens) {
      if (!tokenToLines.has(token)) {
        tokenToLines.set(token, []);
      }

      tokenToLines.get(token).push(i);
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }

    items.push({
      indexRef: null,
      normalized,
      text: line.text,
      time: line.time,
      tokenCounts,
      tokens,
      uniqueTokens,
    });
  }

  const idf = new Map();
  for (const token of vocabulary) {
    const df = documentFrequency.get(token) || 0;
    idf.set(token, Math.log(1 + totalDocuments / (1 + df)) + 1);
  }

  const index = {
    idf,
    items,
    tokenToLines,
    tokenToVocabularyIndex,
    vocabulary,
  };

  for (const item of items) {
    item.indexRef = index;
  }

  return index;
}

function preprocessQuery(index, query) {
  const normalized = normalize(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const tokenCounts = toTokenCounts(tokens);
  const uniqueTokens = Object.keys(tokenCounts);

  return {
    normalized,
    tokenCounts,
    tokens,
    uniqueTokens,
  };
}

function scoreTokenOverlap(item, preparedQuery) {
  const { idf } = item.indexRef;
  let matchedWeight = 0;
  let totalWeight = 0;

  for (const token of preparedQuery.uniqueTokens) {
    const tokenWeight = idf.get(token) || 1;
    const queryCount = Math.min(preparedQuery.tokenCounts[token], 2);
    const lineCount = item.tokenCounts[token] || 0;

    totalWeight += queryCount * tokenWeight;
    matchedWeight += Math.min(queryCount, lineCount) * tokenWeight;
  }

  if (!totalWeight) return 0;
  return matchedWeight / totalWeight;
}

function bestTokenFuzzyScore(queryTokens, candidateTokens) {
  if (!queryTokens.length || !candidateTokens.length) return 0;

  let total = 0;

  for (const queryToken of queryTokens) {
    let best = 0;

    for (const candidateToken of candidateTokens) {
      const similarity = fuzzySimilarity(queryToken, candidateToken);
      if (similarity > best) {
        best = similarity;
      }
    }

    total += best;
  }

  return total / queryTokens.length;
}

function scoreLine(item, query) {
  const preparedQuery =
    typeof query === "string" ? preprocessQuery(item.indexRef, query) : query;

  if (!preparedQuery.normalized) {
    return 0;
  }

  const lineFuzzy = fuzzySimilarity(item.normalized, preparedQuery.normalized);
  const tokenFuzzy = bestTokenFuzzyScore(
    preparedQuery.uniqueTokens,
    item.uniqueTokens,
  );
  const fuzzyScore = 0.55 * lineFuzzy + 0.45 * tokenFuzzy;
  const overlapScore = scoreTokenOverlap(item, preparedQuery);

  return 0.7 * fuzzyScore + 0.3 * overlapScore;
}

function buildContextText(index, i) {
  const previous = index.items[i - 1]?.text || "";
  const current = index.items[i]?.text || "";
  const next = index.items[i + 1]?.text || "";

  return [previous, current, next].filter(Boolean).join(" ");
}

function scoreWithContext(index, i, query) {
  const preparedQuery =
    typeof query === "string" ? preprocessQuery(index, query) : query;
  const item = index.items[i];

  if (!item || !preparedQuery.normalized) {
    return 0;
  }

  const currentScore = scoreLine(item, preparedQuery);
  const contextText = normalize(buildContextText(index, i));
  const contextFuzzy = fuzzySimilarity(contextText, preparedQuery.normalized);
  const contextTokenFuzzy = bestTokenFuzzyScore(
    preparedQuery.uniqueTokens,
    tokenize(contextText),
  );
  const contextScore = 0.65 * contextFuzzy + 0.35 * contextTokenFuzzy;

  return 0.8 * currentScore + 0.2 * Math.max(currentScore, contextScore);
}

function expandTokenMatches(index, token) {
  const matches = [];
  const firstChar = token[0];

  for (const candidateToken of index.vocabulary) {
    if (
      candidateToken.length < MIN_TOKEN_LENGTH ||
      Math.abs(candidateToken.length - token.length) > 2
    ) {
      continue;
    }

    if (candidateToken[0] !== firstChar) {
      continue;
    }

    const similarity = fuzzySimilarity(token, candidateToken);
    if (similarity >= 0.72) {
      matches.push({ similarity, token: candidateToken });
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity);
  return matches.slice(0, 3);
}

function getCandidates(index, queryTokens) {
  const candidateWeights = new Map();

  for (const token of queryTokens) {
    const exactMatches = index.tokenToLines.get(token) || [];
    for (const lineIndex of exactMatches) {
      candidateWeights.set(
        lineIndex,
        (candidateWeights.get(lineIndex) || 0) + 1.5,
      );
    }

    if (exactMatches.length > 0 || token.length < MIN_TOKEN_LENGTH) {
      continue;
    }

    const fuzzyMatches = expandTokenMatches(index, token);
    for (const match of fuzzyMatches) {
      const postings = index.tokenToLines.get(match.token) || [];
      for (const lineIndex of postings) {
        candidateWeights.set(
          lineIndex,
          (candidateWeights.get(lineIndex) || 0) + match.similarity,
        );
      }
    }
  }

  if (candidateWeights.size === 0) {
    return index.items.map((_, i) => i);
  }

  return [...candidateWeights.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, MAX_CANDIDATES)
    .map(([lineIndex]) => lineIndex);
}

function getMinimumAcceptedScore(queryTokenCount) {
  if (queryTokenCount <= 1) return 0.58;
  if (queryTokenCount === 2) return 0.44;
  return 0.3;
}

function findBestMatch(index, query) {
  const preparedQuery = preprocessQuery(index, query);

  if (!preparedQuery.normalized) {
    return null;
  }

  const candidates = getCandidates(index, preparedQuery.uniqueTokens);
  let bestItem = null;
  let bestScore = 0;

  for (const lineIndex of candidates) {
    const item = index.items[lineIndex];
    const score = scoreWithContext(index, lineIndex, preparedQuery);

    if (
      score > bestScore ||
      (score === bestScore && bestItem && item.time < bestItem.time)
    ) {
      bestItem = item;
      bestScore = score;
    }
  }

  if (
    !bestItem ||
    bestScore < getMinimumAcceptedScore(preparedQuery.uniqueTokens.length)
  ) {
    return null;
  }

  return {
    score: bestScore,
    text: bestItem.text,
    time: bestItem.time,
  };
}

function getParsedLyrics(song) {
  const cacheKey = `lyrics:${song}`;
  const cachedLyrics = cache.get(cacheKey);

  if (cachedLyrics) {
    return cachedLyrics;
  }

  const parsedLyrics = parseLRC(readLyricsText(song));
  cache.set(cacheKey, parsedLyrics);
  return parsedLyrics;
}

function getLyricsIndex(song, parsedLyrics) {
  const cacheKey = `index:${song}`;
  const cachedIndex = cache.get(cacheKey);

  if (cachedIndex) {
    return cachedIndex;
  }

  const index = buildIndex(parsedLyrics);
  cache.set(cacheKey, index);
  return index;
}

function respondWithLyricsRange(song, parsedLyrics, start, end) {
  if (!start?.trim()) {
    return {
      error: "Start required",
      statusCode: 400,
    };
  }

  const index = getLyricsIndex(song, parsedLyrics);
  const startLine = findBestMatch(index, start);
  const endLine = end ? findBestMatch(index, end) : null;

  if (!startLine) {
    return { intent: "not_found" };
  }

  return {
    intent: "play_range",
    startTime: startLine.time,
    endTime: endLine ? endLine.time : null,
  };
}

function respondWithSectionRange(parsedLyrics, section, index) {
  const sections = detectSections(parsedLyrics);

  if (!sections.length) {
    return { intent: "not_found" };
  }

  const matchingSections = sections.filter(
    (item) => item.type.toLowerCase() === section?.toLowerCase(),
  );

  if (!matchingSections.length) {
    return { intent: "not_found" };
  }

  const requestedIndex = Number(index);
  const sectionIndex =
    Number.isInteger(requestedIndex) && requestedIndex >= 0 ? requestedIndex : 0;
  const chosen = matchingSections[sectionIndex];

  if (!chosen) {
    return { intent: "not_found" };
  }

  return {
    intent: "play_range",
    startTime: chosen.start,
    endTime: chosen.end,
  };
}

function respondWithSections(parsedLyrics) {
  const sections = detectSections(parsedLyrics);
  log("INFO", "Detected sections:", sections.length);

  if (!sections.length) {
    return { intent: "not_found" };
  }

  return {
    intent: "sections",
    sections,
  };
}

function processQuery({ song, mode, start, end, section, index }) {
  const parsedLyrics = getParsedLyrics(song);

  if (mode === "lyrics") {
    return respondWithLyricsRange(song, parsedLyrics, start, end);
  }

  if (mode === "section") {
    return respondWithSectionRange(parsedLyrics, section, index);
  }

  if (mode === "tiktok") {
    return respondWithSections(parsedLyrics);
  }

  return {
    error: "Invalid mode",
    statusCode: 400,
  };
}

module.exports = {
  getParsedLyrics,
  processQuery,
};

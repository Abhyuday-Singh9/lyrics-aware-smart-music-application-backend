// services/advancedSectionDetector.js

/* ---------------- NORMALIZATION & SIMILARITY ---------------- */

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extendFinalChorus(lines) {
  let lastChorusIndex = -1;

  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].type === "chorus") {
      lastChorusIndex = i;
      break;
    }
  }

  if (lastChorusIndex === -1) return;

  const total = lines.length;
  const position = lastChorusIndex / total;

  // If last chorus starts in final 40% → extend it
  if (position > 0.6) {
    for (let i = lastChorusIndex; i < lines.length; i++) {
      lines[i].type = "chorus";
    }
  }
}

function getSimilarity(str1, str2) {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  const words1 = str1.split(" ");
  const words2 = str2.split(" ");
  const set2 = new Set(words2);

  let intersection = 0;
  for (const w of words1) {
    if (set2.has(w)) intersection++;
  }

  const union = new Set([...words1, ...words2]).size;
  return union === 0 ? 0 : intersection / union;
}

function isMatch(str1, str2) {
  return getSimilarity(str1, str2) >= 0.7;
}

/* ---------------- CLEAN LINES ---------------- */

function getCleanLines(lyrics) {
  return lyrics
    .map((l, i) => ({
      idx: i,
      time: l.time,
      text: l.text,
      clean: normalize(l.text),
      type: null,
    }))
    .filter((l) => l.clean.length > 0);
}

/* ---------------- SEQUENCE MATCH ---------------- */

function matchSequence(lines, i, j, maxLen = 20) {
  let len = 0;

  while (
    i + len < lines.length &&
    j + len < lines.length &&
    j > i + len &&
    isMatch(lines[i + len].clean, lines[j + len].clean) &&
    len < maxLen
  ) {
    len++;
  }

  return len;
}

/* ---------------- FIND BEST CHORUS ---------------- */

function findBestChorusTemplate(lines) {
  const blocks = new Map();

  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const len = matchSequence(lines, i, j);

      if (len < 3) continue;

      const key = lines
        .slice(i, i + len)
        .map((l) => l.clean)
        .join("\n");

      if (!blocks.has(key)) {
        blocks.set(key, {
          template: lines.slice(i, i + len).map((l) => l.clean),
          length: len,
          occurrences: 1,
        });
      } else {
        blocks.get(key).occurrences++;
      }
    }
  }

  if (blocks.size === 0) return null;

  let best = null;
  let bestScore = -1;

  for (const block of blocks.values()) {
    // 🔥 Improved scoring
    const score = Math.pow(block.length, 1.5) * Math.pow(block.occurrences, 2);

    if (score > bestScore) {
      bestScore = score;
      best = block;
    }
  }

  return best;
}

/* ---------------- TAG CHORUSES (BLOCK BASED) ---------------- */

function tagChoruses(lines, templateData) {
  if (!templateData) return;

  const { template } = templateData;
  const tLen = template.length;

  for (let i = 0; i < lines.length; i++) {
    let matchCount = 0;

    for (let k = 0; k < tLen && i + k < lines.length; k++) {
      if (isMatch(lines[i + k].clean, template[k])) {
        matchCount++;
      } else {
        break;
      }
    }

    // Require strong sequence match
    if (matchCount >= Math.ceil(tLen * 0.7)) {
      for (let k = 0; k < matchCount; k++) {
        lines[i + k].type = "chorus";
      }
    }
  }
}

/* ---------------- SMOOTH CHORUS ---------------- */

function smoothChorus(lines) {
  for (let i = 1; i < lines.length - 1; i++) {
    if (
      !lines[i].type &&
      lines[i - 1].type === "chorus" &&
      lines[i + 1].type === "chorus"
    ) {
      lines[i].type = "chorus";
    }
  }
}

/* ---------------- BUILD SECTIONS ---------------- */

function buildSections(lines) {
  const sections = [];
  let currentSection = null;
  let verseCount = 1;

  const totalLines = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let lineType = line.type;

    if (!lineType) {
      const chorusesSeen = sections.filter((s) => s.type === "chorus").length;
      const progress = i / totalLines;

      if (chorusesSeen === 0) {
        lineType = `verse ${verseCount}`;
      } else if (chorusesSeen >= 2 && progress > 0.65 && progress < 0.85) {
        lineType = "bridge";
      } else {
        lineType = `verse ${verseCount}`;
      }
    }

    if (!currentSection || currentSection.type !== lineType) {
      if (currentSection) {
        currentSection.end = line.time;
        sections.push(currentSection);

        if (currentSection.type.startsWith("verse")) {
          verseCount++;
        }
      }

      currentSection = {
        type: lineType,
        start: line.time,
        end: null,
      };
    }
  }

  if (currentSection) {
    currentSection.end = lines[lines.length - 1].time + 10;
    sections.push(currentSection);
  }

  return sections;
}

/* ---------------- INTRO ---------------- */

function prependIntroIfNeeded(sections, firstLineTime) {
  if (firstLineTime > 8) {
    sections.unshift({
      type: "intro",
      start: 0,
      end: firstLineTime,
    });
  }
  return sections;
}

/* ---------------- MAIN ---------------- */

function detectSectionsAdvanced(lyrics) {
  if (!lyrics || !lyrics.length) return [];

  const lines = getCleanLines(lyrics);
  if (lines.length === 0) return [];

  const templateData = findBestChorusTemplate(lines);

  tagChoruses(lines, templateData);
  smoothChorus(lines);
  extendFinalChorus(lines);
  let sections = buildSections(lines);

  sections = prependIntroIfNeeded(sections, lines[0].time);

  return sections;
}

/* ---------------- EXPORT ---------------- */

module.exports = {
  detectSections: detectSectionsAdvanced,
};

// const fs = require("fs");
// const path = require("path");
// const { parseLRC } = require("./lrcParser");

// const lrcPath = path.join(__dirname, "../lyrics", "bt.lrc");

// const lrc = fs.readFileSync(lrcPath, "utf-8");

// const lyrics = parseLRC(lrc);
// // console.log(lyrics);
// const sections = detectSectionsAdvanced(lyrics);

// console.log(sections);

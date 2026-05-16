function parseLRC(lrcText) {
  const lines = lrcText.split("\n");
  const result = [];

  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/;

  for (let line of lines) {
    const match = line.match(timeRegex);
    if (!match) continue;

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const fractionalPart = match[3] || "";
    const milliseconds = fractionalPart
      ? parseInt(fractionalPart.padEnd(3, "0"), 10)
      : 0;

    const timeInSeconds = minutes * 60 + seconds + milliseconds / 1000;

    const text = line.replace(timeRegex, "").trim();

    if (!text) continue;

    result.push({
      time: timeInSeconds,
      text,
    });
  }

  return result.sort((a, b) => a.time - b.time);
}

module.exports = { parseLRC };

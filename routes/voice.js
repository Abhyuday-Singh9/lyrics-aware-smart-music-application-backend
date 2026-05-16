const crypto = require("crypto");
const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const { log } = require("../services/logger");
const { recognizeVoice } = require("../services/pythonVoice");

const router = express.Router();
const rawAudioParser = express.raw({
  limit: "5mb",
  type: ["audio/wav", "audio/wave", "audio/x-wav", "application/octet-stream"],
});
const tempDirectory = path.join(__dirname, "..", "tmp-voice");

function normalizeTranscript(text) {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPhrase(value) {
  return value
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseVoiceCommand(text) {
  if (!text) {
    return null;
  }

  const normalized = normalizeTranscript(text);
  const patterns = [
    /(?:please\s+)?(?:play|played|player|pray|clay|lay)?(?:\s+me)?\s*from\s+(.+?)\s+(?:to|too|through|thru|till|until)\s+(.+)/i,
    /from\s+(.+?)\s+(?:to|too|through|thru|till|until)\s+(.+)/i,
  ];

  let match = null;

  for (const pattern of patterns) {
    const result = normalized.match(pattern);
    if (result) {
      match = result;
      break;
    }
  }

  if (!match) {
    return null;
  }

  const start = cleanPhrase(match[1]);
  const end = cleanPhrase(match[2]);

  if (!start || !end) {
    return null;
  }

  return {
    mode: "lyrics",
    start,
    end,
  };
}

async function cleanupFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      log("ERROR", "Failed to clean up voice temp file:", error);
    }
  }
}

router.post("/", rawAudioParser, async (req, res) => {
  const audioBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!audioBuffer.length) {
    return res.status(400).json({ success: false, error: "Audio required" });
  }

  const tempFilePath = path.join(tempDirectory, `${crypto.randomUUID()}.wav`);

  try {
    await fs.mkdir(tempDirectory, { recursive: true });
    await fs.writeFile(tempFilePath, audioBuffer);

    const text = await recognizeVoice(tempFilePath);
    const parsed = parseVoiceCommand(text);

    return res.json({
      success: true,
      text,
      parsed,
    });
  } catch (error) {
    log("ERROR", "Voice recognition failed:", error);
    return res.status(500).json({
      success: false,
      error: "Voice recognition failed",
    });
  } finally {
    await cleanupFile(tempFilePath);
  }
});

module.exports = router;

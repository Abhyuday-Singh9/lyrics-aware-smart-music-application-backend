const express = require("express");
const {
  getLyricsFileName,
  getLyricsPath,
  hasLyrics,
  hasSong,
} = require("../services/mediaLibrary");
const { log } = require("../services/logger");
const { getParsedLyrics } = require("../services/queryService");

const router = express.Router();

function sendSuccess(res, data) {
  res.json({ success: true, data });
}

function sendError(res, statusCode, error, extra = {}) {
  res.status(statusCode).json({
    success: false,
    error,
    ...extra,
  });
}

router.get("/:song", (req, res) => {
  try {
    const songName = req.params.song;
    const file = getLyricsFileName(songName);
    const lrcPath = getLyricsPath(songName);

    log("INFO", "Looking for LRC at:", lrcPath);

    if (!hasSong(songName)) {
      return sendError(res, 404, "Song file not found");
    }

    if (!hasLyrics(songName)) {
      return sendError(res, 404, "LRC file not found", {
        expectedFile: file,
        fullPath: lrcPath,
      });
    }

    const parsed = getParsedLyrics(songName);

    log("INFO", "Parsed lines:", parsed.length);

    sendSuccess(res, parsed);
  } catch (err) {
    log("ERROR", "Lyrics error:", err);
    sendError(res, 500, err.message);
  }
});

module.exports = router;

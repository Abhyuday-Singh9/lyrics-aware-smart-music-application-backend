const express = require("express");

const { hasLyrics, hasSong } = require("../services/mediaLibrary");
const { log } = require("../services/logger");
const { processQuery } = require("../services/queryService");

const router = express.Router();

function sendSuccess(res, data) {
  res.json({ success: true, data });
}

function sendError(res, statusCode, message) {
  res.status(statusCode).json({ success: false, error: message });
}

function normalizeInput(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

router.post("/", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const song = typeof body.song === "string" ? body.song.trim() : "";
    const mode = normalizeInput(body.mode);
    const start = normalizeInput(body.start);
    const end = normalizeInput(body.end);
    const section = normalizeInput(body.section);
    const index = body.index;

    if (!song) {
      return sendError(res, 400, "Song required");
    }

    if (!hasSong(song)) {
      return sendError(res, 404, "Song not found");
    }

    if (!hasLyrics(song)) {
      return sendError(res, 404, "LRC not found");
    }

    const result = processQuery({
      end,
      index,
      mode,
      section,
      song,
      start,
    });

    if (!result) {
      return sendSuccess(res, { intent: "not_found" });
    }

    if (result.error) {
      return sendError(res, result.statusCode || 500, result.error);
    }

    return sendSuccess(res, result);
  } catch (err) {
    log("ERROR", "Query failed:", err);
    return sendError(res, 500, "Query failed");
  }
});

module.exports = router;

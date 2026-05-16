const express = require("express");
const { log } = require("../services/logger");
const { listSongFiles } = require("../services/songRepository");

const router = express.Router();

function sendSuccess(res, data) {
  res.json({ success: true, data });
}

function sendError(res, statusCode, message) {
  res.status(statusCode).json({ success: false, error: message });
}

router.get("/", async (req, res) => {
  try {
    const songs = await listSongFiles();

    log("INFO", "Songs found:", songs.length);

    sendSuccess(res, songs);
  } catch (err) {
    log("ERROR", "Failed to read songs:", err);
    sendError(res, 500, "Failed to read songs");
  }
});

module.exports = router;

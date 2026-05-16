const express = require("express");
const { getHistory, saveHistory } = require("../services/historyService");

const router = express.Router();

function sendSuccess(res, data) {
  res.json({ success: true, data });
}

function sendError(res, statusCode, message) {
  res.status(statusCode).json({ success: false, error: message });
}

router.post("/", async (req, res) => {
  try {
    if (!req.body.song) {
      return sendError(res, 400, "Song required");
    }

    await saveHistory(req.body);

    sendSuccess(res, { status: "saved" });
  } catch (err) {
    sendError(res, err.statusCode || 500, err.message);
  }
});

router.get("/", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    sendSuccess(res, await getHistory(limit));
  } catch (err) {
    sendError(res, 500, err.message);
  }
});

module.exports = router;

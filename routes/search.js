const express = require("express");

const { log } = require("../services/logger");
const { searchLyricsGlobally } = require("../services/globalSearchService");

const router = express.Router();

router.get("/", (req, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (!query) {
      return res.json({ success: true, data: [] });
    }

    const results = searchLyricsGlobally(query);
    return res.json({ success: true, data: results });
  } catch (error) {
    log("ERROR", "Global search failed:", error);
    return res.status(500).json({
      success: false,
      error: "Search failed",
    });
  }
});

module.exports = router;

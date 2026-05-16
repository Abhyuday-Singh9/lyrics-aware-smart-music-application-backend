const express = require("express");
const {
  addFavorite,
  addSongToPlaylist,
  createPlaylist,
  deletePlaylist,
  getLibraryState,
  removeFavorite,
  removeSongFromPlaylist,
} = require("../services/libraryService");

const router = express.Router();

function sendError(res, err) {
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message,
  });
}

function sendSuccess(res, data) {
  res.json({
    success: true,
    data,
  });
}

router.get("/", async (req, res) => {
  try {
    sendSuccess(res, await getLibraryState());
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/favorites", async (req, res) => {
  try {
    await addFavorite(req.body.song);
    sendSuccess(res, await getLibraryState());
  } catch (err) {
    sendError(res, err);
  }
});

router.delete("/favorites/:song", async (req, res) => {
  try {
    await removeFavorite(req.params.song);
    sendSuccess(res, await getLibraryState());
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/playlists", async (req, res) => {
  try {
    await createPlaylist(req.body.name || "");
    sendSuccess(res, await getLibraryState());
  } catch (err) {
    sendError(res, err);
  }
});

router.delete("/playlists/:playlistName", async (req, res) => {
  try {
    await deletePlaylist(req.params.playlistName);
    sendSuccess(res, await getLibraryState());
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/playlists/:playlistName/songs", async (req, res) => {
  try {
    await addSongToPlaylist(req.params.playlistName, req.body.song);
    sendSuccess(res, await getLibraryState());
  } catch (err) {
    sendError(res, err);
  }
});

router.delete("/playlists/:playlistName/songs/:song", async (req, res) => {
  try {
    await removeSongFromPlaylist(req.params.playlistName, req.params.song);
    sendSuccess(res, await getLibraryState());
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;

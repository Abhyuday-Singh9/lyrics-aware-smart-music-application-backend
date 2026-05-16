const { all, run } = require("./database");
const { requireSong } = require("./songRepository");

function toNullableNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

async function saveHistory(entry) {
  const song = await requireSong(entry.song);
  const {
    endedAt,
    endedAtSeconds,
    playedSeconds,
    section,
    song: _song,
    source,
    startedAt,
    startedAtSeconds,
    ...metadata
  } = entry;

  await run(
    `INSERT INTO play_history (
       song_id,
       played_at,
       playback_started_at,
       playback_ended_at,
       started_at_seconds,
       ended_at_seconds,
       played_seconds,
       section_type,
       section_start_seconds,
       section_end_seconds,
       source,
       metadata
     )
     VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      song.id,
      startedAt || null,
      endedAt || null,
      toNullableNumber(startedAtSeconds) || 0,
      toNullableNumber(endedAtSeconds),
      toNullableNumber(playedSeconds) || 0,
      section?.type || null,
      toNullableNumber(section?.start),
      toNullableNumber(section?.end),
      source || null,
      JSON.stringify(metadata),
    ],
  );
}

async function getHistory(limit = 50) {
  return all(
    `SELECT
       play_history.id,
       songs.filename AS song,
       play_history.played_at AS timestamp,
       play_history.playback_started_at AS startedAt,
       play_history.playback_ended_at AS endedAt,
       play_history.started_at_seconds AS startedAtSeconds,
       play_history.ended_at_seconds AS endedAtSeconds,
       play_history.played_seconds AS playedSeconds,
       play_history.section_type AS sectionType,
       play_history.section_start_seconds AS sectionStartSeconds,
       play_history.section_end_seconds AS sectionEndSeconds,
       play_history.source,
       play_history.metadata
     FROM play_history
     JOIN songs ON songs.id = play_history.song_id
     ORDER BY play_history.played_at DESC
     LIMIT ?`,
    [limit],
  );
}

module.exports = { getHistory, saveHistory };

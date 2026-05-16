const store = new Map();

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 100;

function isExpired(entry) {
  return entry.expiresAt !== null && Date.now() > entry.expiresAt;
}

function enforceMaxEntries(maxEntries = DEFAULT_MAX_ENTRIES) {
  while (store.size > maxEntries) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }
}

function get(key) {
  const entry = store.get(key);

  if (!entry) {
    return undefined;
  }

  if (isExpired(entry)) {
    store.delete(key);
    return undefined;
  }

  return entry.value;
}

function set(key, value, options = {}) {
  const ttlMs =
    typeof options.ttlMs === "number" ? options.ttlMs : DEFAULT_TTL_MS;
  const maxEntries =
    typeof options.maxEntries === "number"
      ? options.maxEntries
      : DEFAULT_MAX_ENTRIES;

  store.set(key, {
    expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null,
    value,
  });
  enforceMaxEntries(maxEntries);
  return value;
}

module.exports = {
  get,
  set,
};

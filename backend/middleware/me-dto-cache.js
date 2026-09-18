/**
 * Isolate-local /api/me response cache — React shell + classic embed often
 * hit /me twice within a second on the same Worker.
 */
const TTL_MS = Math.max(5_000, Number(process.env.ME_CACHE_MS || 20_000));

/** @type {Map<string, { at: number, dto: object }>} */
const byUser = new Map();

function peekMeDto(userId) {
  if (!userId) return null;
  const row = byUser.get(userId);
  if (!row) return null;
  if (Date.now() - row.at > TTL_MS) {
    byUser.delete(userId);
    return null;
  }
  return row.dto;
}

function putMeDto(userId, dto) {
  if (!userId || !dto) return;
  byUser.set(userId, { at: Date.now(), dto });
  if (byUser.size > 500) {
    const cutoff = Date.now() - TTL_MS;
    for (const [id, row] of byUser) {
      if (row.at < cutoff) byUser.delete(id);
    }
  }
}

function forgetMeDto(userId) {
  if (userId) byUser.delete(userId);
}

module.exports = { peekMeDto, putMeDto, forgetMeDto };

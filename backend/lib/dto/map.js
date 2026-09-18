/**
 * Map / device payload helpers. Keeps password hashes and internal store
 * fields off the wire if they ever appear on nested objects.
 */
function toMapPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  return payload;
}

function toDeviceDto(device) {
  if (!device || typeof device !== "object") return device;
  const { passwordHash, ...rest } = device;
  return rest;
}

module.exports = { toMapPayload, toDeviceDto };

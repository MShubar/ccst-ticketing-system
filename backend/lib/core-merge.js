/**
 * Shared CoreGate list-merge rule (tickets/users/…). Kept outside the DO
 * module so smoke tests can lock the CAS behaviour without Workers.
 */
function applyListEdits(currentList, changedEntries, deletedIds) {
  const out = new Map((currentList || []).map((row) => [row.id, row]));
  for (const id of deletedIds || []) out.delete(id);
  for (const item of changedEntries || []) {
    let id;
    let row;
    if (Array.isArray(item) && item.length >= 2) {
      id = item[0];
      row = item[1];
    } else if (item && item.id != null && item.row) {
      id = item.id;
      row = item.row;
    } else {
      continue;
    }
    if (id == null || !row) continue;
    const existing = out.get(id);
    const existingAt = existing?.updatedAt ? String(existing.updatedAt) : "";
    const nextAt = row?.updatedAt ? String(row.updatedAt) : "";
    // Incoming rows without updatedAt never replace a stamped row.
    if (existing && existingAt && (!nextAt || existingAt > nextAt)) {
      continue;
    }
    out.set(id, row);
  }
  return [...out.values()];
}

module.exports = { applyListEdits };

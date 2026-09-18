/**
 * Session /me response shape. Keeps auth bootstrap payload in one place.
 */
const { toPublicUser } = require("./user");
const store = require("../../data/store");

function toMeDto(db, user) {
  const classRow = store.getClass(db, user.classId);
  return {
    user: toPublicUser(user, db),
    class: classRow,
    announcement: classRow?.announcement || null,
    meta: {
      ...db.meta,
      cohort: classRow ? classRow.name : db.meta.cohort,
      trainer: classRow
        ? toPublicUser(store.classInstructor(db, classRow.id), db)?.fullName
        : db.meta.trainer
    },
    requesters: db.requesters,
    // "memory" means nothing anyone saves will survive. The UI warns on it
    // rather than letting a class lose its work silently.
    storage: store.storageMode()
  };
}

module.exports = { toMeDto };

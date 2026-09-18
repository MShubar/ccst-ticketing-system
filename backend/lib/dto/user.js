/**
 * Public user shape for API responses. Delegates to store.publicUser so auth,
 * roster, and ticket assignee stay one definition.
 */
const store = require("../../data/store");

function toPublicUser(user, db) {
  return store.publicUser(user, db);
}

function toPublicUserList(users, db) {
  return (users || []).map((u) => toPublicUser(u, db));
}

module.exports = { toPublicUser, toPublicUserList };

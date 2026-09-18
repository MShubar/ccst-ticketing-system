const { badRequest } = require("../../errors/AppError");

/**
 * @param {unknown} body
 * @returns {{ username: string, fullName: string, password: string }}
 */
function parseAddStudentBody(body) {
  const raw = body && typeof body === "object" ? body : {};
  const username = String(raw.username || "").trim();
  const fullName = String(raw.fullName || "").trim();
  const password = String(raw.password || "");
  if (!username) throw badRequest("Username is required.");
  if (!fullName) throw badRequest("Full name is required.");
  if (password.length < 6) throw badRequest("Password must be at least 6 characters.");
  return { username, fullName, password };
}

/**
 * @param {unknown} body
 * @returns {{ password: string }}
 */
function parseResetPasswordBody(body) {
  const password = String(body && typeof body === "object" ? body.password || "" : "");
  if (password.length < 6) throw badRequest("Password must be at least 6 characters.");
  return { password };
}

module.exports = { parseAddStudentBody, parseResetPasswordBody };

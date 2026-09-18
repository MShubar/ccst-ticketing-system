/**
 * HTTP-aware error for services and routes. The global error handler turns
 * this into `{ error, ...extra }` with the right status.
 */
class AppError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.extra = extra;
  }
}

function badRequest(message, extra) {
  return new AppError(400, message, extra);
}

function unauthorized(message = "Sign in required.") {
  return new AppError(401, message);
}

function forbidden(message = "Only the instructor can do this.") {
  return new AppError(403, message);
}

function notFound(message) {
  return new AppError(404, message);
}

function conflict(message, extra) {
  return new AppError(409, message, extra);
}

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict
};

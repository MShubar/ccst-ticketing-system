const { AppError } = require("../errors/AppError");

/**
 * Last middleware: map AppError / err.status into JSON. Unknown errors stay 500.
 * Expected client errors are not dumped as full stacks.
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err instanceof AppError ? err.status : err.status || 500;
  if (!(err instanceof AppError) || status >= 500) {
    console.error(err);
    try {
      const ops = require("../lib/ops-metrics");
      ops.noteRequest({
        method: req?.method || "?",
        path: req?.path || "?",
        ms: 0,
        status: status >= 500 ? status : 500
      });
    } catch {
      /* ignore */
    }
  }
  const body = {
    error: err.message || "Save failed. Try again.",
    ...(err.extra && typeof err.extra === "object" ? err.extra : {})
  };
  res.status(status).json(body);
}

module.exports = { errorHandler };

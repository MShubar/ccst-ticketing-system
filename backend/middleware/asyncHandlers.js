/**
 * Express 4 does not catch rejected promises from async route handlers.
 * Patch get/post/… so a thrown/rejected error reaches next(err).
 */
function patchAsyncMethods(appOrRouter) {
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    const orig = appOrRouter[method].bind(appOrRouter);
    appOrRouter[method] = function patched(...args) {
      const last = args[args.length - 1];
      if (typeof last === "function") {
        args[args.length - 1] = (req, res, next) => {
          Promise.resolve(last(req, res, next)).catch(next);
        };
      }
      return orig(...args);
    };
  }
  return appOrRouter;
}

module.exports = { patchAsyncMethods };

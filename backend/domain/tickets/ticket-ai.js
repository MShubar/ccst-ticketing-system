/**
 * Classroom ticket AI facade — generation + review.
 * Prefer requiring ticket-gen / ticket-review directly for new code.
 */
const gen = require("./ticket-gen");
const review = require("./ticket-review");

module.exports = {
  ...gen,
  expectedPriorityFor: review.expectedPriorityFor,
  reviewTicket: review.reviewTicket,
  toReviewRecord: review.toReviewRecord,
  labFaultFixed: review.labFaultFixed,
  isLabMapTicket: review.isLabMapTicket
};

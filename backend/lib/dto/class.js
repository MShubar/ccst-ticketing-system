/**
 * Class liveboard / attendance response shapes.
 */

function toLiveboardDto({ day, presentCount, absentCount, openClass, breachedClass, rows }) {
  return {
    day,
    presentCount,
    absentCount,
    openClass,
    breachedClass,
    rows: (rows || []).map((row) => ({
      ...row,
      student: row.student
    }))
  };
}

function toAttendanceDto(attendance) {
  if (!attendance || typeof attendance !== "object") return attendance;
  return {
    day: attendance.day,
    present: attendance.present || [],
    absent: attendance.absent || []
  };
}

function toAiReviewBatchDto({ reviewed, skipped, warning, ready, mode }) {
  const out = { reviewed, warning, ready, mode };
  if (skipped !== undefined) out.skipped = skipped;
  return out;
}

module.exports = { toLiveboardDto, toAttendanceDto, toAiReviewBatchDto };

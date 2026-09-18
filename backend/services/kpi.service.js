const store = require("../data/store");
const grading = require("../domain/tickets/grading");

function studentTicketRows(db, student) {
  return store
    .classTickets(db, student.classId, { includeArchive: true })
    .filter((t) => t.assigneeId === student.id)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((t) => store.enrichTicket(db, t, student));
}

function studentReport(db, student) {
  const kpis = store.computeKpis(db, student, "mine");
  const tickets = studentTicketRows(db, student);
  return {
    student: store.publicUser(student, db),
    kpis,
    tickets,
    grade: grading.gradeStudent(kpis, tickets)
  };
}

function sendPdf(res, buffer, filename) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", buffer.length);
  res.send(buffer);
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

module.exports = { studentTicketRows, studentReport, sendPdf, csvEscape };

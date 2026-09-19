import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import styled from "styled-components";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Skeleton } from "@/components/common/Skeleton";
import Loader from "@/components/common/Loader";
import OptimisticLink from "@/components/common/OptimisticLink";
import { Btn, Card, Field, Hint } from "@/components/ui/primitives";
import { ROUTES } from "@/constants/routes";
import { usePageReady } from "@/nav/PageReadyContext";
import { useUsers } from "@/services/queries/classroom";
import { useAuthStore } from "@/store/auth/authStore";
import { api } from "@/api/client";
import { colors } from "@/theme/colors";
import { downloadFile } from "@/utils/downloadFile";
import { formatWhen } from "@/utils/format";
import { isInstructorRole } from "@/utils/ticketDisplay";

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th {
    text-align: left;
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: ${colors.muted};
    padding: 10px 12px;
    border-bottom: 1px solid ${colors.line};
  }

  td {
    padding: 10px 12px;
    border-bottom: 1px solid ${colors.line};
    vertical-align: middle;
  }
`;

const Grid2 = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 800px) {
    grid-template-columns: 1fr;
  }
`;

const MixList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const MixRow = styled.li<{ $off?: boolean }>`
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
  opacity: ${({ $off }) => ($off ? 0.55 : 1)};
`;

const TimelinePanel = styled.div`
  border-top: 1px solid ${colors.line};
  padding: 16px 20px 20px;
`;

const BoardRow = styled.tr<{ $stuck?: boolean }>`
  background: ${({ $stuck }) => ($stuck ? colors.coralSoft : "transparent")};
`;

type UserRow = {
  id: string;
  fullName: string;
  username: string;
  role: string;
  level: number;
};

export default function TeamPage() {
  const user = useAuthStore((s) => s.user);
  const classInfo = useAuthStore((s) => s.classInfo);
  const announcement = useAuthStore((s) => s.announcement);
  const instructor = isInstructorRole(user);
  const { data: users, isLoading, error } = useUsers();
  const { markReady } = usePageReady();
  const qc = useQueryClient();
  const [flash, setFlash] = useState("");
  const [studentMsg, setStudentMsg] = useState("");
  const [announceMsg, setAnnounceMsg] = useState("");
  const [slaMsg, setSlaMsg] = useState("");
  const [genMsg, setGenMsg] = useState("");
  const [timeline, setTimeline] = useState<{ name: string; items: Array<Record<string, string>> } | null>(
    null
  );
  const mixSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: attendance } = useQuery({
    queryKey: ["class", "attendance"],
    queryFn: async () => {
      const { data } = await api.get("/class/attendance");
      return data as { day: string; present: UserRow[]; absent: UserRow[] };
    },
    enabled: instructor,
  });

  const { data: liveboard } = useQuery({
    queryKey: ["class", "liveboard"],
    queryFn: async () => {
      const { data } = await api.get("/class/liveboard");
      return data as Record<string, unknown>;
    },
    enabled: instructor,
  });

  const { data: genPlan } = useQuery({
    queryKey: ["tickets", "generate", "status"],
    queryFn: async () => {
      const { data } = await api.get("/tickets/generate/status");
      return data as {
        ready: boolean;
        perStudent: number;
        families: Array<{
          kind: string;
          many: string;
          category: string;
          plants?: string;
          default: number;
          max: number;
        }>;
        mix: Record<string, number>;
        model?: string;
      };
    },
    enabled: instructor,
  });

  const [mix, setMix] = useState<Record<string, number>>({});

  useEffect(() => {
    if (genPlan?.mix) setMix({ ...genPlan.mix });
  }, [genPlan?.mix]);

  useEffect(() => {
    if (users || error || (!isLoading && !users)) markReady();
  }, [users, error, isLoading, markReady]);

  const list = (users as UserRow[]) || [];
  const students = list.filter((u) => u.role === "technician");
  const instructors = list.filter((u) => u.role === "instructor");
  const className = user?.className || classInfo?.name || "your class";

  const scheduleMixSave = useCallback((next: Record<string, number>) => {
    if (mixSaveTimer.current) clearTimeout(mixSaveTimer.current);
    mixSaveTimer.current = setTimeout(() => {
      api.put("/tickets/mix", { mix: next }).catch(() => {});
    }, 700);
  }, []);

  const mixStats = useMemo(() => {
    const families = genPlan?.families || [];
    const byKind = Object.fromEntries(families.map((f) => [f.kind, f]));
    let total = 0;
    let cable = 0;
    let hardware = 0;
    let device = 0;
    for (const [kind, count] of Object.entries(mix)) {
      if (!count) continue;
      total += count;
      const f = byKind[kind];
      if (f?.plants === "cable") cable += count;
      if (f?.plants === "hardware") hardware += count;
      if (f?.plants === "device") device += count;
    }
    return { total, cable, hardware, device };
  }, [mix, genPlan?.families]);

  const roster = (
    <Card style={{ padding: 0, marginBottom: 20 }} id="class-roster">
      <div
        style={{
          padding: "16px 20px 8px",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>Class roster</h3>
          <Hint style={{ margin: "4px 0 0" }}>
            {students.length} student{students.length === 1 ? "" : "s"} · {instructors.length} instructor
            {instructors.length === 1 ? "" : "s"}
          </Hint>
        </div>
        {instructor ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn
              type="button"
              $variant="secondary"
              disabled={!students.length}
              onClick={async (ev) => {
                const force = ev.shiftKey;
                if (
                  !confirm(
                    force
                      ? "AI-review ALL tickets in the class, overwriting existing reviews?"
                      : "AI-review every unreviewed ticket in the class?\n\n(Shift-click to overwrite existing reviews too.)"
                  )
                )
                  return;
                try {
                  const { data: res } = await api.post<{ reviewed: number; warning?: string }>(
                    "/class/review/ai",
                    { force }
                  );
                  toast.success(
                    `Reviewed ${res.reviewed} ticket(s).${res.warning ? ` ${res.warning}` : ""}`
                  );
                  qc.invalidateQueries();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed");
                }
              }}
            >
              AI-review class
            </Btn>
            <Btn
              type="button"
              $variant="secondary"
              disabled={!students.length}
              onClick={() => downloadFile("/class/export.csv", "class-kpis.csv").catch((e) => toast.error(e.message))}
            >
              Export CSV
            </Btn>
            <Btn
              type="button"
              $variant="secondary"
              disabled={!students.length}
              onClick={() => downloadFile("/class/kpis/pdf", "kpi-class.pdf").catch((e) => toast.error(e.message))}
            >
              Download all KPI PDFs
            </Btn>
          </div>
        ) : null}
      </div>
      <Table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Role</th>
            <th>Level</th>
            {instructor ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {[...instructors, ...students].map((u) => (
            <tr key={u.id}>
              <td>{u.fullName}</td>
              <td style={{ fontFamily: "monospace" }}>{u.username}</td>
              <td>{u.role}</td>
              <td>L{u.level}</td>
              {instructor && u.role === "technician" ? (
                <td style={{ whiteSpace: "nowrap" }}>
                  <Btn
                    type="button"
                    onClick={async (ev) => {
                      const force = ev.shiftKey;
                      if (
                        !confirm(
                          force
                            ? `Overwrite AI/instructor reviews for every ticket assigned to ${u.fullName}?`
                            : `Ask AI to review every unreviewed ticket for ${u.fullName}?\n\n(Shift-click to overwrite existing reviews too.)`
                        )
                      )
                        return;
                      try {
                        const { data: res } = await api.post<{ reviewed: number; skipped?: number; warning?: string }>(
                          `/students/${u.id}/review/ai`,
                          { force }
                        );
                        toast.success(
                          `Reviewed ${res.reviewed} ticket(s)${res.skipped ? `, skipped ${res.skipped} already reviewed` : ""}.`
                        );
                        qc.invalidateQueries();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed");
                      }
                    }}
                  >
                    AI review
                  </Btn>
                  <Btn
                    type="button"
                    onClick={async () => {
                      try {
                        const { data } = await api.get<{ items: Array<Record<string, string>> }>(
                          `/students/${u.id}/activity`
                        );
                        setTimeline({ name: u.fullName, items: data.items || [] });
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed");
                      }
                    }}
                  >
                    Timeline
                  </Btn>
                  <Btn
                    type="button"
                    onClick={() =>
                      downloadFile(`/students/${u.id}/kpis/pdf`, `kpi-${u.username}.pdf`).catch((e) =>
                        toast.error(e.message)
                      )
                    }
                  >
                    KPI PDF
                  </Btn>
                  <Btn
                    type="button"
                    onClick={async () => {
                      const password = prompt("New password (min 6 characters):");
                      if (!password) return;
                      try {
                        await api.patch(`/students/${u.id}/password`, { password });
                        toast.success("Password updated.");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed");
                      }
                    }}
                  >
                    Reset password
                  </Btn>
                  <Btn
                    type="button"
                    onClick={async () => {
                      if (!confirm("Remove this student from the class?")) return;
                      try {
                        await api.delete(`/students/${u.id}`);
                        qc.invalidateQueries({ queryKey: ["users"] });
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed");
                      }
                    }}
                  >
                    Remove
                  </Btn>
                </td>
              ) : instructor ? (
                <td />
              ) : null}
            </tr>
          ))}
          {!list.length ? (
            <tr>
              <td colSpan={instructor ? 5 : 4}>No people in this class yet.</td>
            </tr>
          ) : null}
        </tbody>
      </Table>
      {timeline ? (
        <TimelinePanel id="timeline-panel">
          <h4 style={{ margin: "0 0 8px" }}>Activity · {timeline.name}</h4>
          <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: 13 }}>
            {timeline.items.length
              ? timeline.items.map((a, i) => (
                  <li key={i}>
                    <span style={{ color: colors.muted }}>{formatWhen(a.at)}</span> ·{" "}
                    <span style={{ fontFamily: "monospace" }}>{a.type}</span> — {a.summary}
                    {a.ticketId ? (
                      <>
                        {" "}
                        <OptimisticLink to={`${ROUTES.TICKETS}/${a.ticketId}`}>{a.ticketId}</OptimisticLink>
                      </>
                    ) : null}
                  </li>
                ))
              : <li style={{ color: colors.muted }}>No activity logged for this student yet.</li>}
          </ul>
        </TimelinePanel>
      ) : null}
    </Card>
  );

  if (isLoading && !users) {
    return (
      <Loader variant="card" caption="Loading team…" useSkeleton>
        <Skeleton as="lines" count={6} width="100%" gap="12px" />
      </Loader>
    );
  }
  if (error) {
    return (
      <Card>
        <p style={{ color: colors.coral, margin: 0 }}>Could not load team.</p>
      </Card>
    );
  }

  if (!instructor) {
    return (
      <>
        <Hint style={{ marginBottom: 12 }}>{className}</Hint>
        {roster}
      </>
    );
  }

  const slaPolicy = (classInfo?.slaPolicy || {}) as Record<
    string,
    { acknowledgeMinutes?: number; resolveHours?: number; description?: string }
  >;

  const onAddStudent = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setStudentMsg("");
    try {
      const { data: created } = await api.post<UserRow>("/students", {
        fullName: data.get("fullName"),
        username: data.get("username"),
        password: data.get("password"),
      });
      setFlash(`Added ${created.fullName} (${created.username}). They can sign in now.`);
      e.currentTarget.reset();
      qc.invalidateQueries({ queryKey: ["users"] });
      document.getElementById("class-roster")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setStudentMsg(err instanceof Error ? err.message : "Failed");
    }
  };

  const rows = (liveboard?.rows as Array<Record<string, unknown>>) || [];

  return (
    <>
      <Hint style={{ marginBottom: 12 }}>{className}</Hint>

      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 8px" }}>Class announcement</h3>
        <form
          style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}
          onSubmit={async (e) => {
            e.preventDefault();
            const text = new FormData(e.currentTarget).get("text");
            try {
              const { data: res } = await api.put<{ announcement: { text?: string } | null }>(
                "/class/announcement",
                { text }
              );
              setAnnounceMsg(res.announcement ? "Announcement saved." : "Announcement cleared.");
            } catch (err) {
              setAnnounceMsg(err instanceof Error ? err.message : "Failed");
            }
          }}
        >
          <Field style={{ flex: 1, minWidth: 220, margin: 0 }}>
            <label>Message</label>
            <input name="text" maxLength={280} defaultValue={announcement?.text || ""} />
          </Field>
          <Btn type="submit" $variant="teal">Save note</Btn>
          <Btn
            type="button"
            $variant="secondary"
            onClick={(e) => {
              const form = (e.target as HTMLElement).closest("form");
              const input = form?.querySelector<HTMLInputElement>('[name="text"]');
              if (input) input.value = "";
              form?.requestSubmit();
            }}
          >
            Clear
          </Btn>
        </form>
        {announceMsg ? <Hint style={{ marginTop: 10 }}>{announceMsg}</Hint> : null}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 8px" }}>Class SLA</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const policy: Record<string, unknown> = {};
            for (const key of ["critical", "high", "medium", "low"]) {
              policy[key] = {
                acknowledgeMinutes: Number(fd.get(`ack-${key}`)),
                resolveHours: Number(fd.get(`resolve-${key}`)),
                description: String(fd.get(`desc-${key}`) || ""),
              };
            }
            try {
              await api.put("/class/sla", { slaPolicy: policy });
              setSlaMsg("SLA saved for this class.");
            } catch (err) {
              setSlaMsg(err instanceof Error ? err.message : "Failed");
            }
          }}
        >
          <Table>
            <thead>
              <tr>
                <th>Priority</th>
                <th>Response (minutes)</th>
                <th>Resolve (hours)</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {["critical", "high", "medium", "low"].map((key) => {
                const row = slaPolicy[key] || {};
                return (
                  <tr key={key}>
                    <td style={{ textTransform: "capitalize" }}>{key}</td>
                    <td>
                      <input
                        className="mono"
                        name={`ack-${key}`}
                        type="number"
                        min={1}
                        max={1440}
                        required
                        defaultValue={Number(row.acknowledgeMinutes) || ""}
                        style={{ width: "6rem" }}
                      />
                    </td>
                    <td>
                      <input
                        name={`resolve-${key}`}
                        type="number"
                        min={1}
                        max={168}
                        required
                        defaultValue={Number(row.resolveHours) || ""}
                        style={{ width: "6rem" }}
                      />
                    </td>
                    <td>
                      <input
                        name={`desc-${key}`}
                        maxLength={200}
                        defaultValue={row.description || ""}
                        style={{ width: "100%", minWidth: "12rem" }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Btn type="submit" $variant="teal">Save SLA</Btn>
            {slaMsg ? <Hint style={{ margin: 0 }}>{slaMsg}</Hint> : null}
          </div>
        </form>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 8px" }}>Live class board</h3>
        <Hint style={{ margin: "0 0 12px" }}>
          {(liveboard?.day as string) || attendance?.day || "—"} · Present{" "}
          <strong>{(liveboard?.presentCount as number) ?? attendance?.present?.length ?? 0}</strong> · Absent{" "}
          <strong>{(liveboard?.absentCount as number) ?? attendance?.absent?.length ?? 0}</strong> · Open{" "}
          <strong>{(liveboard?.openClass as string) ?? "—"}</strong> · Past SLA{" "}
          <strong>{(liveboard?.breachedClass as string) ?? "—"}</strong>
        </Hint>
        <div style={{ overflow: "auto" }}>
          <Table>
            <thead>
              <tr>
                <th>Student</th>
                <th>In</th>
                <th>Open</th>
                <th>Past SLA</th>
                <th>No priority</th>
                <th>Review left</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length
                ? rows.map((row, i) => {
                    const student = row.student as UserRow;
                    return (
                      <BoardRow key={i} $stuck={Boolean(row.stuck)}>
                        <td>
                          {student.fullName}
                          <div style={{ fontSize: 12, color: colors.muted, fontFamily: "monospace" }}>
                            {student.username}
                          </div>
                        </td>
                        <td>{row.present ? "Yes" : "—"}</td>
                        <td>{row.open as number}</td>
                        <td style={{ color: row.breached ? colors.coral : undefined }}>{row.breached as number}</td>
                        <td>{row.unprioritized as number}</td>
                        <td>{row.reviewPending as number}</td>
                        <td>
                          {row.stuck
                            ? <span style={{ padding: "2px 8px", borderRadius: 999, background: colors.coral, color: "#fff", fontSize: 11 }}>Needs attention</span>
                            : row.open
                              ? "Working"
                              : "Clear"}
                        </td>
                      </BoardRow>
                    );
                  })
                : (
                  <tr>
                    <td colSpan={7} style={{ color: colors.muted }}>No students in the class yet.</td>
                  </tr>
                )}
            </tbody>
          </Table>
        </div>
        <Hint style={{ marginTop: 10 }}>Needs attention: idle &gt; 45 min or past SLA.</Hint>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 8px" }}>Attendance today</h3>
        <Hint style={{ margin: "0 0 12px" }}>{attendance?.day || "—"}</Hint>
        <Grid2>
          <div>
            <p><strong>Present ({attendance?.present?.length || 0})</strong></p>
            <ul style={{ fontSize: 13 }}>
              {(attendance?.present || []).map((u) => (
                <li key={u.id}>
                  {u.fullName}{" "}
                  <span style={{ color: colors.muted, fontFamily: "monospace" }}>{u.username}</span>
                </li>
              ))}
              {!attendance?.present?.length ? <li style={{ color: colors.muted }}>Nobody has signed in yet today.</li> : null}
            </ul>
          </div>
          <div>
            <p><strong>Not seen ({attendance?.absent?.length || 0})</strong></p>
            <ul style={{ fontSize: 13 }}>
              {(attendance?.absent || []).map((u) => (
                <li key={u.id}>
                  {u.fullName}{" "}
                  <span style={{ color: colors.muted, fontFamily: "monospace" }}>{u.username}</span>
                </li>
              ))}
              {!attendance?.absent?.length ? <li style={{ color: colors.muted }}>All students have signed in.</li> : null}
            </ul>
          </div>
        </Grid2>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px" }}>Add a student</h3>
        <form
          onSubmit={onAddStudent}
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            alignItems: "end",
          }}
        >
          <Field><label>Full name</label><input name="fullName" required /></Field>
          <Field><label>Username</label><input name="username" required placeholder="firstname.lastname" /></Field>
          <Field><label>Password</label><input name="password" type="password" required minLength={6} /></Field>
          <Btn type="submit" $variant="teal">Add student</Btn>
        </form>
        <Hint style={{ marginTop: 12, color: flash ? colors.ok : undefined }}>
          {flash || studentMsg}
        </Hint>
      </Card>

      {roster}

      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 8px" }}>Generate a workload with AI</h3>
        <fieldset style={{ border: `1px solid ${colors.line}`, borderRadius: 8, padding: 12 }}>
          <legend>Choose the issues</legend>
          <MixList>
            {(genPlan?.families || []).map((f) => {
              const count = mix[f.kind] ?? f.default;
              const on = count > 0;
              return (
                <MixRow key={f.kind} $off={!on}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const next = { ...mix };
                        if (e.target.checked) next[f.kind] = Math.max(1, next[f.kind] || f.default);
                        else next[f.kind] = 0;
                        setMix(next);
                        scheduleMixSave(next);
                      }}
                    />
                    <span>{f.many.charAt(0).toUpperCase() + f.many.slice(1)}</span>
                  </label>
                  <span style={{ fontSize: 12, color: colors.muted }}>{f.category}</span>
                  <input
                    type="number"
                    min={0}
                    max={f.max}
                    value={on ? count : f.default}
                    disabled={!on}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(f.max, Math.floor(Number(e.target.value) || 0)));
                      const next = { ...mix, [f.kind]: v };
                      if (v === 0) next[f.kind] = 0;
                      setMix(next);
                      scheduleMixSave(next);
                    }}
                    aria-label={`How many ${f.many} per student`}
                    style={{ width: 64 }}
                  />
                </MixRow>
              );
            })}
          </MixList>
          <p style={{ margin: "8px 0 0", fontWeight: 600 }}>
            {mixStats.total
              ? `${mixStats.total} tickets per student · ${students.length} students · ${mixStats.total * students.length} tickets in all`
              : "Nothing selected — tick at least one kind of call."}
          </p>
          {mixStats.cable || mixStats.hardware || mixStats.device ? (
            <Hint style={{ marginTop: 8 }}>
              Lab faults:{" "}
              {[
                mixStats.cable ? `${mixStats.cable} cable` : "",
                mixStats.hardware ? `${mixStats.hardware} hardware` : "",
                mixStats.device ? `${mixStats.device} device` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </Hint>
          ) : null}
        </fieldset>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
          <Btn
            type="button"
            $variant="teal"
            disabled={!students.length}
            onClick={async () => {
              const perStudent = mixStats.total;
              if (!perStudent) {
                setGenMsg("Tick at least one kind of call first.");
                return;
              }
              const total = students.length * perStudent;
              if (!confirm(`Write ${perStudent} tickets for each of ${students.length} students (${total} tickets)?`))
                return;
              setGenMsg("");
              const parts: string[] = [];
              for (let i = 0; i < students.length; i++) {
                const student = students[i];
                setGenMsg(`Writing tickets for ${student.fullName}…`);
                try {
                  const { data: result } = await api.post<Record<string, unknown>>("/tickets/generate", {
                    studentId: student.id,
                    mix,
                    replace: false,
                  });
                  parts.push(`${result.created || 0} for ${student.fullName}`);
                } catch (err) {
                  parts.push(`failed ${student.fullName}`);
                }
              }
              setGenMsg(parts.join(" · "));
              qc.invalidateQueries({ queryKey: ["tickets"] });
            }}
          >
            Generate {mixStats.total || genPlan?.perStudent || 0} tickets per student
          </Btn>
          <Btn
            type="button"
            $variant="danger"
            style={{ marginLeft: "auto" }}
            onClick={async () => {
              if (!confirm("Remove every ticket in this class? Comments and history go with them and this cannot be undone."))
                return;
              try {
                const { data: result } = await api.delete<{ removed: number }>("/tickets");
                setGenMsg(`${result.removed} tickets removed`);
                qc.invalidateQueries({ queryKey: ["tickets"] });
              } catch (err) {
                setGenMsg(err instanceof Error ? err.message : "Failed");
              }
            }}
          >
            Remove all tickets
          </Btn>
          <Btn
            type="button"
            $variant="secondary"
            title="Move old closed tickets out of the hot database"
            onClick={async () => {
              try {
                const { data: result } = await api.post<Record<string, number>>("/tickets/compact", {
                  force: true,
                });
                setGenMsg(
                  `Hot tickets ${result.hotBefore} → ${result.hotAfter} (archived ${result.archivedThisPass}; archive holds ${result.archiveTotal}).`
                );
              } catch (err) {
                setGenMsg(err instanceof Error ? err.message : "Failed");
              }
            }}
          >
            Compact storage
          </Btn>
        </div>
        {genMsg ? <Hint style={{ marginTop: 12 }}>{genMsg}</Hint> : null}
      </Card>
    </>
  );
}

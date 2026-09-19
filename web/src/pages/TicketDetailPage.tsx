import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import styled from "styled-components";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Skeleton } from "@/components/common/Skeleton";
import Loader from "@/components/common/Loader";
import { Btn, Card, Field, Hint } from "@/components/ui/primitives";
import { usePageReady } from "@/nav/PageReadyContext";
import { useTicket, useUsers } from "@/services/queries/classroom";
import { useAuthStore } from "@/store/auth/authStore";
import { colors } from "@/theme/colors";
import { formatWhen } from "@/utils/format";
import {
  commentAuthor,
  isInstructorRole,
  priorityColor,
  priorityLabel,
  reviewColor,
  reviewLabel,
  slaLine,
  statusColor,
} from "@/utils/ticketDisplay";

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 14px;
`;

const Badge = styled.span<{ $bg: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;
  background: ${({ $bg }) => $bg};
  color: ${colors.white};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const SlaText = styled.span<{ $bad?: boolean; $pending?: boolean }>`
  font-size: 13px;
  color: ${({ $bad, $pending }) =>
    $pending ? colors.muted : $bad ? colors.coral : colors.ok};
`;

const Comments = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Comment = styled.div<{ $internal?: boolean }>`
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ $internal }) => ($internal ? colors.paper2 : colors.white)};
  border: 1px solid ${colors.line};
  font-size: 13px;
`;

const CheckLabel = styled.label`
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 4px 0;
  font-size: 12px;
  color: ${colors.muted};
`;

type Ticket = Record<string, unknown> & {
  id: string;
  title: string;
  description: string;
  status: string;
  priority?: string | null;
  assigneeId?: string | null;
  tags: string[];
  csat?: number | null;
  escalationLevel: number;
  channel: string;
  createdAt: string;
  requester?: { name?: string; department?: string };
  assignee?: { fullName?: string };
  sla?: { pending?: boolean; breached?: boolean };
  review?: Record<string, unknown>;
  comments?: Array<Record<string, unknown>>;
};

export default function TicketDetailPage() {
  const { id = "" } = useParams();
  const user = useAuthStore((s) => s.user);
  const instructor = isInstructorRole(user);
  const { data: ticket, isLoading, error } = useTicket(id);
  const { data: users } = useUsers();
  const qc = useQueryClient();
  const { markReady } = usePageReady();
  const [busy, setBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState("");

  useEffect(() => {
    if (ticket || error || (!isLoading && !ticket)) markReady();
  }, [ticket, error, isLoading, markReady]);

  const invalidateLists = () => {
    qc.invalidateQueries({ queryKey: ["tickets"] });
  };

  const invalidateTicket = () => {
    qc.invalidateQueries({ queryKey: queryKeys.ticket(id) });
    invalidateLists();
  };

  /** Authoritative write response — do not refetch detail (edge cache can briefly win). */
  const applyTicket = (next: Record<string, unknown>) => {
    qc.setQueryData(queryKeys.ticket(id), next);
    invalidateLists();
  };

  if (isLoading && !ticket) {
    return (
      <Loader variant="card" caption="Loading ticket…" useSkeleton>
        <Skeleton as="lines" count={5} width="100%" gap="10px" />
      </Loader>
    );
  }
  if (error || !ticket) {
    return (
      <Card>
        <p style={{ color: colors.coral, margin: 0 }}>Could not load ticket.</p>
      </Card>
    );
  }

  const t = ticket as Ticket;
  const technicians =
    (users as Array<{ id: string; role: string; fullName: string }> | undefined)?.filter(
      (u) => u.role === "technician" || u.role === "instructor"
    ) || [];

  const onSaveTicket = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newAssignee = (fd.get("assigneeId") as string) || null;
    const oldAssignee = t.assigneeId || null;
    const body: Record<string, unknown> = {
      status: fd.get("status"),
      priority: fd.get("priority"),
      assigneeId: newAssignee || null,
      tags: fd.get("tags"),
      csat: fd.get("csat") || null,
    };
    if (String(newAssignee || "") !== String(oldAssignee || "")) {
      const handoffNote = prompt(
        "Hand-off note (required): what should the next technician know? What you already checked, and the next step."
      );
      if (handoffNote == null) return;
      if (!String(handoffNote).trim()) {
        toast.warning("A hand-off note is required when reassigning.");
        return;
      }
      body.handoffNote = String(handoffNote).trim();
    }
    setBusy(true);
    try {
      const { data } = await api.patch(`/tickets/${id}`, body);
      toast.success("Ticket updated");
      applyTicket(data as Record<string, unknown>);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const review = t.review as {
    body?: string;
    mark?: string;
    priorityOk?: boolean | null;
    processOk?: boolean | null;
    expectedPriority?: string;
    source?: string;
    author?: { fullName?: string };
    updatedAt?: string;
    checks?: Record<string, boolean>;
  };

  return (
    <>
      <Meta className="meta-row">
        <Badge $bg={priorityColor(t.priority)}>{priorityLabel(t.priority)}</Badge>
        <Badge $bg={statusColor(t.status)}>{t.status}</Badge>
        <Badge $bg={colors.plum}>L{t.escalationLevel}</Badge>
        {t.tags.map((tag) => (
          <Badge key={tag} $bg={colors.teal}>{tag}</Badge>
        ))}
        <SlaText $bad={t.sla?.breached} $pending={t.sla?.pending}>
          {slaLine(t.sla as { pending?: boolean; acknowledgeMinutes?: number; resolveHours?: number })}
        </SlaText>
      </Meta>
      <Grid className="grid-2">
        <div>
          <Card>
            <h2 style={{ marginTop: 0 }}>{t.title}</h2>
            <p>{t.description}</p>
            <Hint>
              Requester {t.requester?.name} · {t.requester?.department} · {t.channel} · opened{" "}
              {formatWhen(t.createdAt)}
            </Hint>
          </Card>
          <Card as="form" style={{ marginTop: 14 }} onSubmit={onSaveTicket} id="ticket-form">
            <Grid style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field>
                <label>Status</label>
                <select name="status" defaultValue={t.status}>
                  {["new", "open", "pending", "escalated", "resolved", "closed"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field>
                <label>Priority</label>
                <select name="priority" defaultValue={t.priority || ""}>
                  <option value="">Unassigned</option>
                  {["critical", "high", "medium", "low"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </Grid>
            <Field>
              <label>Assignee</label>
              <select name="assigneeId" defaultValue={t.assigneeId || ""}>
                <option value="">Unassigned</option>
                {technicians.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
            </Field>
            <Field>
              <label>Tags</label>
              <input name="tags" defaultValue={t.tags.join(", ")} />
            </Field>
            <Field style={{ maxWidth: 160 }}>
              <label>CSAT (1–5)</label>
              <select name="csat" defaultValue={t.csat != null ? String(t.csat) : ""}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn type="submit" $variant="teal" disabled={busy} $busy={busy}>Save</Btn>
              <Btn
                type="button"
                $variant="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const { data } = await api.post(`/tickets/${id}/claim`);
                    toast.success("Ticket claimed");
                    applyTicket(data as Record<string, unknown>);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Claim failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Claim ticket
              </Btn>
              <Btn
                type="button"
                $variant="danger"
                disabled={busy}
                onClick={async () => {
                  const reason = prompt(
                    "Why are you escalating? Topic 1.1: recognise the limit of your knowledge early."
                  );
                  if (reason == null) return;
                  setBusy(true);
                  try {
                    const { data } = await api.post(`/tickets/${id}/escalate`, { reason });
                    toast.success("Escalated");
                    applyTicket(data as Record<string, unknown>);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Escalate failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Escalate
              </Btn>
            </div>
          </Card>
        </div>
        <div>
          <Card className="review-card">
            <h3>Instructor review</h3>
            {review?.body ? (
              <>
                <p>
                  <Badge $bg={reviewColor(review.mark)}>{reviewLabel(review.mark)}</Badge>
                  <span style={{ fontSize: 12, color: colors.muted }}>
                    {" "}
                    · {review.author?.fullName || "Instructor"} · {formatWhen(review.updatedAt)}
                  </span>
                </p>
                <Hint style={{ margin: "8px 0" }}>
                  Priority:{" "}
                  <strong>
                    {review.priorityOk === true
                      ? "Correct"
                      : review.priorityOk === false
                        ? "Incorrect"
                        : "Not judged"}
                  </strong>
                  · Process:{" "}
                  <strong>
                    {review.processOk === true
                      ? "Correct"
                      : review.processOk === false
                        ? "Incorrect"
                        : "Not judged"}
                  </strong>
                  {review.expectedPriority ? ` · Expected: ${review.expectedPriority}` : ""}
                  {review.source && review.source !== "instructor"
                    ? ` · ${review.source}`
                    : ""}
                </Hint>
                <p>{review.body}</p>
              </>
            ) : !instructor ? (
              <Hint>Not reviewed yet.</Hint>
            ) : null}
            {instructor ? (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
                  <Btn
                    type="button"
                    $variant="teal"
                    disabled={busy}
                    onClick={async () => {
                      setAiMsg("Judging priority and process…");
                      setBusy(true);
                      try {
                      const { data: res } = await api.post<{
                        warning?: string;
                        ticket?: Record<string, unknown>;
                      }>(`/tickets/${id}/review/ai`, {});
                      setAiMsg(
                        res.warning
                          ? res.warning
                          : "Classroom AI review saved — edit below if you disagree."
                      );
                      if (res.ticket) applyTicket(res.ticket);
                      else invalidateTicket();
                    } catch (err) {
                      setAiMsg("");
                      toast.error(err instanceof Error ? err.message : "AI review failed");
                    } finally {
                      setBusy(false);
                    }
                    }}
                  >
                    Ask AI to review
                  </Btn>
                  {aiMsg ? <Hint style={{ margin: 0, alignSelf: "center" }}>{aiMsg}</Hint> : null}
                </div>
                <form
                  id="review-form"
                  key={`review-${String(review?.updatedAt || "new")}`}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    setBusy(true);
                    try {
                      const { data } = await api.post(`/tickets/${id}/review`, {
                        mark: fd.get("mark"),
                        body: fd.get("body"),
                        priorityOk: fd.get("priorityOk"),
                        processOk: fd.get("processOk"),
                        assessedImpact: fd.get("assessedImpact") === "on",
                        usedLabOrPortals: fd.get("usedLabOrPortals") === "on",
                        leftClearRecord: fd.get("leftClearRecord") === "on",
                        escalatedAppropriately: fd.get("escalatedAppropriately") === "on",
                        closedCleanly: fd.get("closedCleanly") === "on",
                      });
                      toast.success("Review saved");
                      applyTicket(data as Record<string, unknown>);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Save failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Field>
                    <label>Overall mark</label>
                    <select name="mark" defaultValue={review?.mark || "needs-work"}>
                      <option value="good">Good work</option>
                      <option value="needs-work">Needs work</option>
                      <option value="incomplete">Incomplete</option>
                    </select>
                  </Field>
                  <Grid style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field>
                      <label>Was the priority correct?</label>
                      <select
                        name="priorityOk"
                        defaultValue={
                          review?.priorityOk === true
                            ? "yes"
                            : review?.priorityOk === false
                              ? "no"
                              : ""
                        }
                      >
                        <option value="">Not judged</option>
                        <option value="yes">Yes — correct priority</option>
                        <option value="no">No — wrong priority</option>
                      </select>
                    </Field>
                    <Field>
                      <label>Was the process correct?</label>
                      <select
                        name="processOk"
                        defaultValue={
                          review?.processOk === true
                            ? "yes"
                            : review?.processOk === false
                              ? "no"
                              : ""
                        }
                      >
                        <option value="">Not judged</option>
                        <option value="yes">Yes — right steps</option>
                        <option value="no">No — missed steps</option>
                      </select>
                    </Field>
                  </Grid>
                  <fieldset style={{ margin: "0 0 12px", border: `1px solid ${colors.line}`, borderRadius: 8, padding: 12 }}>
                    <legend>Process checklist</legend>
                    {[
                      ["assessedImpact", "Assessed impact before setting priority"],
                      ["usedLabOrPortals", "Used Lab map / Portals for the fault"],
                      ["leftClearRecord", "Left a clear comment / hand-off"],
                      ["escalatedAppropriately", "Escalated only when needed (or not at all)"],
                      ["closedCleanly", "Resolved/closed cleanly when fixed"],
                    ].map(([name, label]) => (
                      <CheckLabel key={name}>
                        <input
                          type="checkbox"
                          name={name}
                          defaultChecked={Boolean(review?.checks?.[name])}
                        />
                        {label}
                      </CheckLabel>
                    ))}
                  </fieldset>
                  <Field>
                    <label>Feedback for the technician</label>
                    <textarea name="body" rows={4} required defaultValue={review?.body || ""} />
                  </Field>
                  <Btn type="submit" $variant="teal" disabled={busy}>Save review</Btn>
                </form>
              </>
            ) : null}
          </Card>
          <Card style={{ marginTop: 14 }}>
            <h3>Comments</h3>
            <Comments className="comments">
              {(t.comments || []).length ? (
                (t.comments || []).map((c, i) => (
                  <Comment
                    key={i}
                    $internal={(c as { kind?: string }).kind === "internal"}
                    className={
                      (c as { kind?: string }).kind === "internal" ? "comment-internal" : ""
                    }
                  >
                    <strong>{commentAuthor(c as { author?: { fullName?: string; username?: string } })}</strong>
                    <span style={{ fontSize: 12, color: colors.muted }}>
                      {" "}
                      · {formatWhen((c as { createdAt?: string }).createdAt)}
                      {(c as { kind?: string }).kind === "internal" ? " · hand-off" : ""}
                    </span>
                    <div>{(c as { body?: string }).body}</div>
                  </Comment>
                ))
              ) : (
                <Hint>No comments yet.</Hint>
              )}
            </Comments>
            <form
              id="comment-form"
              style={{ marginTop: 12 }}
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                const body = String(fd.get("body") || "").trim();
                if (!body) return;
                setBusy(true);
                try {
                  const { data } = await api.post(`/tickets/${id}/comments`, { body });
                  form.reset();
                  applyTicket(data as Record<string, unknown>);
                  toast.success("Comment posted");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Comment failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field>
                <label>Add a comment</label>
                <textarea name="body" rows={4} required />
              </Field>
              <Btn type="submit" $variant="teal" disabled={busy}>Post comment</Btn>
            </form>
          </Card>
        </div>
      </Grid>
    </>
  );
}

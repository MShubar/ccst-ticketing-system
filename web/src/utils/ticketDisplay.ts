import { colors } from "@/theme/colors";
import { formatWhen } from "@/utils/format";

export function priorityLabel(priority?: string | null): string {
  return priority || "unassigned";
}

export function priorityColor(priority?: string | null): string {
  if (!priority) return colors.priority.unassigned;
  const key = priority as keyof typeof colors.priority;
  return colors.priority[key] ?? colors.priority.unassigned;
}

export function statusColor(status?: string): string {
  const map: Record<string, string> = {
    new: colors.teal,
    open: colors.status.inProgress,
    pending: colors.amber,
    escalated: colors.coral,
    resolved: colors.ok,
    closed: colors.muted,
  };
  return (status && map[status]) || colors.muted;
}

export function slaLine(sla?: {
  pending?: boolean;
  acknowledgeMinutes?: number;
  resolveHours?: number;
}): string {
  if (!sla || sla.pending) return "Set priority to start SLA";
  const ack =
    (sla.acknowledgeMinutes ?? 0) >= 60
      ? `${(sla.acknowledgeMinutes ?? 0) / 60}h`
      : `${sla.acknowledgeMinutes}m`;
  return `Response ${ack} · Resolve ${sla.resolveHours}h`;
}

export function slaResolveCell(sla?: {
  pending?: boolean;
  resolveDeadline?: string;
}): string {
  if (!sla || sla.pending) return "Awaiting priority";
  return formatWhen(sla.resolveDeadline);
}

export function reviewLabel(mark?: string | null): string {
  if (mark === "good") return "Good work";
  if (mark === "incomplete") return "Incomplete";
  if (mark === "needs-work") return "Needs work";
  return "Not reviewed";
}

export function reviewColor(mark?: string | null): string {
  if (mark === "good") return colors.ok;
  if (mark === "incomplete") return colors.coral;
  if (mark === "needs-work") return colors.amber;
  return colors.priority.unassigned;
}

export function commentAuthor(comment: {
  author?: { fullName?: string; username?: string };
}): string {
  const name = comment.author?.fullName || "Unknown";
  const username = comment.author?.username ? ` · ${comment.author.username}` : "";
  return `${name}${username}`;
}

export function isInstructorRole(user?: { role?: string; level?: number } | null): boolean {
  return Boolean(user && (user.role === "instructor" || user.level === 3));
}

/**
 * Ticket shapes as returned by the Express API (see backend/lib/dto/ticket.js).
 * Fields the classroom UI never reads are left as `Record<string, unknown>`.
 */

export const TICKET_STATUSES = [
  "new",
  "open",
  "pending",
  "escalated",
  "resolved",
  "closed",
] as const;

export const TICKET_PRIORITIES = ["critical", "high", "medium", "low"] as const;

export const TICKET_CATEGORIES = [
  "Access & Identity",
  "Hardware",
  "Software",
  "Network",
  "Printer",
  "Virtualization",
  "Cloud",
  "Email",
] as const;

export const TICKET_CHANNELS = [
  "portal",
  "phone",
  "email",
  "chat",
  "walk-in",
  "monitoring",
] as const;

export const REVIEW_MARKS = ["good", "needs-work", "incomplete"] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type ReviewMark = (typeof REVIEW_MARKS)[number];

export type TicketSla = {
  pending: boolean;
  acknowledgeMinutes: number | null;
  resolveHours: number | null;
  description?: string;
  ackDeadline: string | null;
  resolveDeadline: string | null;
  acknowledged?: boolean;
  resolved?: boolean;
  ackBreached?: boolean;
  resolveBreached?: boolean;
  breached?: boolean;
};

export type TicketUser = {
  id: string;
  username?: string;
  fullName: string;
  role?: string;
  level?: number;
};

export type TicketRequester = {
  id: string;
  name?: string;
  department?: string;
  email?: string;
};

export type TicketReviewChecks = {
  assessedImpact?: boolean;
  usedLabOrPortals?: boolean;
  leftClearRecord?: boolean;
  escalatedAppropriately?: boolean;
  closedCleanly?: boolean;
};

export type TicketReview = {
  mark?: ReviewMark | null;
  body?: string | null;
  updatedAt?: string | null;
  author?: TicketUser | null;
  priorityOk?: boolean | null;
  processOk?: boolean | null;
  expectedPriority?: string | null;
  source?: string | null;
  checks?: TicketReviewChecks | null;
};

export type TicketComment = {
  id?: string;
  body?: string;
  /** "internal" marks a hand-off note rather than a normal reply. */
  kind?: string;
  createdAt?: string;
  author?: TicketUser | null;
};

export type Ticket = {
  id: string;
  number?: number;
  title: string;
  description?: string;
  category?: string;
  subcategory?: string;
  channel?: string;
  status: TicketStatus | string;
  priority?: TicketPriority | string | null;
  escalationLevel?: number;
  tags?: string[];
  csat?: number | null;
  assigneeId?: string | null;
  assignee?: TicketUser | null;
  requesterId?: string;
  requester?: TicketRequester | null;
  createdAt?: string;
  updatedAt?: string;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  sla: TicketSla;
  review?: TicketReview | null;
  comments?: TicketComment[];
  /** Instructor-only: the lab fault this ticket was planted with. */
  fault?: Record<string, unknown> | null;
  generatedBy?: string;
};

export type TicketListResponse = {
  items: Ticket[];
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export type AiReviewResponse = {
  ticket?: Ticket;
  source?: string;
  warning?: string | null;
  ready?: boolean;
  mode?: string;
};

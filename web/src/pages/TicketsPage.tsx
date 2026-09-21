import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import styled from "styled-components";

import { Skeleton } from "@/components/common/Skeleton";
import Loader from "@/components/common/Loader";
import OptimisticLink from "@/components/common/OptimisticLink";
import { Btn, Card } from "@/components/ui/primitives";
import { ROUTES } from "@/constants/routes";
import { usePageReady } from "@/nav/PageReadyContext";
import { useTickets } from "@/services/queries/classroom";
import { useAuthStore } from "@/store/auth/authStore";
import { colors } from "@/theme/colors";
import {
  isInstructorRole,
  priorityColor,
  priorityLabel,
  reviewColor,
  reviewLabel,
  slaResolveCell,
  statusColor,
} from "@/utils/ticketDisplay";

const TICKET_VIEW_KEYS = [
  "q",
  "priority",
  "status",
  "mine",
  "review",
  "category",
  "assignee",
  "sla",
  "sort",
  "dir",
] as const;

function ticketViewStoreKey(userId?: string) {
  return `ccst.ticket-view.${userId || "anon"}`;
}

const Filters = styled.form`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
  align-items: center;

  input,
  select {
    border: 1px solid ${colors.line};
    border-radius: ${({ theme }) => theme.radii.sm};
    padding: 8px 10px;
    font-size: 13px;
    background: ${colors.white};
  }

  input[name="q"] {
    flex: 1;
    min-width: 200px;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;

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

  tbody tr {
    cursor: pointer;

    &:hover {
      background: ${colors.paper2};
    }
  }
`;

const Badge = styled.span<{ $bg: string }>`
  display: inline-block;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
  background: ${({ $bg }) => $bg};
  color: ${colors.white};
`;

const Hint = styled.div`
  font-size: 12px;
  color: ${colors.muted};
  margin-top: 4px;
`;

const Mono = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 12px;
`;

const SlaBad = styled.td`
  color: ${colors.coral};
`;

const Pager = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
  font-size: 13px;
  color: ${colors.muted};
`;

const SortHead = styled.th<{ $sorted?: boolean }>`
  white-space: nowrap;

  .sort-arrows {
    margin-left: 4px;
    display: inline-flex;
    gap: 2px;
  }

  a {
    color: ${({ $sorted }) => ($sorted ? colors.tealDeep : colors.muted)};
    text-decoration: none;
    font-size: 10px;
  }
`;

const Empty = styled.div`
  padding: 24px;
  text-align: center;

  h3 {
    margin: 0 0 8px;
  }

  p {
    margin: 0 0 12px;
    color: ${colors.muted};
  }

  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
`;

type TicketRow = {
  id: string;
  title: string;
  category: string;
  priority?: string | null;
  status: string;
  channel: string;
  requester?: { department?: string };
  assignee?: { fullName?: string };
  sla?: { pending?: boolean; resolveBreached?: boolean; resolveDeadline?: string };
  review?: { mark?: string };
  difficulty?: number;
};

export default function TicketsPage() {
  const user = useAuthStore((s) => s.user);
  const instructor = isInstructorRole(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const restored = useRef(false);
  const { markReady } = usePageReady();

  const queryObj = useMemo(() => Object.fromEntries(searchParams.entries()), [searchParams]);
  const hasView = TICKET_VIEW_KEYS.some((k) => queryObj[k]);
  const [searchValue, setSearchValue] = useState(queryObj.q || "");

  useEffect(() => {
    if (restored.current) return;
    if (!hasView) {
      try {
        const saved = sessionStorage.getItem(ticketViewStoreKey(user?.id)) || "";
        if (saved) {
          restored.current = true;
          navigate(`${ROUTES.TICKETS}?${saved}`, { replace: true });
          return;
        }
      } catch {
        /* private mode */
      }
    } else {
      const keep = new URLSearchParams();
      for (const [k, v] of Object.entries(queryObj)) {
        if (v && k !== "limit") keep.set(k, v);
      }
      try {
        const s = keep.toString();
        if (s) sessionStorage.setItem(ticketViewStoreKey(user?.id), s);
        else sessionStorage.removeItem(ticketViewStoreKey(user?.id));
      } catch {
        /* ignore */
      }
    }
    restored.current = true;
  }, [hasView, queryObj, navigate, user?.id]);

  const apiParams = useMemo(() => {
    const p = new URLSearchParams(searchParams);
    if (!p.get("page")) p.set("page", "1");
    if (!p.get("limit")) p.set("limit", "25");
    return p.toString();
  }, [searchParams]);

  const { data, isLoading, error } = useTickets(apiParams);

  useEffect(() => {
    if (data || error || (!isLoading && !data)) markReady();
  }, [data, error, isLoading, markReady]);

  const sortDir = queryObj.dir === "desc" ? "desc" : "asc";
  const filterQuery = useMemo(() => {
    const p = new URLSearchParams(searchParams);
    p.delete("page");
    return p;
  }, [searchParams]);

  const setSort = (key: string, dir: "asc" | "desc") => {
    const p = new URLSearchParams(filterQuery);
    if (queryObj.sort === key && sortDir === dir) {
      p.delete("sort");
      p.delete("dir");
    } else {
      p.set("sort", key);
      p.set("dir", dir);
    }
    const s = p.toString();
    try {
      if (s) sessionStorage.setItem(ticketViewStoreKey(user?.id), s);
      else sessionStorage.removeItem(ticketViewStoreKey(user?.id));
    } catch {
      /* ignore */
    }
    setSearchParams(p);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      if (v) next.set(k, String(v));
    }
    try {
      sessionStorage.setItem(ticketViewStoreKey(user?.id), next.toString());
    } catch {
      /* ignore */
    }
    setSearchParams(next);
  };

  const resetFilters = () => {
    try {
      sessionStorage.removeItem(ticketViewStoreKey(user?.id));
    } catch {
      /* ignore */
    }
    setSearchParams({});
  };

  if (isLoading && !data) {
    return (
      <Loader variant="card" caption="Loading tickets…" useSkeleton>
        <Skeleton as="lines" count={8} width="100%" gap="10px" />
      </Loader>
    );
  }

  const tickets = (data?.items || []) as TicketRow[];
  const page = data?.page || 1;
  const pages = data?.pages || 1;
  const total = data?.total ?? tickets.length;

  const pageLink = (n: number) => {
    const p = new URLSearchParams(filterQuery);
    p.set("page", String(n));
    return `${ROUTES.TICKETS}?${p.toString()}`;
  };

  const sortHead = (key: string, label: string) => (
    <SortHead key={key} $sorted={queryObj.sort === key}>
      <span>{label}</span>
      <span className="sort-arrows">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setSort(key, "asc");
          }}
        >
          ▲
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setSort(key, "desc");
          }}
        >
          ▼
        </a>
      </span>
    </SortHead>
  );

  return (
    <>
      <Filters id="filter-form" onSubmit={onSubmit}>
        <input
          name="q"
          placeholder="Search title, tag, requester…"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
        <select name="priority" value={queryObj.priority || ""} onChange={(e) => {
          const p = new URLSearchParams(searchParams);
          if (e.target.value) p.set("priority", e.target.value);
          else p.delete("priority");
          setSearchParams(p);
        }}>
          <option value="">All priorities</option>
          <option value="unassigned">Unassigned</option>
          {["critical", "high", "medium", "low"].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select name="status" value={queryObj.status || ""} onChange={(e) => {
          const p = new URLSearchParams(searchParams);
          if (e.target.value) p.set("status", e.target.value);
          else p.delete("status");
          setSearchParams(p);
        }}>
          <option value="">All statuses</option>
          {["new", "open", "pending", "escalated", "resolved", "closed"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select name="mine" value={queryObj.mine || ""} onChange={(e) => {
          const p = new URLSearchParams(searchParams);
          if (e.target.value) p.set("mine", e.target.value);
          else p.delete("mine");
          setSearchParams(p);
        }}>
          <option value="">Whole queue</option>
          <option value="1">Assigned to me</option>
        </select>
        <select name="sla" value={queryObj.sla || ""} onChange={(e) => {
          const p = new URLSearchParams(searchParams);
          if (e.target.value) p.set("sla", e.target.value);
          else p.delete("sla");
          setSearchParams(p);
        }}>
          <option value="">All SLAs</option>
          <option value="past">Past SLA</option>
          <option value="ok">On track</option>
          <option value="pending">Awaiting priority</option>
        </select>
        {instructor ? (
          <select name="review" value={queryObj.review || ""} onChange={(e) => {
            const p = new URLSearchParams(searchParams);
            if (e.target.value) p.set("review", e.target.value);
            else p.delete("review");
            setSearchParams(p);
          }}>
            <option value="">All reviews</option>
            <option value="pending">Needs review</option>
            <option value="done">Reviewed</option>
          </select>
        ) : null}
        <input type="hidden" name="sort" value={queryObj.sort || ""} />
        <input type="hidden" name="dir" value={queryObj.sort ? sortDir : ""} />
        <Btn type="submit" $variant="secondary">Apply</Btn>
        <Btn type="button" $variant="secondary" onClick={resetFilters}>
          Reset filters
        </Btn>
        {instructor ? (
          <OptimisticLink to={ROUTES.TICKETS_NEW}>
            <Btn type="button" $variant="teal" as="span">New ticket</Btn>
          </OptimisticLink>
        ) : null}
      </Filters>

      {error ? (
        <Card>
          <p style={{ color: colors.coral, margin: 0 }}>Could not load tickets.</p>
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          <Table>
            <thead>
              <tr>
                {sortHead("id", "ID")}
                {sortHead("title", "Title")}
                {sortHead("category", "Category")}
                {sortHead("priority", "Priority")}
                {sortHead("status", "Status")}
                {sortHead("sla", "SLA resolve")}
                {sortHead("assignee", "Assignee")}
                {sortHead("review", "Review")}
                {sortHead("difficulty", "Level")}
                </tr>
            </thead>
            <tbody>
              {tickets.length ? (
                tickets.map((t) => {
                  const slaCell = slaResolveCell(t.sla);
                  return (
                    <tr key={t.id} onClick={() => navigate(`${ROUTES.TICKETS}/${t.id}`)}>
                      <td><Mono>{t.id}</Mono></td>
                      <td>
                        {t.title}
                        <Hint>
                          {t.requester?.department || ""} · {t.channel}
                        </Hint>
                      </td>
                      <td>{t.category}</td>
                      <td>
                        <Badge $bg={priorityColor(t.priority)}>{priorityLabel(t.priority)}</Badge>
                      </td>
                      <td>
                        <Badge $bg={statusColor(t.status)}>{t.status}</Badge>
                      </td>
                      {t.sla?.resolveBreached ? (
                        <SlaBad>{slaCell}</SlaBad>
                      ) : (
                        <td>{slaCell}</td>
                      )}
                      <td>{t.assignee?.fullName || "—"}</td>
                      <td>
                        <Badge $bg={reviewColor(t.review?.mark)}>{reviewLabel(t.review?.mark)}</Badge>
                      </td>
                      <td>
                        <Mono>L{t.difficulty || 1}</Mono>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9}>
                    <Empty>
                      <div>
                        <h3>{instructor ? "No tickets in this view" : "No tickets yet"}</h3>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                          {instructor ? (
                            <>
                              <OptimisticLink to={ROUTES.TEAM}>
                                <Btn $variant="teal" as="span">Class & students</Btn>
                              </OptimisticLink>
                              <OptimisticLink to={ROUTES.TICKETS_NEW}>
                                <Btn $variant="secondary" as="span">New ticket</Btn>
                              </OptimisticLink>
                            </>
                          ) : (
                            <OptimisticLink to={ROUTES.DASHBOARD}>
                              <Btn $variant="teal" as="span">Dashboard</Btn>
                            </OptimisticLink>
                          )}
                        </div>
                      </div>
                    </Empty>
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      )}

      <Pager>
        {page > 1 ? (
          <OptimisticLink to={pageLink(page - 1)}>
            <Btn $variant="secondary" as="span">Previous</Btn>
          </OptimisticLink>
        ) : (
          <span />
        )}
        <span>
          Page {page} of {pages} · {total} tickets
        </span>
        {page < pages ? (
          <OptimisticLink to={pageLink(page + 1)}>
            <Btn $variant="secondary" as="span">Next</Btn>
          </OptimisticLink>
        ) : (
          <span />
        )}
      </Pager>
    </>
  );
}

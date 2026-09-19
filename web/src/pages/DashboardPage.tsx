import { useEffect } from "react";
import styled, { css } from "styled-components";

import { Skeleton } from "@/components/common/Skeleton";
import OptimisticLink from "@/components/common/OptimisticLink";
import Loader from "@/components/common/Loader";
import { Btn, Card } from "@/components/ui/primitives";
import { ROUTES } from "@/constants/routes";
import { usePageReady } from "@/nav/PageReadyContext";
import { useKpiPdf } from "@/services/mutations/kpi/kpi.hooks";
import { useDashboard } from "@/services/queries/classroom";
import { colors } from "@/theme/colors";
import { minutesLabel, percentLabel } from "@/utils/format";

const PRIORITY_COLORS = colors.priority;
const STATUS_COLORS = colors.status;

const Dash = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const DashHero = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 1100px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  @media (max-width: 700px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const StatLink = styled(OptimisticLink)`
  text-decoration: none;
  color: inherit;
`;

type Tone = "teal" | "ok" | "warn" | "amber" | "navy";

const toneBar: Record<Tone, string> = {
  teal: colors.teal,
  ok: colors.ok,
  warn: colors.amber,
  amber: colors.amber,
  navy: colors.navy3,
};

const Stat = styled.div<{ $tone: Tone }>`
  position: relative;
  background: ${colors.cardWash}, ${colors.card};
  border: 1px solid ${colors.line};
  border-radius: ${({ theme }) => theme.radii.xxl};
  padding: 18px 16px 16px;
  box-shadow: ${colors.shadow};
  overflow: hidden;
  min-height: 96px;
  transition: transform 0.15s ease, border-color 0.15s ease;

  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 14px;
    bottom: 14px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: ${({ $tone }) => toneBar[$tone]};
  }

  ${StatLink}:hover & {
    transform: translateY(-2px);
    border-color: ${colors.tealBorder};
  }
`;

const StatValue = styled.div`
  font-family: ${({ theme }) => theme.fonts.serif};
  font-size: clamp(26px, 2.4vw, 34px);
  line-height: 1;
  color: ${colors.ink};
  letter-spacing: -0.02em;
`;

const StatLabel = styled.div`
  margin-top: 10px;
  color: ${colors.muted};
  font-size: 11.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 600;
`;

const Panels = styled.div<{ $cols?: 2 | 3 }>`
  display: grid;
  grid-template-columns: ${({ $cols }) =>
    $cols === 3 ? "repeat(3, minmax(0, 1fr))" : "1.15fr 1fr"};
  gap: 14px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled(Card)`
  padding: 18px 20px;
`;

const PanelHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

  h2 {
    margin: 0;
    font-size: 15px;
  }
`;

const Hint = styled.span`
  font-size: 12px;
  color: ${colors.muted};
`;

const Lead = styled.p`
  margin: 0 0 14px;
  color: ${colors.ink};
  font-size: 14px;
  line-height: 1.45;
`;

const Band = styled.span<{ $bg: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $bg }) => $bg};
  color: ${colors.white};
`;

const BarLink = styled(OptimisticLink)`
  text-decoration: none;
  color: inherit;
  display: block;

  &:hover span:first-child {
    color: ${colors.tealDeep};
  }
`;

const BarRow = styled.div`
  display: grid;
  grid-template-columns: 88px 1fr 36px;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
`;

const BarLabel = styled.span`
  font-size: 12px;
  color: ${colors.muted};
  font-weight: 600;
`;

const BarTrack = styled.span`
  height: 8px;
  border-radius: 999px;
  background: ${colors.track};
  overflow: hidden;
`;

const BarFill = styled.span<{ $width: number; $color: string }>`
  display: block;
  height: 100%;
  width: ${({ $width }) => $width}%;
  background: ${({ $color }) => $color};
  border-radius: inherit;
`;

const BarCount = styled.span`
  font-size: 12px;
  font-weight: 600;
  text-align: right;
  color: ${colors.ink};
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
`;

const Chip = styled.span`
  display: inline-flex;
  gap: 6px;
  align-items: baseline;
  padding: 6px 10px;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${colors.paper2};
  border: 1px solid ${colors.line};
  font-size: 12px;
  color: ${colors.muted};

  strong {
    color: ${colors.ink};
    font-weight: 600;
  }
`;

const Sla = styled.p<{ $bad?: boolean }>`
  margin: 0 0 14px;
  font-size: 13px;
  color: ${({ $bad }) => ($bad ? colors.coral : colors.ok)};

  a {
    color: inherit;
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const MetricStack = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  text-align: center;
`;

const MetricNum = styled.span`
  display: block;
  font-family: ${({ theme }) => theme.fonts.serif};
  font-size: 28px;
  line-height: 1;
  color: ${colors.ink};
`;

const MetricCap = styled.span`
  display: block;
  margin-top: 6px;
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${colors.muted};
  font-weight: 600;
`;

const ErrorMsg = styled.p`
  color: ${colors.coral};
  font-size: 13px;
`;

const ActionLink = styled(OptimisticLink)<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  border: 0;
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 8px 12px;
  font-weight: 600;
  text-decoration: none;
  ${({ $primary }) =>
    $primary
      ? css`
          background: ${colors.tealDeep};
          color: ${colors.white};
        `
      : css`
          background: ${colors.white};
          color: ${colors.ink};
          border: 1px solid ${colors.line};
        `}
`;

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboard();
  const kpiPdf = useKpiPdf();
  const { markReady } = usePageReady();

  useEffect(() => {
    if (data || error || (!isLoading && !data)) markReady();
  }, [data, error, isLoading, markReady]);

  if (isLoading && !data) {
    return (
      <Loader variant="card" caption="Loading dashboard…" useSkeleton>
        <Skeleton as="lines" count={6} width="100%" gap="12px" />
      </Loader>
    );
  }
  if (error || !data) return <ErrorMsg>Could not load the dashboard.</ErrorMsg>;

  const desk = data.focus === "desk";
  const mine = data.mine || {};
  const queue = data.queue || {};
  const health = data.health || {};
  const progress = data.progress || {};
  const grade = progress.grade || {};
  const band = grade.band || {};
  const kpis = desk ? mine : queue;
  const pri = kpis.byPriority || {};
  const breachedCount = Number(data.breachedCount || 0);
  const pastSlaHref = `${ROUTES.TICKETS}?sla=past${desk ? "&mine=1" : ""}`;
  const openTotal = Math.max(1, Number(health.open) || Number(kpis.backlog) || 0);
  const mineFilter = desk ? "mine=1&" : "";

  const kpiButton = (
    <Btn
      $variant="secondary"
      type="button"
      disabled={kpiPdf.isPending}
      $busy={kpiPdf.isPending}
      onClick={() => kpiPdf.mutate()}
    >
      {desk ? "KPI PDF" : "My KPI PDF"}
    </Btn>
  );

  const slaLine = (
    <Sla $bad={Boolean(breachedCount)}>
      {breachedCount ? (
        <OptimisticLink to={pastSlaHref}>
          {desk
            ? `${breachedCount} of your tickets past an SLA mark`
            : `${breachedCount} ticket(s) past an SLA mark`}
        </OptimisticLink>
      ) : desk ? (
        "None of your tickets are past SLA"
      ) : (
        "0 tickets currently past an SLA mark"
      )}
    </Sla>
  );

  const priorityBars = (
    [
      ["Critical", "critical"],
      ["High", "high"],
      ["Medium", "medium"],
      ["Low", "low"],
      [desk ? "Unset" : "No priority", "unassigned"],
    ] as const
  ).map(([label, key]) => (
    <DashBar
      key={key}
      label={label}
      count={pri[key]}
      total={openTotal}
      color={PRIORITY_COLORS[key]}
      to={`${ROUTES.TICKETS}?${mineFilter}priority=${key}`}
    />
  ));

  const deskStats = [
    {
      value: mine.backlog ?? 0,
      label: "Open on my desk",
      to: `${ROUTES.TICKETS}?mine=1`,
    },
    { value: mine.resolved ?? 0, label: "Resolved", tone: "ok" as const },
    {
      value: percentLabel(mine.slaCompliance),
      label: "My SLA",
      tone: (breachedCount ? "warn" : "teal") as Tone,
      to: pastSlaHref,
    },
    {
      value: band.label || "—",
      label: "Grade band",
      tone: "navy" as const,
      to: ROUTES.PROGRESS,
    },
    {
      value: progress.reviewPending ?? 0,
      label: "Awaiting review",
      tone: "amber" as const,
    },
    {
      value: minutesLabel(mine.avgResponseMinutes),
      label: "Avg response",
      tone: "navy" as const,
    },
  ];

  const queueStats = [
    {
      value: queue.backlog ?? 0,
      label: "Backlog",
      to: ROUTES.TICKETS,
    },
    { value: queue.resolved ?? 0, label: "Resolved", tone: "ok" as const },
    {
      value: percentLabel(queue.slaCompliance),
      label: "SLA compliance",
      tone: (breachedCount ? "warn" : "teal") as Tone,
      to: pastSlaHref,
    },
    {
      value: minutesLabel(queue.avgResponseMinutes),
      label: "Avg response",
      tone: "navy" as const,
    },
    {
      value: minutesLabel(queue.avgResolutionMinutes),
      label: "Avg resolve",
      tone: "navy" as const,
    },
    {
      value: percentLabel(health.resolveRate),
      label: "Resolve rate",
      tone: "ok" as const,
    },
  ];

  const statusBars = (
    [
      ["New", "new", "new"],
      ["In progress", "inProgress", "open"],
      ["Pending", "pending", "pending"],
      ["Escalated", "escalated", "escalated"],
    ] as const
  ).map(([label, key, status]) => (
    <DashBar
      key={key}
      label={label}
      count={health[key]}
      total={openTotal}
      color={STATUS_COLORS[key === "inProgress" ? "inProgress" : key]}
      to={`${ROUTES.TICKETS}?status=${status}`}
    />
  ));

  if (desk) {
    return (
      <Dash>
        <DashHero>
          {deskStats.map((stat) => (
            <DashStat key={stat.label} {...stat} />
          ))}
        </DashHero>

        <Panels>
          <Panel>
            <PanelHead>
              <h2>Priority mix</h2>
              <Hint>{health.open || 0} open</Hint>
            </PanelHead>
            {priorityBars}
          </Panel>

          <Panel>
            <PanelHead>
              <h2>Am I on track?</h2>
              <Band $bg={band.color || colors.priority.unassigned}>
                {band.label || "No grade yet"}
              </Band>
            </PanelHead>
            <Lead>
              {grade.score != null ? (
                <>
                  <strong>{grade.score}</strong>/100 ·{" "}
                </>
              ) : null}
              {grade.summary || "Complete and resolve tickets to build a grade."}
            </Lead>
            <Chips>
              {(
                [
                  ["Assigned", progress.assigned || 0],
                  ["Open", progress.open || 0],
                  ["Resolved", progress.resolved || 0],
                  ["Avg resolve", minutesLabel(mine.avgResolutionMinutes)],
                ] as const
              ).map(([label, value]) => (
                <Chip key={label}>
                  {label} <strong>{value}</strong>
                </Chip>
              ))}
            </Chips>
            {slaLine}
            <Actions>
              <ActionLink $primary to={`${ROUTES.TICKETS}?mine=1`}>
                My tickets
              </ActionLink>
              <ActionLink to={ROUTES.MAP}>Lab map</ActionLink>
              <ActionLink to={ROUTES.PROGRESS}>My progress</ActionLink>
              {kpiButton}
            </Actions>
          </Panel>
        </Panels>
      </Dash>
    );
  }

  return (
    <Dash>
      <DashHero>
        {queueStats.map((stat) => (
          <DashStat key={stat.label} {...stat} />
        ))}
      </DashHero>

      <Panels>
        <Panel>
          <PanelHead>
            <h2>Open by priority</h2>
            <Hint>{health.open || 0} still open</Hint>
          </PanelHead>
          {priorityBars}
        </Panel>

        <Panel>
          <PanelHead>
            <h2>Open by status</h2>
            <Hint>Live queue shape</Hint>
          </PanelHead>
          {statusBars}
        </Panel>
      </Panels>

      <Panels $cols={3}>
        <Panel>
          <PanelHead>
            <h2>Coverage</h2>
          </PanelHead>
          <MetricStack>
            {(
              [
                [health.owned ?? 0, "Owned"],
                [health.unowned ?? 0, "Unassigned"],
                [pri.unassigned ?? 0, "No priority"],
              ] as const
            ).map(([num, cap]) => (
              <div key={cap}>
                <MetricNum>{num}</MetricNum>
                <MetricCap>{cap}</MetricCap>
              </div>
            ))}
          </MetricStack>
        </Panel>

        <Panel>
          <PanelHead>
            <h2>SLA health</h2>
          </PanelHead>
          {slaLine}
          <Chips>
            {(
              [
                ["Critical", pri.critical ?? 0],
                ["High", pri.high ?? 0],
                ["Total tickets", queue.total ?? 0],
              ] as const
            ).map(([label, value]) => (
              <Chip key={label}>
                {label} <strong>{value}</strong>
              </Chip>
            ))}
          </Chips>
        </Panel>

        <Panel>
          <PanelHead>
            <h2>Shortcuts</h2>
          </PanelHead>
          <Actions>
            <ActionLink $primary to={ROUTES.TEAM}>
              Class &amp; students
            </ActionLink>
            <ActionLink to={ROUTES.TICKETS}>Ticket queue</ActionLink>
            <ActionLink to={ROUTES.MAP}>Lab map</ActionLink>
            {kpiButton}
          </Actions>
        </Panel>
      </Panels>
    </Dash>
  );
}

function DashStat({
  value,
  label,
  tone = "teal",
  to,
}: {
  value: string | number;
  label: string;
  tone?: Tone;
  to?: string;
}) {
  const stat = (
    <Stat $tone={tone}>
      <StatValue>{value}</StatValue>
      <StatLabel>{label}</StatLabel>
    </Stat>
  );
  return to ? <StatLink to={to}>{stat}</StatLink> : stat;
}

function DashBar({
  label,
  count,
  total,
  color,
  to,
}: {
  label: string;
  count?: number;
  total: number;
  color: string;
  to?: string;
}) {
  const n = Number(count) || 0;
  const pct = Math.min(100, Math.round((n / total) * 100));
  const row = (
    <BarRow>
      <BarLabel>{label}</BarLabel>
      <BarTrack>
        <BarFill $width={pct} $color={color} />
      </BarTrack>
      <BarCount>{n}</BarCount>
    </BarRow>
  );
  return to ? <BarLink to={to}>{row}</BarLink> : row;
}

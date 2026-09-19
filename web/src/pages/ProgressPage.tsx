import { useEffect } from "react";
import styled, { css } from "styled-components";

import OptimisticLink from "@/components/common/OptimisticLink";
import { Btn, Card, Hint } from "@/components/ui/primitives";
import Loader from "@/components/common/Loader";
import { Skeleton } from "@/components/common/Skeleton";
import { ROUTES } from "@/constants/routes";
import { usePageReady } from "@/nav/PageReadyContext";
import { useKpiPdf } from "@/services/mutations/kpi/kpi.hooks";
import { useDashboard } from "@/services/queries/classroom";
import { colors } from "@/theme/colors";

/** Matches classic `.progress-band` / `.progress-grid` / `.kpi-*` from app.css. */

const Band = styled.span<{ $bg: string }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  background: ${({ $bg }) => $bg};
  color: ${colors.white};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;

  @media (min-width: 800px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
`;

const KpiCard = styled(Card)`
  margin: 0;
  box-shadow: none;
`;

const KpiValue = styled.div`
  font-family: ${({ theme }) => theme.fonts.serif};
  font-size: 34px;
  line-height: 1;
  color: ${colors.ink};
`;

const KpiLabel = styled.div`
  margin-top: 6px;
  color: ${colors.muted};
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
  margin-top: 12px;

  th {
    text-align: left;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${colors.muted};
    padding: 8px;
  }

  td {
    padding: 10px 8px;
    border-top: 1px solid ${colors.line};
    vertical-align: middle;
  }
`;

const Actions = styled.div`
  margin-top: 14px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const ActionLink = styled(OptimisticLink)<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 8px 12px;
  font-weight: 600;
  text-decoration: none;
  ${({ $primary }) =>
    $primary
      ? css`
          background: ${colors.tealDeep};
          color: ${colors.white};
          border: 0;
        `
      : css`
          background: ${colors.white};
          color: ${colors.ink};
          border: 1px solid ${colors.line};
        `}
`;

const HintLine = styled(Hint)`
  margin-top: 14px;
`;

const Note = styled.span`
  font-size: 12px;
  color: ${colors.muted};
`;

const Empty = styled.span`
  font-size: 12px;
  color: ${colors.muted};
`;

export default function ProgressPage() {
  const { data, isLoading, error } = useDashboard();
  const kpiPdf = useKpiPdf();
  const { markReady } = usePageReady();

  useEffect(() => {
    if (data || error || (!isLoading && !data)) markReady();
  }, [data, error, isLoading, markReady]);

  if (isLoading && !data) {
    return (
      <Loader variant="card" caption="Loading progress…" useSkeleton>
        <Skeleton as="lines" count={5} width="100%" gap="14px" />
      </Loader>
    );
  }
  if (error || !data) {
    return (
      <Card>
        <p style={{ color: colors.coral, margin: 0 }}>
          Could not load progress.
        </p>
      </Card>
    );
  }

  const progress = data.progress || {};
  const grade = progress.grade || {};
  const band = grade.band || {};
  const parts = grade.parts || [];

  return (
    <Card>
      <p>
        <Band $bg={band.color || colors.priority.unassigned}>
          {band.label || "Insufficient data"}
        </Band>
        {grade.score != null ? (
          <>
            {" "}
            · <strong>{grade.score}</strong>/100
          </>
        ) : null}
      </p>
      <p>{grade.summary || "Not enough ticket work yet to grade."}</p>
      <Grid>
        {(
          [
            [progress.assigned || 0, "Assigned"],
            [progress.open || 0, "Still open"],
            [progress.resolved || 0, "Resolved"],
            [progress.reviewPending || 0, "Waiting on review"],
          ] as const
        ).map(([value, label]) => (
          <KpiCard key={label}>
            <KpiValue>{value}</KpiValue>
            <KpiLabel>{label}</KpiLabel>
          </KpiCard>
        ))}
      </Grid>
      <HintLine>
        Still open: <strong>{progress.open || 0}</strong> · Waiting on review:{" "}
        <strong>{progress.reviewPending || 0}</strong> · Reviewed:{" "}
        <strong>{progress.reviewed || 0}</strong>
      </HintLine>
      <Table>
        <thead>
          <tr>
            <th>Component</th>
            <th>Score</th>
            <th>Weight</th>
          </tr>
        </thead>
        <tbody>
          {parts.length ? (
            parts.map((p) => (
              <tr key={p.key}>
                <td>
                  {p.label}
                  {p.note ? <Note> · {p.note}</Note> : null}
                </td>
                <td>{p.raw == null ? "—" : `${p.raw}%`}</td>
                <td>{p.weight}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={3}>
                <Empty>No grade components yet.</Empty>
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      <Actions>
        <ActionLink $primary to={`${ROUTES.TICKETS}?mine=1`}>
          My tickets
        </ActionLink>
        <ActionLink to={ROUTES.DASHBOARD}>Dashboard</ActionLink>
        <Btn
          type="button"
          $variant="secondary"
          disabled={kpiPdf.isPending}
          $busy={kpiPdf.isPending}
          onClick={() => kpiPdf.mutate()}
        >
          Download KPI PDF
        </Btn>
      </Actions>
    </Card>
  );
}

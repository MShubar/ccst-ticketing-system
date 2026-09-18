import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import styled from "styled-components";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import OptimisticLink from "@/components/common/OptimisticLink";
import { Btn, Card, Hint } from "@/components/ui/primitives";
import { ROUTES } from "@/constants/routes";
import { usePageReady } from "@/nav/PageReadyContext";
import { usePortals } from "@/services/queries/classroom";
import { colors } from "@/theme/colors";
import { formatWhen } from "@/utils/format";

type PortalNote = { message: string; escalate?: boolean };

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
`;

const PortalCard = styled(OptimisticLink)`
  display: block;
  text-decoration: none;
  color: inherit;
  padding: 18px 20px;
  border-radius: ${({ theme }) => theme.radii.xxl};
  background: ${colors.cardWash}, ${colors.card};
  border: 1px solid ${colors.line};
  box-shadow: ${colors.shadow};

  h2 {
    margin: 0 0 6px;
    font-size: 18px;
  }

  p {
    margin: 0;
    font-size: 13px;
    color: ${colors.muted};
  }
`;

const Banner = styled.p<{ $warn?: boolean }>`
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.sm};
  margin: 0 0 14px;
  font-size: 13px;
  background: ${({ $warn }) => ($warn ? colors.warningBg : colors.tealSoft)};
  border: 1px solid ${({ $warn }) => ($warn ? colors.warningBorder : colors.tealBorder)};
  color: ${({ $warn }) => ($warn ? colors.warningText : colors.ink)};
`;

const ScrollCard = styled(Card)`
  padding: 0;
  margin-bottom: 14px;
  overflow-x: auto;
`;

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

  .mono {
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 12px;
  }

  .nowrap {
    white-space: nowrap;
  }
`;

const RowActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Log = styled.ul`
  margin: 0;
  padding-left: 1.2rem;
  font-size: 13px;

  li {
    margin-bottom: 6px;
  }
`;

const SlaOk = styled.strong`
  color: ${colors.ok};
`;

const SlaBad = styled.strong`
  color: ${colors.coral};
`;

function PortalLog({ rows }: { rows?: Array<Record<string, string>> }) {
  if (!rows?.length) return <Hint>No activity yet.</Hint>;
  return (
    <Log>
      {rows.map((r, i) => (
        <li key={i}>
          <span className="mono">{formatWhen(r.at)}</span> — {r.who} ·{" "}
          {r.action || r.mailbox || r.text || ""}
        </li>
      ))}
    </Log>
  );
}

export default function PortalsPage() {
  const { which } = useParams<{ which?: string }>();
  const { data, isLoading, error } = usePortals();
  const [note, setNote] = useState<PortalNote | null>(null);
  const [pwSearch, setPwSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const qc = useQueryClient();
  const { markReady } = usePageReady();

  useEffect(() => {
    if (data || error || (!isLoading && !data)) markReady();
  }, [data, error, isLoading, markReady]);

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.portals });

  async function post<T>(path: string, body: unknown, onSuccess?: (res: T) => void) {
    try {
      const { data: res } = await api.post<T>(path, body);
      await invalidate();
      onSuccess?.(res);
      const n = (res as { note?: PortalNote })?.note;
      if (n) setNote(n);
      else setNote(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    }
  }

  if (isLoading && !data) return null;
  if (error || !data) {
    return (
      <Card>
        <p style={{ color: colors.coral, margin: 0 }}>Could not load portals.</p>
      </Card>
    );
  }

  const portals = (data as { portals: Record<string, unknown> }).portals;

  if (!which) {
    return (
      <Grid>
        <PortalCard to={`${ROUTES.PORTALS}/password`}>
          <h2>Password</h2>
          <p>Company mailboxes</p>
        </PortalCard>
        <PortalCard to={`${ROUTES.PORTALS}/cbs`}>
          <h2>CBS</h2>
          <p>
            <code>VM-SQL-FIN</code> · <code>10.10.60.11</code>
          </p>
        </PortalCard>
        <PortalCard to={`${ROUTES.PORTALS}/vas`}>
          <h2>VAS</h2>
          <p>SMS, MMS, BMS, USSD</p>
        </PortalCard>
        <PortalCard to={`${ROUTES.PORTALS}/vpn`}>
          <h2>VPN</h2>
          <p>IPsec, SSL, Remote</p>
        </PortalCard>
      </Grid>
    );
  }

  const back = (
    <Hint>
      <OptimisticLink to={ROUTES.PORTALS}>All portals</OptimisticLink>
    </Hint>
  );

  const banner = note ? (
    <Banner $warn={note.escalate}>{note.message}</Banner>
  ) : null;

  if (which === "password") {
    const people = (portals.passwordPeople as Array<Record<string, string>>) || [];
    const resets = (portals.passwordResets as Array<Record<string, string>>) || [];
    const q = pwSearch.trim().toLowerCase();
    return (
      <>
        {back}
        {banner}
        <Card style={{ maxWidth: 360, marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: colors.muted }}>Search</label>
          <input
            type="search"
            placeholder="Name, mailbox, department, or PC"
            value={pwSearch}
            onChange={(e) => setPwSearch(e.target.value)}
            style={{ width: "100%", marginTop: 6, padding: 10, border: `1px solid ${colors.line}`, borderRadius: 6 }}
          />
        </Card>
        <ScrollCard>
          <Table className="cbs-table">
            <thead>
              <tr>
                <th>Mailbox</th>
                <th>Actions</th>
                <th>Name</th>
                <th>Department</th>
                <th>PC</th>
                <th>Last reset</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const hay = `${p.name} ${p.mailbox} ${p.department} ${p.pc}`.toLowerCase();
                if (q && !hay.includes(q)) return null;
                return (
                  <tr key={p.id}>
                    <td className="mono nowrap">{p.mailbox}</td>
                    <td>
                      <RowActions>
                        <Btn
                          type="button"
                          $variant="teal"
                          disabled={busyKey === p.id}
                          $busy={busyKey === p.id}
                          onClick={() => {
                            setBusyKey(p.id);
                            post("/portals/password", { userId: p.id }).finally(() =>
                              setBusyKey(null)
                            );
                          }}
                        >
                          Reset password
                        </Btn>
                      </RowActions>
                    </td>
                    <td>{p.name}</td>
                    <td>{p.department}</td>
                    <td className="mono nowrap">{p.pc}</td>
                    <td>{p.lastReset ? formatWhen(p.lastReset) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </ScrollCard>
        <Card>
          <h3>Recent resets</h3>
          <PortalLog
            rows={resets.map((r) => ({
              ...r,
              action: `reset ${r.name ? `${r.name} · ` : ""}${r.mailbox}`,
            }))}
          />
        </Card>
      </>
    );
  }

  if (which === "cbs") {
    const cbs = portals.cbs as {
      invoices: Array<Record<string, string>>;
      tills: Array<{ shop: string; name: string; invoiceId?: string }>;
      log: Array<Record<string, string>>;
    };
    return (
      <>
        {back}
        {banner}
        <ScrollCard>
          <Table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Actions</th>
                <th>Shop</th>
                <th>Amount</th>
                <th>Day</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cbs.invoices.map((i) => (
                <tr key={i.id}>
                  <td className="mono nowrap">{i.id}</td>
                  <td>
                    <RowActions>
                      {(["post", "refund", "till", "export"] as const).map((action) => (
                        <Btn
                          key={action}
                          type="button"
                          $variant={action === "post" ? "teal" : "secondary"}
                          disabled={busyKey === `${action}-${i.id}`}
                          onClick={() => {
                            const key = `${action}-${i.id}`;
                            setBusyKey(key);
                            post("/portals/cbs", { action, invoiceId: i.id }).finally(() =>
                              setBusyKey(null)
                            );
                          }}
                        >
                          {action === "post"
                            ? "Post"
                            : action === "refund"
                              ? "Refund"
                              : action === "till"
                                ? "Add Safqa till"
                                : "Export payroll"}
                        </Btn>
                      ))}
                    </RowActions>
                  </td>
                  <td>{i.shop}</td>
                  <td>{i.amount}</td>
                  <td>{i.day}</td>
                  <td>{i.status}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </ScrollCard>
        <Card style={{ marginBottom: 14 }}>
          <h3>Tills</h3>
          <p>
            {cbs.tills
              .map((t) => `${t.shop} · ${t.name}${t.invoiceId ? ` · ${t.invoiceId}` : ""}`)
              .join(" · ") || "None"}
          </p>
        </Card>
        <Card>
          <h3>CBS log</h3>
          <PortalLog rows={cbs.log} />
        </Card>
      </>
    );
  }

  if (which === "vas") {
    const vas = portals.vas as {
      host: string;
      ip: string;
      connections: Array<Record<string, string>>;
      messages: Array<Record<string, string>>;
      log: Array<Record<string, string>>;
    };
    return (
      <>
        {back}
        {banner}
        <Hint>
          <code>{vas.host}</code> · <code>{vas.ip}</code>
        </Hint>
        <ScrollCard>
          <Table>
            <thead>
              <tr>
                <th>Connection</th>
                <th>Actions</th>
                <th>Company</th>
                <th>Service</th>
                <th>Link</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vas.connections.map((c) => (
                <tr key={c.id}>
                  <td className="mono nowrap">{c.id}</td>
                  <td>
                    <RowActions>
                      {(["enable", "disable", "test"] as const).map((action) => (
                        <Btn
                          key={action}
                          type="button"
                          $variant={action === "enable" ? "teal" : "secondary"}
                          disabled={busyKey === `vas-${action}-${c.id}`}
                          onClick={() => {
                            const key = `vas-${action}-${c.id}`;
                            setBusyKey(key);
                            post("/portals/vas", { action, connectionId: c.id }).finally(() =>
                              setBusyKey(null)
                            );
                          }}
                        >
                          {action === "enable" ? "Enable" : action === "disable" ? "Disable" : "Send test"}
                        </Btn>
                      ))}
                    </RowActions>
                  </td>
                  <td>{c.company}</td>
                  <td>{c.service}</td>
                  <td>{c.name}</td>
                  <td>
                    {c.status === "up" ? (
                      <SlaOk>Up</SlaOk>
                    ) : (
                      <SlaBad>Down</SlaBad>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </ScrollCard>
        <Card>
          <h3>Test messages</h3>
          <PortalLog rows={vas.messages} />
          <h3>VAS log</h3>
          <PortalLog rows={vas.log} />
        </Card>
      </>
    );
  }

  if (which === "vpn") {
    const vpn = portals.vpn as {
      host: string;
      ip: string;
      connections: Array<Record<string, string>>;
      log: Array<Record<string, string>>;
    };
    return (
      <>
        {back}
        {banner}
        <Hint>
          <code>{vpn.host}</code> · <code>{vpn.ip}</code>
        </Hint>
        <ScrollCard>
          <Table>
            <thead>
              <tr>
                <th>Connection</th>
                <th>Actions</th>
                <th>Site</th>
                <th>Type</th>
                <th>Tunnel</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vpn.connections.map((c) => (
                <tr key={c.id}>
                  <td className="mono nowrap">{c.id}</td>
                  <td>
                    <RowActions>
                      {(["enable", "disable", "test"] as const).map((action) => (
                        <Btn
                          key={action}
                          type="button"
                          $variant={action === "enable" ? "teal" : "secondary"}
                          disabled={busyKey === `vpn-${action}-${c.id}`}
                          onClick={() => {
                            const key = `vpn-${action}-${c.id}`;
                            setBusyKey(key);
                            post("/portals/vpn", { action, connectionId: c.id }).finally(() =>
                              setBusyKey(null)
                            );
                          }}
                        >
                          {action === "enable" ? "Enable" : action === "disable" ? "Disable" : "Send test"}
                        </Btn>
                      ))}
                    </RowActions>
                  </td>
                  <td>{c.site}</td>
                  <td>{c.type}</td>
                  <td>{c.name}</td>
                  <td>
                    {c.status === "up" ? <SlaOk>Up</SlaOk> : <SlaBad>Down</SlaBad>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </ScrollCard>
        <Card>
          <h3>VPN log</h3>
          <PortalLog rows={vpn.log} />
        </Card>
      </>
    );
  }

  return <OptimisticLink to={ROUTES.PORTALS}>Back to portals</OptimisticLink>;
}

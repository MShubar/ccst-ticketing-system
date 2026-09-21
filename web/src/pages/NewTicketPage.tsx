import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { toast } from "sonner";

import { api } from "@/api/client";
import Loader from "@/components/common/Loader";
import { Btn, Card, Field, Hint } from "@/components/ui/primitives";
import { ROUTES } from "@/constants/routes";
import { usePageReady } from "@/nav/PageReadyContext";
import { useUsers } from "@/services/queries/classroom";
const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

type Requester = { id: string; name: string; department: string };

export default function NewTicketPage() {
  const navigate = useNavigate();
  const { data: users } = useUsers();
  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const { markReady } = usePageReady();

  useEffect(() => {
    api
      .get<{ requesters: Requester[] }>("/me")
      .then((res) => setRequesters(res.data.requesters || []))
      .catch(() => setRequesters([]))
      .finally(() => {
        setLoading(false);
        markReady();
      });
  }, [markReady]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const { data } = await api.post<{ id: string }>("/tickets", Object.fromEntries(fd.entries()));
      toast.success("Ticket logged");
      navigate(`${ROUTES.TICKETS}/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create ticket");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card style={{ maxWidth: 760 }}>
        <Loader variant="card" caption="Loading form…" useSkeleton />
      </Card>
    );
  }

  return (
    <Card as="form" id="new-ticket" style={{ maxWidth: 760 }} onSubmit={onSubmit}>
      <Field>
        <label>Title</label>
        <input name="title" required />
      </Field>
      <Field>
        <label>Reported issue</label>
        <textarea name="description" rows={5} required />
      </Field>
      <Grid>
        <Field>
          <label>Category</label>
          <select name="category">
            {[
              "Access & Identity",
              "Hardware",
              "Software",
              "Network",
              "Printer",
              "Virtualization",
              "Cloud",
              "Email",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field>
          <label>Priority</label>
          <select name="priority" defaultValue="">
            <option value="">Unassigned</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </Field>
      </Grid>
      <Grid>
        <Field>
          <label>Requester (simulated staff)</label>
          <select name="requesterId">
            {requesters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.department}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <label>Channel</label>
          <select name="channel">
            {["portal", "phone", "email", "chat", "walk-in", "monitoring"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </Grid>
      <Field>
        <label>Assignee</label>
        <select name="assigneeId" defaultValue="">
          <option value="">Unassigned</option>
          {(users as Array<{ id: string; fullName: string }> | undefined)?.map((u) => (
            <option key={u.id} value={u.id}>{u.fullName}</option>
          ))}
        </select>
      </Field>
      <Field>
        <label>Tags</label>
        <input name="tags" placeholder="printer, driver, finance" />
      </Field>
      <Field>
        <label>Difficulty (1-20)</label>
        <select name="difficulty" defaultValue="1">
          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              Level {n}
            </option>
          ))}
        </select>
        <Hint>Higher = more advanced. Students only see tickets at or below their level.</Hint>
      </Field>
      <Btn type="submit" $variant="teal" disabled={busy} $busy={busy}>Log ticket</Btn>
    </Card>
  );
}

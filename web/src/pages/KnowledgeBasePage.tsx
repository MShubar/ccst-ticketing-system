import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import styled from "styled-components";

import { Card, Hint } from "@/components/ui/primitives";
import { usePageReady } from "@/nav/PageReadyContext";
import { useKb } from "@/services/queries/classroom";
import type { KbArticle } from "@/types/classroom";
import { colors } from "@/theme/colors";
import { mdLite } from "@/utils/mdLite";

const KB_GROUPS = [
  { name: "Start here", slugs: ["first-checks"] },
  {
    name: "Network",
    slugs: [
      "internet-not-working",
      "slow-internet",
      "website-not-working",
      "cloud-cannot-reach",
      "server-cannot-reach",
      "printer-not-working",
    ],
  },
  { name: "Addressing", slugs: ["no-address-dhcp", "duplicate-address"] },
  { name: "Wireless", slugs: ["wifi-not-joining"] },
  {
    name: "The device itself",
    slugs: ["pc-not-working", "cable-unplugged", "which-cable", "restart-pc"],
  },
  {
    name: "Accounts and files",
    slugs: ["reset-password", "email-not-working", "share-folder"],
  },
  {
    name: "How to",
    slugs: ["how-to-ip", "how-to-ping", "how-to-tracert", "address-cheat-sheet"],
  },
  {
    name: "Process",
    slugs: [
      "sla-priority-matrix",
      "par-documentation",
      "when-to-escalate",
      "vas-cbs-updates",
    ],
  },
] as const;

function kbGrouped(articles: KbArticle[]) {
  const left = new Map(articles.map((a) => [a.slug, a]));
  const groups: { name: string; items: KbArticle[] }[] = KB_GROUPS.map((g) => ({
    name: g.name,
    items: g.slugs.map((s) => left.get(s)).filter(Boolean) as KbArticle[],
  })).filter((g) => g.items.length);
  groups.forEach((g) => g.items.forEach((a) => left.delete(a.slug)));
  if (left.size) groups.push({ name: "More", items: [...left.values()] });
  return groups;
}

const Layout = styled.div`
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
  gap: 18px;
  align-items: start;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Index = styled.aside`
  position: sticky;
  top: 18px;
  max-height: calc(100vh - 36px);
  overflow-y: auto;
  padding-right: 4px;

  @media (max-width: 900px) {
    position: static;
    max-height: none;
  }

  input[type="search"] {
    width: 100%;
    border: 1px solid ${colors.line};
    border-radius: ${({ theme }) => theme.radii.sm};
    padding: 10px 12px;
    margin-bottom: 10px;
    background: ${colors.white};
  }
`;

const Group = styled.div`
  margin-bottom: 16px;

  h3 {
    margin: 0 0 8px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${colors.muted};
    font-weight: 600;
  }
`;

const KbItem = styled.button<{ $active?: boolean }>`
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 8px 10px;
  margin-bottom: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: ${colors.ink};

  strong {
    font-weight: 600;
  }

  &:hover {
    background: ${colors.paper2};
    border-color: ${colors.line};
  }

  ${({ $active }) =>
    $active &&
    `
    background: ${colors.card};
    border-color: ${colors.line};
    box-shadow: inset 3px 0 0 ${colors.tealDeep};
  `}
`;

const Body = styled(Card)`
  max-width: 760px;

  h2 {
    font-family: ${({ theme }) => theme.fonts.serif};
    font-size: 27px;
    margin: 0 0 6px;
  }
`;

const Summary = styled.p`
  margin: 0 0 10px;
  color: ${colors.muted};
  font-size: 15px;
`;

const Chip = styled.p`
  margin: 0 0 16px;
  font-size: 12px;
  color: ${colors.muted};

  strong {
    color: ${colors.ink};
  }
`;

const Prose = styled.div`
  font-size: 14px;
  line-height: 1.5;

  h3 {
    font-size: 16px;
    margin: 20px 0 8px;
    padding-top: 12px;
    border-top: 1px solid ${colors.line};
  }

  h3:first-of-type {
    border-top: 0;
    padding-top: 0;
    margin-top: 0;
  }

  p {
    margin: 0 0 12px;
  }

  ol,
  ul {
    margin: 0 0 12px;
    padding-left: 1.35rem;
  }

  li {
    margin-bottom: 7px;
  }

  ol.kb-steps li::marker {
    font-weight: 600;
    color: ${colors.tealDeep};
  }

  pre.kb-command {
    background: ${colors.navy3};
    color: ${colors.white};
    padding: 12px 14px;
    border-radius: ${({ theme }) => theme.radii.sm};
    overflow-x: auto;
    font-size: 13px;
  }

  code {
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 0.92em;
  }

  .kb-table-wrap {
    overflow-x: auto;
    margin: 0 0 14px;
  }

  table.kb-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 14px;
  }

  table.kb-table th,
  table.kb-table td {
    text-align: left;
    padding: 7px 12px 7px 0;
    border-bottom: 1px solid ${colors.line};
    vertical-align: top;
  }

  table.kb-table th {
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: ${colors.muted};
    font-weight: 600;
  }
`;

export default function KnowledgeBasePage() {
  const { data: articles, isLoading, error } = useKb();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const { markReady } = usePageReady();

  const slug = searchParams.get("id") || "";
  const current = useMemo(() => {
    if (!articles?.length) return null;
    return articles.find((a) => a.slug === slug) || articles[0];
  }, [articles, slug]);

  useEffect(() => {
    if (articles?.length && !slug) {
      setSearchParams({ id: articles[0].slug }, { replace: true });
    }
  }, [articles, slug, setSearchParams]);

  useEffect(() => {
    if (articles || error || (!isLoading && !articles)) markReady();
  }, [articles, error, isLoading, markReady]);

  const groups = useMemo(() => (articles ? kbGrouped(articles) : []), [articles]);

  const matchSlugs = useMemo(() => {
    if (!articles) return new Set<string>();
    const q = search.trim().toLowerCase();
    if (!q) return new Set(articles.map((a) => a.slug));
    const buttons = articles.map((a) => ({
      slug: a.slug,
      q: `${a.title} ${a.summary} ${(a.tags || []).join(" ")}`.toLowerCase(),
      full: a.content.toLowerCase(),
    }));
    const byName = buttons.filter((b) => b.q.includes(q));
    const matches = byName.length ? byName : buttons.filter((b) => b.full.includes(q));
    return new Set(matches.map((m) => m.slug));
  }, [articles, search]);

  const countHint = useMemo(() => {
    const q = search.trim();
    if (!q) return "";
    if (!matchSlugs.size) {
      return `Nothing is called "${q}" — try printer, DNS, cable, or password.`;
    }
    const byName = articles?.filter((a) =>
      `${a.title} ${a.summary}`.toLowerCase().includes(q.toLowerCase())
    );
    if (byName?.length) {
      return matchSlugs.size === 1 ? "1 article" : `${matchSlugs.size} articles`;
    }
    return matchSlugs.size === 1 ? "1 article mentions it" : `${matchSlugs.size} articles mention it`;
  }, [articles, matchSlugs, search]);

  if (isLoading && !articles) return null;
  if (error || !articles || !current) {
    return (
      <Card>
        <p style={{ color: colors.coral, margin: 0 }}>Could not load knowledge base.</p>
      </Card>
    );
  }

  return (
    <Layout>
      <Index>
        <input
          type="search"
          placeholder="Search"
          aria-label="Search the knowledge base"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {countHint ? <Hint style={{ marginBottom: 10 }}>{countHint}</Hint> : null}
        {groups.map((g) => {
          const visible = g.items.some((a) => matchSlugs.has(a.slug));
          if (!visible && search.trim()) return null;
          return (
            <Group key={g.name}>
              <h3>{g.name}</h3>
              {g.items.map((a) => {
                if (!matchSlugs.has(a.slug)) return null;
                return (
                  <KbItem
                    key={a.slug}
                    type="button"
                    $active={a.slug === current.slug}
                    onClick={() => setSearchParams({ id: a.slug })}
                  >
                    <strong>{a.title}</strong>
                  </KbItem>
                );
              })}
            </Group>
          );
        })}
      </Index>
      <Body className="prose">
        <h2>{current.title}</h2>
        <Summary>{current.summary}</Summary>
        <Chip>
          <strong>{current.category}</strong>
        </Chip>
        <Prose dangerouslySetInnerHTML={{ __html: mdLite(current.content) }} />
      </Body>
    </Layout>
  );
}

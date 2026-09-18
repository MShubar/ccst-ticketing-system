export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function mdInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,;:)])/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/**
 * Knowledge-base markdown. A student reads these while a caller waits, so the
 * structure that makes a procedure skimmable — numbered steps, tables, command
 * blocks — has to survive into the page rather than flattening into prose.
 */
export function mdLite(text: string): string {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let i = 0;

  const heading = (l: string) => /^(#{1,3})\s+(.+)$/.exec(l.trim());
  const step = (l: string) => /^(\d+)\.\s+(.+)$/.exec(l.trim());
  const bullet = (l: string) => /^[-*]\s+(.+)$/.exec(l.trim());
  const subBullet = (l: string) => /^\s{2,}[-*]\s+(.+)$/.exec(l);
  const tableRow = (l: string) => /^\|.*\|\s*$/.test(l.trim());
  const tableDivider = (l: string) => /^\|[\s:|-]+\|\s*$/.test(l.trim());
  const fence = (l: string) => /^```/.test(l.trim());
  const cells = (l: string) =>
    l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const blockStart = (l: string) =>
    !l.trim() || heading(l) || step(l) || bullet(l) || tableRow(l) || fence(l);

  type ListItem = { text: string; subs: string[] };
  const items = (list: ListItem[], tag: string, attrs = "") =>
    `<${tag}${attrs}>${list
      .map(
        (it) =>
          `<li>${it.text}${it.subs.length ? `<ul>${it.subs.map((s) => `<li>${s}</li>`).join("")}</ul>` : ""}</li>`
      )
      .join("")}</${tag}>`;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    if (fence(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !fence(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++;
      out.push(`<pre class="kb-command"><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    const head = heading(line);
    if (head) {
      const level = head[1].length === 1 ? 2 : 3;
      out.push(`<h${level}>${mdInline(head[2])}</h${level}>`);
      i++;
      continue;
    }

    if (tableRow(line)) {
      const headCells = cells(line);
      i++;
      if (i < lines.length && tableDivider(lines[i])) i++;
      const rows: string[][] = [];
      while (i < lines.length && tableRow(lines[i])) {
        rows.push(cells(lines[i]));
        i++;
      }
      out.push(
        `<div class="kb-table-wrap"><table class="kb-table">` +
          `<thead><tr>${headCells.map((c) => `<th>${mdInline(c)}</th>`).join("")}</tr></thead>` +
          `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${mdInline(c)}</td>`).join("")}</tr>`).join("")}</tbody>` +
          `</table></div>`
      );
      continue;
    }

    if (step(line)) {
      const start = Number(step(line)![1]);
      const list: ListItem[] = [];
      while (i < lines.length) {
        const m = step(lines[i]);
        if (m) {
          list.push({ text: mdInline(m[2]), subs: [] });
          i++;
          continue;
        }
        const sub = subBullet(lines[i]);
        if (sub && list.length) {
          list[list.length - 1].subs.push(mdInline(sub[1]));
          i++;
          continue;
        }
        break;
      }
      out.push(
        items(
          list,
          "ol",
          start === 1 ? ` class="kb-steps"` : ` class="kb-steps" start="${start}"`
        )
      );
      continue;
    }

    if (bullet(line)) {
      const list: ListItem[] = [];
      while (i < lines.length && bullet(lines[i]) && !subBullet(lines[i])) {
        list.push({ text: mdInline(bullet(lines[i])![1]), subs: [] });
        i++;
      }
      out.push(items(list, "ul"));
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && !blockStart(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${mdInline(para.join(" "))}</p>`);
  }

  return out.join("");
}

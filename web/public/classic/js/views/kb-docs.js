import { api, escapeHtml, mdLite, navigateApp } from "../lib/util.js";
import { shell } from "../lib/shell.js";

/* Ticket-shaped groups first, then the reference pages, then the process ones,
 * because that is the order a student needs them in during a call. */
const KB_GROUPS = [
  { name: "Start here", slugs: ["first-checks"] },
  { name: "Network", slugs: ["internet-not-working", "slow-internet", "website-not-working", "cloud-cannot-reach", "server-cannot-reach", "printer-not-working"] },
  { name: "Addressing", slugs: ["no-address-dhcp", "duplicate-address"] },
  { name: "Wireless", slugs: ["wifi-not-joining"] },
  { name: "The device itself", slugs: ["pc-not-working", "cable-unplugged", "which-cable", "restart-pc"] },
  { name: "Accounts and files", slugs: ["reset-password", "email-not-working", "share-folder"] },
  { name: "How to", slugs: ["how-to-ip", "how-to-ping", "how-to-tracert", "address-cheat-sheet"] },
  { name: "Process", slugs: ["sla-priority-matrix", "par-documentation", "when-to-escalate", "vas-cbs-updates"] }
];

function kbGrouped(articles) {
  const left = new Map(articles.map((a) => [a.slug, a]));
  const groups = KB_GROUPS.map((g) => ({
    name: g.name,
    items: g.slugs.map((s) => left.get(s)).filter(Boolean)
  })).filter((g) => g.items.length);
  groups.forEach((g) => g.items.forEach((a) => left.delete(a.slug)));
  // Anything added to the seed file later still shows up without a code change.
  if (left.size) groups.push({ name: "More", items: [...left.values()] });
  return groups;
}

async function renderKb(id) {
  const articles = await api("/api/kb");
  const current = articles.find((a) => a.slug === id) || articles[0];
  const groups = kbGrouped(articles);
  // Two haystacks: the name of the article, and everything in it. Searching
  // the whole text of 21 articles matches most of them, so the body is only
  // consulted when nothing is called what the student typed.
  const item = (a) => `<button class="kb-item ${a.slug === current.slug ? "active" : ""}" data-slug="${a.slug}"
      data-q="${escapeHtml((a.title + " " + a.summary + " " + (a.tags || []).join(" ")).toLowerCase())}"
      data-full="${escapeHtml(a.content.toLowerCase())}">
      <strong>${escapeHtml(a.title)}</strong><span class="kb-item-summary">${escapeHtml(a.summary)}</span>
    </button>`;

  shell(
    "Knowledge base",
    "",
    `
    <div class="kb-layout">
      <aside class="kb-index">
        <input id="kb-search" type="search" placeholder="Search" aria-label="Search the knowledge base" />
        <p class="hint" id="kb-count" hidden></p>
        ${groups.map((g) => `
          <div class="kb-group" data-group="${escapeHtml(g.name)}">
            <h3>${escapeHtml(g.name)}</h3>
            ${g.items.map(item).join("")}
          </div>`).join("")}
      </aside>
      <article class="card prose kb-body">
        <h2>${escapeHtml(current.title)}</h2>
        <p class="kb-summary">${escapeHtml(current.summary)}</p>
        <p class="kb-chip"><strong>${escapeHtml(current.category)}</strong></p>
        ${mdLite(current.content)}
      </article>
    </div>`
  );

  document.querySelectorAll("[data-slug]").forEach((btn) => {
    btn.onclick = () => { navigateApp("#/kb?id=" + btn.dataset.slug); };
  });

  const search = document.getElementById("kb-search");
  const count = document.getElementById("kb-count");
  const buttons = [...document.querySelectorAll(".kb-item")];
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    const byName = q ? buttons.filter((b) => b.dataset.q.includes(q)) : buttons;
    const matches = new Set(byName.length ? byName : buttons.filter((b) => b.dataset.full.includes(q)));
    buttons.forEach((b) => { b.hidden = !matches.has(b); });
    document.querySelectorAll(".kb-group").forEach((group) => {
      group.hidden = ![...group.querySelectorAll(".kb-item")].some((b) => !b.hidden);
    });
    count.hidden = !q;
    if (!matches.size) count.textContent = `Nothing is called "${search.value.trim()}" — try printer, DNS, cable, or password.`;
    else if (!byName.length) count.textContent = matches.size === 1 ? "1 article mentions it" : `${matches.size} articles mention it`;
    else count.textContent = matches.size === 1 ? "1 article" : `${matches.size} articles`;
  };
}

export { renderKb };

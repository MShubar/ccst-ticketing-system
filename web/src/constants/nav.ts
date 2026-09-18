import { ROUTES } from "@/constants/routes";

export type NavItem = {
  to: string;
  label: string;
  /** Exact path match only (dashboard). */
  end?: boolean;
};

/** Primary sidebar links. */
export const SIDEBAR_NAV: NavItem[] = [
  { to: ROUTES.DASHBOARD, label: "Dashboard", end: true },
  { to: ROUTES.TICKETS, label: "Ticket queue" },
  { to: ROUTES.MAP, label: "Lab map" },
  { to: ROUTES.PORTALS, label: "Portals" },
];

/** Profile-menu extras (labels may depend on role). */
export function profileExtras(isInstructor: boolean): NavItem[] {
  return [
    { to: ROUTES.PROGRESS, label: "My progress" },
    {
      to: ROUTES.TEAM,
      label: isInstructor ? "Class & students" : "Team",
    },
    { to: ROUTES.KB, label: "Knowledge base" },
  ];
}

export function titleForPath(path: string, isInstructor: boolean): string {
  if (path === ROUTES.TICKETS_NEW || path.startsWith(`${ROUTES.TICKETS_NEW}/`)) {
    return "New ticket";
  }
  if (path.startsWith(`${ROUTES.TICKETS}/`) && path !== ROUTES.TICKETS) {
    return "Ticket";
  }

  const titles: [string, string][] = [
    [ROUTES.TICKETS, "Ticket queue"],
    [ROUTES.MAP, "Lab map"],
    [ROUTES.PORTALS, "Portals"],
    [ROUTES.TEAM, isInstructor ? "Class & students" : "Team"],
    [ROUTES.PROGRESS, "My progress"],
    [ROUTES.KB, "Knowledge base"],
  ];

  for (const [prefix, title] of titles) {
    if (path.startsWith(prefix)) return title;
  }
  return "Dashboard";
}

export function pathActive(
  current: string,
  to: string,
  end = false
): boolean {
  if (end) return current === to;
  return current === to || current.startsWith(`${to}/`);
}

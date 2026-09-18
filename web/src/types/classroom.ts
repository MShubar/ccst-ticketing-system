/** Shapes returned by GET /api/dashboard and GET /api/kb. */

export type KpiBlock = {
  scope?: string;
  total?: number;
  backlog?: number;
  resolved?: number;
  avgResponseMinutes?: number | null;
  avgResolutionMinutes?: number | null;
  slaCompliance?: number | null;
  byPriority?: {
    unassigned?: number;
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
  };
};

export type DashboardHealth = {
  open?: number;
  unowned?: number;
  owned?: number;
  escalated?: number;
  pending?: number;
  new?: number;
  inProgress?: number;
  resolveRate?: number | null;
};

export type GradeBand = {
  key?: string;
  label?: string;
  color?: string;
};

export type GradePart = {
  key: string;
  label: string;
  weight: number;
  raw: number | null;
  points: number | null;
  note: string | null;
};

export type Grade = {
  score?: number | null;
  band?: GradeBand;
  parts?: GradePart[];
  summary?: string;
};

export type DashboardProgress = {
  assigned?: number;
  open?: number;
  resolved?: number;
  reviewed?: number;
  reviewPending?: number;
  grade?: Grade;
};

export type Dashboard = {
  focus?: "desk" | "class";
  mine?: KpiBlock;
  queue?: KpiBlock;
  breachedCount?: number;
  health?: DashboardHealth;
  progress?: DashboardProgress;
};

export type KbArticle = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  content: string;
  tags?: string[];
};

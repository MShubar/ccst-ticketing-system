export type UserRole = "instructor" | "technician" | "student";

export type CurriculumLevel = {
  level: number;
  title: string;
  description: string;
};

export type AuthUser = {
  id: string;
  username: string;
  fullName: string;
  email?: string | null;
  role: UserRole | string;
  level: number;
  classId: string | null;
  className: string | null;
  cohort?: string | null;
};

export type ClassInfo = {
  id: string;
  name: string;
  announcement?: { text?: string; updatedBy?: string; updatedAt?: string } | null;
  [key: string]: unknown;
};

export type MeResponse = {
  user: AuthUser;
  class: ClassInfo | null;
  announcement: ClassInfo["announcement"];
  meta: Record<string, unknown>;
  requesters: unknown[];
  storage: string;
};

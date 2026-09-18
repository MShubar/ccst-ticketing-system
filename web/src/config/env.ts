export const env = {
  API_URL: String(import.meta.env.VITE_API_URL || "/api"),
} as const;

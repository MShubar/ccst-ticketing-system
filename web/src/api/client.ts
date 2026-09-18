import axios from "axios";
import { env } from "@/config/env";

/** Cookie-session API client (same auth model as the classic frontend). */
export const api = axios.create({
  baseURL: env.API_URL,
  timeout: 30000,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

import type { AuthUser } from "@/types/auth";
import type { LoginFormValues, RegisterFormValues } from "./auth.schema";

export type LoginRequest = LoginFormValues;
export type RegisterRequest = RegisterFormValues;

export type LoginResponse = {
  user: AuthUser;
};

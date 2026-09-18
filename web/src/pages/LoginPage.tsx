import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import styled from "styled-components";

import FormError from "@/components/ui/FormError";
import { BrandKicker, Btn, Field, Hint } from "@/components/ui/primitives";
import { ROUTES } from "@/constants/routes";
import {
  useLogin,
  useRegisterInstructor,
} from "@/services/mutations/auth/auth.hooks";
import {
  loginSchema,
  registerSchema,
  type LoginFormValues,
  type RegisterFormValues,
} from "@/services/mutations/auth/auth.schema";
import { useAuthStore } from "@/store/auth/authStore";
import { colors } from "@/theme/colors";

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return ROUTES.DASHBOARD;
  if (raw.startsWith("/login")) return ROUTES.DASHBOARD;
  return raw;
}

const LoginRoot = styled.div`
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  background: ${colors.navy};

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const LoginCopy = styled.section`
  color: ${colors.loginCopy};
  padding: 64px;
  background:
    radial-gradient(800px 300px at 10% 10%, ${colors.tealGlowStrong}, transparent 45%),
    ${colors.navy};

  h1 {
    font-family: ${({ theme }) => theme.fonts.serif};
    font-size: 54px;
    line-height: 0.95;
    margin: 12px 0 18px;
  }

  @media (max-width: 900px) {
    padding: 40px 28px 24px;
    h1 { font-size: 40px; }
  }
`;

const CertNote = styled.p`
  color: ${colors.sidebarMuted};
  font-size: 13px;
  margin-top: 28px;
`;

const LoginPanel = styled.section`
  background: ${colors.paper};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
`;

const LoginCard = styled.form`
  width: min(420px, 100%);

  h2 {
    font-family: ${({ theme }) => theme.fonts.serif};
    font-size: 32px;
    margin: 0 0 8px;
  }
`;

const ModeRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 8px;

  ${Btn} {
    flex: 1;
  }
`;

export default function LoginPage() {
  const status = useAuthStore((s) => s.status);
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [params] = useSearchParams();
  const nextPath = safeNextPath(params.get("next"));
  const login = useLogin(nextPath);
  const registerMutation = useRegisterInstructor(nextPath);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      signupCode: "",
      className: "",
      fullName: "",
      username: "",
      password: "",
    },
  });

  if (status === "authenticated") {
    return <Navigate to={nextPath} replace />;
  }

  const pending = login.isPending || registerMutation.isPending;
  const apiError =
    mode === "signin"
      ? (login.error as { response?: { data?: { error?: string } } } | null)?.response?.data
          ?.error
      : (registerMutation.error as { response?: { data?: { error?: string } } } | null)
          ?.response?.data?.error;

  return (
    <LoginRoot>
      <LoginCopy>
        <BrandKicker>ProCloud Training Center</BrandKicker>
        <h1>CCST Ticketing</h1>
        <p>Classroom help desk for CCST IT Support.</p>
        <CertNote>Cisco Certified Support Technician IT Support</CertNote>
      </LoginCopy>
      <LoginPanel>
        <LoginCard
          onSubmit={
            mode === "signin"
              ? loginForm.handleSubmit((values) => login.mutate(values))
              : registerForm.handleSubmit((values) =>
                  registerMutation.mutate(values)
                )
          }
        >
          <BrandKicker>CCST Ticketing</BrandKicker>
          <h2>{mode === "register" ? "Create your class" : "Sign in"}</h2>
          <Hint>
            {mode === "register"
              ? "Ask the trainer for the signup code."
              : "Use the username and password for your class."}
          </Hint>
          <ModeRow>
            <Btn
              type="button"
              $variant={mode === "signin" ? "teal" : "secondary"}
              onClick={() => {
                setMode("signin");
                login.reset();
                registerMutation.reset();
              }}
            >
              Sign in
            </Btn>
            <Btn
              type="button"
              $variant={mode === "register" ? "teal" : "secondary"}
              onClick={() => {
                setMode("register");
                login.reset();
                registerMutation.reset();
              }}
            >
              Instructor signup
            </Btn>
          </ModeRow>

          {mode === "register" ? (
            <>
              <Field>
                <label>Signup code</label>
                <input {...registerForm.register("signupCode")} autoComplete="off" />
                <FormError message={registerForm.formState.errors.signupCode?.message} />
              </Field>
              <Field>
                <label>Class name</label>
                <input {...registerForm.register("className")} placeholder="CCST IT Support G19" />
                <FormError message={registerForm.formState.errors.className?.message} />
              </Field>
              <Field>
                <label>Your full name</label>
                <input {...registerForm.register("fullName")} />
                <FormError message={registerForm.formState.errors.fullName?.message} />
              </Field>
              <Field>
                <label>Username</label>
                <input {...registerForm.register("username")} autoComplete="username" />
                <FormError message={registerForm.formState.errors.username?.message} />
              </Field>
              <Field>
                <label>Password</label>
                <input
                  type="password"
                  {...registerForm.register("password")}
                  autoComplete="new-password"
                />
                <FormError message={registerForm.formState.errors.password?.message} />
              </Field>
            </>
          ) : (
            <>
              <Field>
                <label>Username</label>
                <input {...loginForm.register("username")} autoComplete="username" />
                <FormError message={loginForm.formState.errors.username?.message} />
              </Field>
              <Field>
                <label>Password</label>
                <input
                  type="password"
                  {...loginForm.register("password")}
                  autoComplete="current-password"
                />
                <FormError message={loginForm.formState.errors.password?.message} />
              </Field>
            </>
          )}

          <FormError message={apiError} />

          <Btn $variant="teal" type="submit" disabled={pending} $busy={pending}>
            {pending
              ? "Working…"
              : mode === "register"
                ? "Create class"
                : "Open the queue"}
          </Btn>
        </LoginCard>
      </LoginPanel>
    </LoginRoot>
  );
}

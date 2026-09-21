import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import styled from "styled-components";

import { BrandKicker, Btn, Hint } from "@/components/ui/primitives";
import { useLogin, useRegisterInstructor } from "@/services/mutations/auth/auth.hooks";
import {
  loginSchema,
  registerSchema,
  type LoginFormValues,
  type RegisterFormValues,
} from "@/services/mutations/auth/auth.schema";
import { useAuthStore } from "@/store/auth/authStore";
import { colors } from "@/theme/colors";

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
  ${Btn} { flex: 1; }
`;

const InputRow = styled.div`
  margin-bottom: 12px;
  label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: ${colors.muted};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
  }
  input {
    width: 100%;
    border: 1px solid ${colors.line};
    border-radius: 4px;
    padding: 10px 12px;
    background: #ffffff;
    color: ${colors.ink};
    font-size: 15px;
    box-sizing: border-box;
  }
  input:focus {
    outline: 2px solid ${colors.teal};
    outline-offset: 1px;
  }
`;

const ErrorText = styled.div`
  color: #e53e3e;
  font-size: 13px;
  margin-top: 4px;
`;

export default function LoginPage() {
  const status = useAuthStore((s) => s.status);
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const login = useLogin("/dashboard");
  const register = useRegisterInstructor("/dashboard");

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
    return <Navigate to="/dashboard" replace />;
  }

  const pending = mode === "register" ? register.isPending : login.isPending;
  const error =
    (mode === "register" ? register.error : login.error) as
    | { response?: { data?: { error?: string } } }
    | null,
    apiError = error?.response?.data?.error;

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
            mode === "register"
              ? registerForm.handleSubmit((values) => register.mutate(values))
              : loginForm.handleSubmit((values) => login.mutate(values))
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
              onClick={() => setMode("signin")}
            >
              Sign in
            </Btn>
            <Btn
              type="button"
              $variant={mode === "register" ? "teal" : "secondary"}
              onClick={() => setMode("register")}
            >
              Instructor signup
            </Btn>
          </ModeRow>

          {mode === "register" ? (
            <>
              <InputRow>
                <label>Signup code</label>
                <input
                  {...registerForm.register("signupCode")}
                  autoComplete="off"
                  placeholder="Code from the trainer"
                />
                {registerForm.formState.errors.signupCode && (
                  <ErrorText>{registerForm.formState.errors.signupCode.message}</ErrorText>
                )}
              </InputRow>
              <InputRow>
                <label>Class name</label>
                <input
                  {...registerForm.register("className")}
                  placeholder="CCST IT Support G19"
                />
                {registerForm.formState.errors.className && (
                  <ErrorText>{registerForm.formState.errors.className.message}</ErrorText>
                )}
              </InputRow>
              <InputRow>
                <label>Your full name</label>
                <input {...registerForm.register("fullName")} autoComplete="name" />
                {registerForm.formState.errors.fullName && (
                  <ErrorText>{registerForm.formState.errors.fullName.message}</ErrorText>
                )}
              </InputRow>
              <InputRow>
                <label>Username</label>
                <input {...registerForm.register("username")} autoComplete="username" />
                {registerForm.formState.errors.username && (
                  <ErrorText>{registerForm.formState.errors.username.message}</ErrorText>
                )}
              </InputRow>
              <InputRow>
                <label>Password</label>
                <input
                  type="password"
                  {...registerForm.register("password")}
                  autoComplete="new-password"
                />
                {registerForm.formState.errors.password && (
                  <ErrorText>{registerForm.formState.errors.password.message}</ErrorText>
                )}
              </InputRow>
            </>
          ) : (
            <>
              <InputRow>
                <label>Username</label>
                <input {...loginForm.register("username")} autoComplete="username" />
                {loginForm.formState.errors.username && (
                  <ErrorText>{loginForm.formState.errors.username.message}</ErrorText>
                )}
              </InputRow>
              <InputRow>
                <label>Password</label>
                <input
                  type="password"
                  {...loginForm.register("password")}
                  autoComplete="current-password"
                />
                {loginForm.formState.errors.password && (
                  <ErrorText>{loginForm.formState.errors.password.message}</ErrorText>
                )}
              </InputRow>
            </>
          )}

          {apiError && <ErrorText style={{ marginTop: 8 }}>{apiError}</ErrorText>}

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

import styled, { css, keyframes } from "styled-components";

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

export const BrandKicker = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.teal};
`;

export const Hint = styled.p`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 8px;
`;

export const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.coral};
  font-size: 13px;
  margin: 0 0 10px;
`;

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;

  label {
    font-size: 12px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.muted};
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  input,
  select,
  textarea {
    border: 1px solid ${({ theme }) => theme.colors.line};
    border-radius: ${({ theme }) => theme.radii.sm};
    padding: 10px 12px;
    background: #ffffff !important;
    color: ${({ theme }) => theme.colors.ink} !important;
    font-family: inherit;
    font-size: inherit;
    border: 1px solid ${({ theme }) => theme.colors.line} !important;
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: 2px solid ${({ theme }) => theme.colors.teal};
    outline-offset: 1px;
  }

  input::placeholder,
  textarea::placeholder {
    color: ${({ theme }) => theme.colors.muted};
    opacity: 0.7;
  }
`;



// Explicit styled input for forms — avoids any theme resolution issues
export const FormInput = styled.input`
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 10px 12px;
  background: #ffffff;
  color: ${({ theme }) => theme.colors.ink};
  font-family: inherit;
  font-size: inherit;
  width: 100%;

  &:focus {
    outline: 2px solid ${({ theme }) => theme.colors.teal};
    outline-offset: 1px;
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
    opacity: 0.7;
  }
`;
type BtnVariant = "primary" | "secondary" | "teal" | "danger";

export const Btn = styled.button<{ $variant?: BtnVariant; $busy?: boolean }>`
  border: 0;
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 8px 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.white};
  background: ${({ theme }) => theme.colors.navy2};
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    transform 0.12s ease,
    opacity 0.15s ease;

  ${({ $variant, theme }) =>
    $variant === "secondary" &&
    css`
      background: ${theme.colors.white};
      color: ${theme.colors.ink};
      border: 1px solid ${theme.colors.line};
    `}

  ${({ $variant, theme }) =>
    $variant === "teal" &&
    css`
      background: ${theme.colors.tealDeep};
    `}

  ${({ $variant, theme }) =>
    $variant === "danger" &&
    css`
      background: ${theme.colors.coral};
    `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  ${({ $busy }) =>
    $busy &&
    css`
      position: relative;
      opacity: 0.72;
      cursor: wait;
      pointer-events: none;

      &::after {
        content: "";
        display: inline-block;
        width: 0.7em;
        height: 0.7em;
        margin-left: 0.45em;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        vertical-align: -0.1em;
        animation: ${spin} 0.55s linear infinite;
      }
    `}

  &:active:not([disabled]) {
    transform: translateY(1px);
  }
`;

export const Card = styled.div`
  background: ${({ theme }) => theme.colors.card};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.xl};
  padding: 16px 18px;
  box-shadow: ${({ theme }) => theme.colors.shadow};

  h2,
  h3 {
    margin: 0 0 10px;
    font-size: 15px;
  }
`;

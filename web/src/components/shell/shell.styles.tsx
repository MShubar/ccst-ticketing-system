import styled, { css } from "styled-components";

import { colors } from "@/theme/colors";

export const Shell = styled.div<{ $pending?: boolean; $ready?: boolean; $mobileNavOpen?: boolean }>`
  display: grid;
  grid-template-columns: 248px 1fr;
  min-height: 100vh;
  visibility: ${({ $ready }) => ($ready ? "visible" : "hidden")};

  ${({ $pending }) =>
    $pending &&
    css`
      & > .workspace .content {
        opacity: 0.72;
        transition: opacity 0.15s ease;
      }
    `}

  ${({ $mobileNavOpen }) =>
    $mobileNavOpen &&
    css`
      grid-template-columns: 280px 1fr;
    `}

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

export const SidebarRoot = styled.aside<{ $mobileOpen?: boolean }>`
  background:
    radial-gradient(1200px 400px at -10% -10%, ${colors.tealGlow}, transparent 50%),
    linear-gradient(180deg, ${colors.navy2}, ${colors.navy});
  color: ${colors.sidebarText};
  padding: 22px 16px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 100;
  transform: translateX(${({ $mobileOpen }) => ($mobileOpen ? 0 : "-100%")});

  @media (min-width: 901px) {
    position: static;
    transform: none;
  }
`;

export const BrandTitle = styled.div`
  font-family: ${({ theme }) => theme.fonts.serif};
  font-size: 28px;
  line-height: 1.05;
  margin: 6px 0 4px;
`;

export const BrandSub = styled.div`
  font-size: 12px;
  color: ${colors.sidebarMuted};
`;

export const NavList = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const NavLink = styled.a<{ $active?: boolean }>`
  color: ${colors.navLink};
  text-decoration: none;
  padding: 9px 10px;
  border-radius: ${({ theme }) => theme.radii.sm};
  font-size: 13.5px;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background: ${colors.whiteSoft};
    color: ${colors.white};
  }

  ${({ $active }) =>
    $active &&
    css`
      background: ${colors.whiteSoft};
      color: ${colors.white};
      box-shadow: inset 3px 0 0 ${colors.teal};
    `}
`;

export const Workspace = styled.div.attrs({ className: "workspace" })`
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: ${colors.white};
`;

export const Topbar = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid ${colors.line};
  background: ${colors.white};

  h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  @media (max-width: 480px) {
    padding: 12px 14px;

    h1 {
      font-size: 16px;
    }
  }
`;

export const Content = styled.main.attrs({ className: "content" })`
  padding: 20px 20px 40px;
  background: ${colors.white};
  flex: 1;

  @media (max-width: 480px) {
    padding: 14px 14px 32px;
  }
`;

export const MenuButton = styled.button`
  display: none;
  width: 40px;
  height: 40px;
  border: 1px solid ${colors.line};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${colors.white};
  cursor: pointer;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;

  span {
    display: block;
    width: 20px;
    height: 2px;
    background: ${colors.ink};
    border-radius: 1px;
  }

  @media (max-width: 900px) {
    display: flex;
  }
`;

export const MobileNavOverlay = styled.div<{ $open?: boolean }>`
  display: ${({ $open }) => ($open ? "block" : "none")};
  position: fixed;
  inset: 0;
  background: rgba(7, 19, 31, 0.5);
  z-index: 99;

  @media (min-width: 901px) {
    display: none;
  }
`;

export const CloseButton = styled.button`
  position: absolute;
  top: 14px;
  right: 14px;
  width: 34px;
  height: 34px;
  border-radius: ${({ theme }) => theme.radii.sm};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.ink};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    transform 0.1s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.paper2};
    border-color: ${({ theme }) => theme.colors.teal};
  }

  &:active {
    transform: scale(0.94);
  }

  svg {
    width: 18px;
    height: 18px;
    stroke: ${({ theme }) => theme.colors.ink};
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
  }
`;

export const AlertBox = styled.div<{ $variant?: "warning" | "announce" }>`
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 12px 14px;
  margin-bottom: 16px;
  line-height: 1.5;

  ${({ $variant }) =>
    $variant === "announce"
      ? css`
          display: flex;
          flex-wrap: wrap;
          gap: 8px 14px;
          align-items: baseline;
          background: linear-gradient(
            90deg,
            ${colors.announceBgFrom},
            ${colors.announceBgTo}
          );
          border: 1px solid ${colors.announceBorder};
          color: ${colors.announceText};
          font-size: 14px;

          strong {
            letter-spacing: 0.04em;
            text-transform: uppercase;
            font-size: 11px;
          }
        `
      : css`
          border: 1px solid ${colors.warningBorder};
          background: ${colors.warningBg};
          color: ${colors.warningText};
          font-size: 13px;
        `}
`;

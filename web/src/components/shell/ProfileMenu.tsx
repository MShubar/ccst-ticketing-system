import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import styled, { css } from "styled-components";

import { pathActive, type NavItem } from "@/constants/nav";
import { colors } from "@/theme/colors";

type Props = {
  fullName?: string;
  meta: string;
  extras: NavItem[];
  currentPath: string;
  loggingOut?: boolean;
  onNavigate: (to: string) => void;
  onLogout: () => void;
};

const Root = styled.div`
  position: relative;
  flex-shrink: 0;
`;

const Trigger = styled.button<{ $open?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 6px 22px 6px 10px;
  text-align: right;
  color: inherit;
  position: relative;
  transition: border-color 0.15s ease, background 0.15s ease;

  &:hover {
    border-color: ${colors.line};
    background: ${colors.white};
  }

  ${({ $open }) =>
    $open &&
    css`
      border-color: ${colors.line};
      background: ${colors.white};
    `}

  &::after {
    content: "";
    position: absolute;
    right: 10px;
    bottom: 10px;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 5px solid ${colors.muted};
    opacity: 0.7;
  }
`;

const Name = styled.span`
  font-weight: 600;
  font-size: 13px;
  line-height: 1.2;
`;

const Meta = styled.span`
  font-size: 12px;
  color: ${colors.muted};
`;

const Menu = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 200px;
  padding: 6px;
  background: ${colors.white};
  border: 1px solid ${colors.line};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${colors.shadow};
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const MenuLink = styled.a<{ $active?: boolean }>`
  display: block;
  width: 100%;
  text-align: left;
  padding: 9px 12px;
  border: 0;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ $active }) => ($active ? colors.tealSoft : "transparent")};
  color: ${({ $active }) => ($active ? colors.tealDeep : colors.ink)};
  text-decoration: none;
  font-size: 13px;

  &:hover {
    background: ${colors.tealSoft};
    color: ${colors.tealDeep};
  }
`;

const Sep = styled.div`
  height: 1px;
  margin: 4px 6px;
  background: ${colors.line};
`;

const LogoutBtn = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  padding: 9px 12px;
  border: 0;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: transparent;
  color: ${colors.coral};
  font-size: 13px;
  font-weight: 500;

  &:hover {
    background: ${colors.coralSoft};
  }
`;

export default function ProfileMenu({
  fullName,
  meta,
  extras,
  currentPath,
  loggingOut,
  onNavigate,
  onLogout,
}: Props) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <Root id="profile-menu" ref={ref}>
      <Trigger
        type="button"
        $open={open}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <Name>{fullName}</Name>
        <Meta>{meta}</Meta>
      </Trigger>
      {open ? (
        <Menu role="menu">
          {extras.map((item) => (
            <MenuLink
              key={item.to}
              role="menuitem"
              href={item.to}
              $active={pathActive(currentPath, item.to)}
              onClick={(event) => {
                event.preventDefault();
                setOpen(false);
                onNavigate(item.to);
              }}
            >
              {item.label}
            </MenuLink>
          ))}
          <Sep role="separator" />
          <LogoutBtn
            type="button"
            role="menuitem"
            id="logout"
            disabled={loggingOut}
            onClick={onLogout}
          >
            Sign out
          </LogoutBtn>
        </Menu>
      ) : null}
    </Root>
  );
}

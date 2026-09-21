import { BrandKicker } from "@/components/ui/primitives";
import { SIDEBAR_NAV, pathActive, type NavItem } from "@/constants/nav";
import {
  BrandSub,
  BrandTitle,
  NavLink,
  NavList,
  SidebarRoot,
  CloseButton,
} from "@/components/shell/shell.styles";

type Props = {
  classLabel: string;
  currentPath: string;
  onNavigate: (to: string) => void;
  onCloseMobile?: () => void;
  items?: NavItem[];
  mobileOpen?: boolean;
};

export default function SidebarNav({
  classLabel,
  currentPath,
  onNavigate,
  onCloseMobile,
  items = SIDEBAR_NAV,
  mobileOpen = false,
}: Props) {
  return (
    <SidebarRoot $mobileOpen={mobileOpen}>
      {mobileOpen && (
        <CloseButton type="button" onClick={() => { onNavigate(""); onCloseMobile?.(); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </CloseButton>
      )}
      <div>
        <BrandKicker>ProCloud</BrandKicker>
        <BrandTitle>CCST Ticketing</BrandTitle>
        <BrandSub>{classLabel}</BrandSub>
      </div>
      <NavList>
        {items.map((item) => (
          <NavLink
            key={item.to}
            href={item.to}
            $active={pathActive(currentPath, item.to, item.end)}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(item.to);
            }}
          >
            {item.label}
          </NavLink>
        ))}
      </NavList>
    </SidebarRoot>
  );
}

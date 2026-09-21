import { BrandKicker } from "@/components/ui/primitives";
import { SIDEBAR_NAV, pathActive, type NavItem } from "@/constants/nav";
import {
  BrandSub,
  BrandTitle,
  NavLink,
  NavList,
  SidebarRoot,
} from "@/components/shell/shell.styles";
import { colors } from "@/theme/colors";

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
        <button
          type="button"
          onClick={() => { onNavigate(""); onCloseMobile?.(); }}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            padding: "6px 10px",
            fontSize: 18,
            border: "1px solid " + colors?.line || "#d9d1c3",
            borderRadius: "4px",
            background: "#ffffff",
            cursor: "pointer",
            color: "#17202a",
          }}
        >
          ✕
        </button>
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

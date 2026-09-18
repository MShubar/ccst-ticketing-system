import { BrandKicker } from "@/components/ui/primitives";
import { SIDEBAR_NAV, pathActive, type NavItem } from "@/constants/nav";
import {
  BrandSub,
  BrandTitle,
  NavLink,
  NavList,
  SidebarRoot,
} from "@/components/shell/shell.styles";

type Props = {
  classLabel: string;
  currentPath: string;
  onNavigate: (to: string) => void;
  items?: NavItem[];
};

export default function SidebarNav({
  classLabel,
  currentPath,
  onNavigate,
  items = SIDEBAR_NAV,
}: Props) {
  return (
    <SidebarRoot>
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

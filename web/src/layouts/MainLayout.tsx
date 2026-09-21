import { Outlet } from "react-router-dom";
import { useState } from "react";

import Loader from "@/components/common/Loader";
import ProfileMenu from "@/components/shell/ProfileMenu";
import ShellAlerts from "@/components/shell/ShellAlerts";
import SidebarNav from "@/components/shell/SidebarNav";
import {
  Content,
  Shell,
  Topbar,
  Workspace,
  MenuButton,
  MobileNavOverlay,
} from "@/components/shell/shell.styles";
import { profileExtras, titleForPath } from "@/constants/nav";
import { useOptimisticNav } from "@/nav/OptimisticNavContext";
import { PageReadyProvider, usePageReady } from "@/nav/PageReadyContext";
import { useLogout } from "@/services/mutations/auth/auth.hooks";
import { useAuthStore } from "@/store/auth/authStore";

function MainLayoutShell() {
  const user = useAuthStore((s) => s.user);
  const classInfo = useAuthStore((s) => s.classInfo);
  const announcement = useAuthStore((s) => s.announcement);
  const storage = useAuthStore((s) => s.storage);
  const logout = useLogout();
  const { path: optimisticPath, go, isPending } = useOptimisticNav();
  const { ready } = usePageReady();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const classLabel = user?.className || classInfo?.name || "Class";
  const isInstructor = user?.role === "instructor";

  return (
    <>
      {!ready ? <Loader variant="screen" /> : null}
      <Shell $pending={isPending} $ready={ready} aria-hidden={!ready}>
        <SidebarNav
          classLabel={classLabel}
          currentPath={optimisticPath}
          onNavigate={go}
          onCloseMobile={() => setMobileNavOpen(false)}
          mobileOpen={mobileNavOpen}
        />
        <Workspace>
          <Topbar>
            <div>
              <MenuButton onClick={() => setMobileNavOpen(!mobileNavOpen)}>
                <span /><span /><span />
              </MenuButton>
              <h1>{titleForPath(optimisticPath, isInstructor)}</h1>
            </div>
            <ProfileMenu
              fullName={user?.fullName}
              meta={`L${user?.level} ${user?.role} · ${user?.username}`}
              extras={profileExtras(isInstructor)}
              currentPath={optimisticPath}
              loggingOut={logout.isPending}
              onNavigate={go}
              onLogout={() => logout.mutate()}
            />
          </Topbar>
          <Content>
            <ShellAlerts
              storage={storage}
              announcement={announcement?.text}
            />
            <Outlet />
          </Content>
        </Workspace>
      </Shell>
      <MobileNavOverlay $open={mobileNavOpen} onClick={() => setMobileNavOpen(false)} />
    </>
  );
}

export default function MainLayout() {
  return (
    <PageReadyProvider>
      <MainLayoutShell />
    </PageReadyProvider>
  );
}

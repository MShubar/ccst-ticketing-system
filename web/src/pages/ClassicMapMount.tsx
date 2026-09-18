import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import styled from "styled-components";

import { usePageReady } from "@/nav/PageReadyContext";
import { useAuthStore } from "@/store/auth/authStore";
import { withEmbedHash } from "@/utils/classicHash";
import { importClassicModule } from "@/utils/importClassicModule";

type ClassicRouter = {
  render: () => Promise<void> | void;
};

type ClassicStateMod = {
  setApp: (el: HTMLElement | null) => void;
  state: {
    user: unknown;
    class: unknown;
    announcement: unknown;
    meta: unknown;
    requesters: unknown;
    storage: unknown;
    route: string;
    embed: boolean;
    reactHost: boolean;
  };
  wireHashChange: (cb: () => void) => void;
};

type MapLabMod = {
  stopMapPresence?: () => void;
  closeDeviceConsole?: () => void;
};

declare global {
  interface Window {
    __ccstReactNavigate?: (
      path: string,
      opts?: { syncParent?: boolean }
    ) => void;
    __ccstReactReady?: (path: string) => void;
  }
}

const Mount = styled.div`
  width: 100%;
  min-height: calc(100vh - 160px);
`;

function ensureClassicCss() {
  const href = "/classic/css/app.css?v=47";
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function ensureToastHost() {
  if (document.getElementById("toast-host")) return;
  const el = document.createElement("div");
  el.id = "toast-host";
  el.className = "toast-host";
  el.setAttribute("aria-live", "polite");
  document.body.appendChild(el);
}

/** Classic in-page map mount (iframe-free). */
export default function ClassicMapMount() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { markReady } = usePageReady();
  const authUser = useAuthStore((s) => s.user);
  const classInfo = useAuthStore((s) => s.classInfo);
  const announcement = useAuthStore((s) => s.announcement);
  const storage = useAuthStore((s) => s.storage);

  const mountRef = useRef<HTMLDivElement>(null);
  const routerRef = useRef<ClassicRouter | null>(null);
  const stateRef = useRef<ClassicStateMod | null>(null);
  const mapRef = useRef<MapLabMod | null>(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    window.__ccstReactNavigate = (path) => {
      navigate(path);
    };
    window.__ccstReactReady = () => {
      markReady();
    };
    return () => {
      delete window.__ccstReactNavigate;
      delete window.__ccstReactReady;
      try {
        mapRef.current?.stopMapPresence?.();
        mapRef.current?.closeDeviceConsole?.();
      } catch {
        /* ignore */
      }
    };
  }, [navigate, markReady]);

  useEffect(() => {
    if (!mountRef.current) return;
    let cancelled = false;

    (async () => {
      ensureClassicCss();
      ensureToastHost();
      const mount = mountRef.current!;
      mount.id = "app";

      const stateMod = await importClassicModule<ClassicStateMod>(
        "/classic/js/lib/state.js"
      );
      if (cancelled) return;
      stateMod.setApp(mount);
      stateMod.state.reactHost = true;
      stateMod.state.embed = true;
      stateRef.current = stateMod;

      const routerMod = await importClassicModule<ClassicRouter>(
        "/classic/js/lib/router.js?v=96"
      );
      if (cancelled) return;
      routerRef.current = routerMod;
      stateMod.wireHashChange(() => {
        void routerMod.render();
      });

      try {
        mapRef.current = await importClassicModule<MapLabMod>(
          "/classic/js/map-lab.js?v=101"
        );
      } catch {
        mapRef.current = null;
      }

      setBooted(true);
      markReady();
    })().catch(() => markReady());

    return () => {
      cancelled = true;
      try {
        mapRef.current?.stopMapPresence?.();
        mapRef.current?.closeDeviceConsole?.();
      } catch {
        /* ignore */
      }
      // Drop classic-owned DOM before React unmounts this host node.
      const mount = mountRef.current;
      if (mount) mount.replaceChildren();
      stateRef.current?.setApp?.(null);
    };
  }, [markReady]);

  useEffect(() => {
    if (!booted || !stateRef.current || !routerRef.current) return;
    const stateMod = stateRef.current;
    const qs = params.toString();
    const hash = withEmbedHash(qs ? `#/map?${qs}` : "#/map");

    if (authUser) {
      stateMod.state.user = authUser;
      stateMod.state.class = classInfo;
      stateMod.state.announcement = announcement;
      stateMod.state.storage = storage;
    }
    stateMod.state.reactHost = true;
    stateMod.state.embed = true;
    stateMod.state.route = hash;

    const nextUrl = `${location.pathname}${location.search}${hash}`;
    const cur = `${location.pathname}${location.search}${location.hash}`;
    if (cur !== nextUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }

    void routerRef.current.render();
    markReady();
  }, [
    booted,
    params,
    location.pathname,
    location.search,
    authUser,
    classInfo,
    announcement,
    storage,
    markReady,
  ]);

  return <Mount ref={mountRef} data-classic-host />;
}

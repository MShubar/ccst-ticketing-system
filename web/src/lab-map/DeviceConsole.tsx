import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { escapeHtml } from "@/lab-map/escapeHtml.js";
import { useConsoleCommandMutation, useDevice } from "@/services/queries/map";
import type { MapDeviceSummary } from "@/types/map";
import { importClassicModule } from "@/utils/importClassicModule";

type ConsoleLine = { text: string; className?: string };

function consoleKindLabel(device: MapDeviceSummary): string {
  if (device.kind === "router") return "Console — Cisco IOS";
  if (device.kind === "switch") return "Console — Cisco IOS";
  if (device.type === "server") return "Command Prompt — Server";
  if (device.type === "printer") return "Embedded Web Console";
  return "Command Prompt";
}

function consoleBanner(device: MapDeviceSummary): string[] {
  if (device.kind === "host") {
    const address = device.mediaDown
      ? device.mediaLabel || "Media disconnected"
      : device.ip
        ? device.ip
        : "no IP";
    return [
      "Microsoft Windows [Version 10.0.19045.4046]",
      "(c) ProCloud Training Center. Classroom simulation.",
      "",
      `Connected to ${device.label} · ${address}.`,
      "Type help for the command list.",
      "",
    ];
  }
  return [
    `Connected to ${device.label} console (${device.cabled}/${device.ports} ports cabled).`,
    "",
    "Press RETURN to get started. Type ? for the command list.",
    "",
  ];
}

type DeviceConsoleProps = {
  deviceId: string;
  onClose: () => void;
};

export default function DeviceConsole({ deviceId, onClose }: DeviceConsoleProps) {
  const { data: rawDevice, isError, error } = useDevice(deviceId);
  const device = rawDevice as MapDeviceSummary | undefined;
  const consoleMut = useConsoleCommandMutation(deviceId);

  const [tab, setTab] = useState<"console" | "hardware">("console");
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [prompt, setPrompt] = useState("");
  const [session, setSession] = useState<unknown>(null);
  const [gated, setGated] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [hwStatus, setHwStatus] = useState<"idle" | "loading" | "failed">("idle");
  const hwRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const appendLines = useCallback((text: string | string[], className = "") => {
    const block = (Array.isArray(text) ? text : [text]).join("\n");
    setLines((prev) => [...prev, { text: block, className }]);
  }, []);

  useEffect(() => {
    if (!device) return;
    const gate = device.gate;
    const banner = gate || consoleBanner(device);
    const initial: ConsoleLine[] = [
      {
        text: Array.isArray(banner) ? banner.join("\n") : String(banner),
        className: gate ? "console-error" : "console-banner",
      },
    ];
    for (const w of device.warnings || []) {
      initial.push({ text: w, className: "console-warn" });
    }
    setLines(initial);
    setPrompt(device.prompt);
    setGated(Boolean(gate));
    if (!gate) inputRef.current?.focus();
  }, [device]);

  useEffect(() => {
    if (isError) {
      const msg =
        error && typeof error === "object" && "message" in error
          ? String((error as Error).message)
          : "Could not load device";
      toast.error(msg === "auth" ? "Session expired — sign in again." : msg);
      onClose();
    }
  }, [isError, error, onClose]);

  useEffect(() => {
    bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight);
  }, [lines]);

  const send = async (command: string) => {
    if (consoleMut.isPending || gated) return;
    appendLines(`${prompt}${command}`, "console-echo");
    try {
      const res = await consoleMut.mutateAsync({ command, session });
      setSession(res.session);
      if (res.clear) {
        setLines([]);
      } else if (res.output?.length) {
        appendLines(res.output);
      }
      setPrompt(res.prompt);
      if (res.close) onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Command failed";
      appendLines(msg === "auth" ? "Session expired — sign in again." : msg, "console-error");
    }
  };

  const hasHardware = Boolean(device?.hardware?.serviceable);
  const hwLoadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (tab !== "hardware" || !hasHardware || !device) return;
    const loadKey = `${deviceId}:${tab}`;
    if (hwLoadedFor.current === loadKey) return;

    let cancelled = false;
    setHwStatus("loading");

    void importClassicModule<{
      renderHardware?: (d: unknown, id: string) => void;
    }>("/classic/js/hardware-ui.js?v=93")
      .then((mod) => {
        if (cancelled) return;
        const pane = hwRef.current;
        if (!pane || !mod.renderHardware) {
          setHwStatus("failed");
          return;
        }
        // Classic writes into #pane-hardware; keep that node free of React children.
        pane.replaceChildren();
        mod.renderHardware(device, deviceId);
        hwLoadedFor.current = loadKey;
        setHwStatus("idle");
      })
      .catch(() => {
        if (!cancelled) setHwStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [tab, hasHardware, device, deviceId]);

  if (!device) return null;

  return (
    <div
      className="console-overlay"
      id="console-overlay"
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="console-stage">
        <div
          className={`console-window console-${escapeHtml(device.kind)}`}
          role="dialog"
          aria-label={`${device.label} console`}
        >
          <header className="console-head">
            <div className="console-title">
              <strong>{device.label}</strong>
              <span>{consoleKindLabel(device)}</span>
            </div>
            <div className="console-head-actions">
              {hasHardware ? (
                <div className="console-tabs" role="tablist">
                  <button
                    type="button"
                    className={`console-tab ${tab === "console" ? "is-active" : ""}`}
                    data-tab="console"
                    onClick={() => setTab("console")}
                  >
                    Command prompt
                  </button>
                  <button
                    type="button"
                    className={`console-tab ${tab === "hardware" ? "is-active" : ""}`}
                    data-tab="hardware"
                    onClick={() => setTab("hardware")}
                  >
                    Hardware
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className="console-btn"
                hidden={tab !== "console"}
                onClick={() => {
                  if (!gated) void send(device.kind === "host" ? "help" : "?");
                }}
              >
                Commands
              </button>
              <button
                type="button"
                className="console-btn"
                hidden={tab !== "console"}
                onClick={() => {
                  setLines([]);
                  inputRef.current?.focus();
                }}
              >
                Clear
              </button>
              <button type="button" className="console-btn is-close" onClick={onClose}>
                Close
              </button>
            </div>
          </header>
          <div className="console-pane" id="pane-console" hidden={tab !== "console"}>
            <div className="console-body" id="console-body" ref={bodyRef}>
              {lines.map((line, i) => (
                <div key={i} className={line.className || undefined}>
                  {line.text}
                </div>
              ))}
            </div>
            <form
              className={`console-input ${gated ? "is-dead" : ""}`}
              id="console-form"
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                if (consoleMut.isPending) return;
                const command = input;
                setInput("");
                if (command.trim()) {
                  setHistory((h) => {
                    const next = [...h, command];
                    setHistoryIndex(next.length);
                    return next;
                  });
                }
                void send(command);
              }}
            >
              <span className="console-prompt" id="console-prompt">
                {gated ? "(no prompt)" : prompt}
              </span>
              <input
                id="console-line"
                ref={inputRef}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-label="Command"
                disabled={gated || consoleMut.isPending}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (!history.length) return;
                    const next = Math.max(0, historyIndex - 1);
                    setHistoryIndex(next);
                    setInput(history[next] || "");
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    const next = Math.min(history.length, historyIndex + 1);
                    setHistoryIndex(next);
                    setInput(history[next] || "");
                  } else if (e.key === "l" && e.ctrlKey) {
                    e.preventDefault();
                    setLines([]);
                  }
                }}
              />
            </form>
          </div>
          <div className="console-pane hw-pane" hidden={tab !== "hardware"}>
            {hwStatus === "failed" ? (
              <p className="hint">Hardware bench could not load — use the command prompt.</p>
            ) : (
              <>
                {hwStatus === "loading" ? (
                  <p className="hint">Hardware bench loading…</p>
                ) : null}
                {/* Classic hardware-ui owns this node's children via innerHTML. */}
                <div id="pane-hardware" ref={hwRef} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

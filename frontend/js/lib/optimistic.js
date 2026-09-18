import { toast } from "./util.js";

/**
 * Run an action optimistically: paint the UI first, then the network.
 * On failure, restore the snapshot and surface an error toast.
 *
 * @param {object} opts
 * @param {() => void} [opts.apply] — mutate the DOM / local state now
 * @param {() => Promise<any>} opts.request — the real API call
 * @param {() => void} [opts.rollback] — undo `apply` if the request fails
 * @param {(result: any) => void | Promise<void>} [opts.onSuccess]
 * @param {Element | null} [opts.busy] — button/control to mark busy
 * @param {string} [opts.okToast]
 * @returns {Promise<any>}
 */
export async function runOptimistic({
  apply,
  request,
  rollback,
  onSuccess,
  busy,
  okToast
}) {
  const controls = busy
    ? Array.isArray(busy)
      ? busy.filter(Boolean)
      : [busy]
    : [];
  const prevDisabled = controls.map((el) => el.disabled);
  const prevLabel = controls.map((el) =>
    el.tagName === "BUTTON" ? el.textContent : null
  );

  controls.forEach((el) => {
    el.classList.add("is-busy");
    el.setAttribute("aria-busy", "true");
    if ("disabled" in el) el.disabled = true;
  });

  try {
    apply?.();
    const result = await request();
    if (okToast) toast(okToast, "ok");
    await onSuccess?.(result);
    return result;
  } catch (err) {
    try {
      rollback?.();
    } catch {
      /* ignore rollback errors */
    }
    toast(err?.message || "That change could not be saved.", "error");
    throw err;
  } finally {
    controls.forEach((el, i) => {
      el.classList.remove("is-busy");
      el.removeAttribute("aria-busy");
      if ("disabled" in el) el.disabled = prevDisabled[i];
      if (prevLabel[i] != null) el.textContent = prevLabel[i];
    });
  }
}

/** Snapshot a few DOM nodes so rollback can restore HTML. */
export function snapshotHtml(...els) {
  return els.filter(Boolean).map((el) => ({ el, html: el.innerHTML }));
}

export function restoreHtml(snaps) {
  (snaps || []).forEach(({ el, html }) => {
    if (el) el.innerHTML = html;
  });
}

/** Mark a row/card as optimistically updated (brief highlight). */
export function flashOptimistic(el) {
  if (!el) return;
  el.classList.add("is-optimistic");
  window.setTimeout(() => el.classList.remove("is-optimistic"), 650);
}

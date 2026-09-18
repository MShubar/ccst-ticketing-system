const MAP_CSS_HREF = "/classic/css/app.css?v=47";

export function ensureMapCss() {
  if (document.querySelector(`link[href="${MAP_CSS_HREF}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = MAP_CSS_HREF;
  document.head.appendChild(link);
}

import { wireHashChange } from "./lib/state.js";
import { setShellSignedOutHandler } from "./lib/shell.js";
import { renderLogin } from "./views/login.js";
import { render } from "./lib/router.js?v=95";
import { boot } from "./lib/boot.js?v=95";

wireHashChange(() => {
  render();
});

setShellSignedOutHandler(() => renderLogin());

boot().catch(() => renderLogin());

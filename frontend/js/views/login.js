import { app, state } from "../lib/state.js";
import {
  toast,
  api,
  escapeHtml
} from "../lib/util.js";
import { boot } from "../lib/boot.js?v=95";

function renderLogin(error = "", mode = "signin") {
  const register = mode === "register";
  app.innerHTML = `
    <div class="login">
      <section class="login-copy">
        <div class="brand-kicker">ProCloud Training Center</div>
        <h1>CCST Ticketing</h1>
        <p>Classroom help desk for CCST IT Support.</p>
        <p style="color:#9bb0b8;font-size:13px;margin-top:28px">Cisco Certified Support Technician IT Support</p>
      </section>
      <section class="login-panel">
        <form class="login-card" id="auth-form">
          <div class="brand-kicker">CCST Ticketing</div>
          <h2>${register ? "Create your class" : "Sign in"}</h2>
          <p class="hint">${
            register
              ? "Ask the trainer for the signup code."
              : "Use the username and password for your class."
          }</p>
          <div class="hint" style="display:flex;gap:8px;margin-bottom:8px">
            <button type="button" class="btn ${register ? "" : "teal"}" id="tab-signin" style="flex:1">Sign in</button>
            <button type="button" class="btn ${register ? "teal" : ""}" id="tab-register" style="flex:1">Instructor signup</button>
          </div>
          ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
          ${
            register
              ? `<div class="field"><label>Signup code</label><input name="signupCode" autocomplete="off" required placeholder="Code from the trainer" /></div>
                 <div class="field"><label>Class name</label><input name="className" placeholder="CCST IT Support G19" required /></div>
                 <div class="field"><label>Your full name</label><input name="fullName" required /></div>`
              : ""
          }
          <div class="field"><label>Username</label><input name="username" autocomplete="username" required /></div>
          <div class="field"><label>Password</label><input name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" required /></div>
          <button class="btn teal" type="submit">${register ? "Create class" : "Open the queue"}</button>
        </form>
      </section>
    </div>`;
  document.getElementById("tab-signin").onclick = () => renderLogin("", "signin");
  document.getElementById("tab-register").onclick = () => renderLogin("", "register");
  document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      if (register) {
        await api("/api/register/instructor", {
          method: "POST",
          body: {
            signupCode: form.get("signupCode"),
            className: form.get("className"),
            fullName: form.get("fullName"),
            username: form.get("username"),
            password: form.get("password")
          }
        });
      } else {
        await api("/api/login", {
          method: "POST",
          body: { username: form.get("username"), password: form.get("password") }
        });
      }
      await boot();
    } catch (err) {
      renderLogin(
        err.message === "auth" ? "Username or password is not correct." : err.message,
        mode
      );
    }
  });
}


export { renderLogin };

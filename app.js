/* NetraMitra - frontend logic (step 1)
   NOTE: Accounts are stored in the browser (localStorage) for now so we can
   build and test the UI. In the next step this is replaced by a real backend
   (Python API + database). Never store real passwords in localStorage in production. */

const USERS_KEY = "nm_users";
const SESSION_KEY = "nm_session";

/* ---------- small helpers ---------- */
const $ = (id) => document.getElementById(id);

function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
  catch { return {}; }
}
function saveUsers(users) { localStorage.setItem(USERS_KEY, JSON.stringify(users)); }

function getSession() {
  const email = localStorage.getItem(SESSION_KEY);
  if (!email) return null;
  const user = getUsers()[email];
  return user ? { email, ...user } : null;
}

function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add("hidden"), 3000);
}

/* Password hashing (demo only: salted SHA-256 in the browser).
   The real backend will use bcrypt/argon2. */
async function hashPassword(password, salt) {
  if (!window.crypto || !crypto.subtle) {
    throw new Error("Secure context needed. Open the site via http://localhost, not as a file.");
  }
  const data = new TextEncoder().encode(salt + password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function makeSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- validation ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[6-9]\d{9}$/; // Indian mobile numbers

function setError(fieldId, message) {
  const el = document.querySelector(`[data-error-for="${fieldId}"]`);
  const input = $(fieldId);
  if (el) el.textContent = message || "";
  if (input && input.type !== "checkbox") input.classList.toggle("invalid", !!message);
  return !message;
}
function clearErrors(form) {
  form.querySelectorAll(".error").forEach((e) => (e.textContent = ""));
  form.querySelectorAll(".invalid").forEach((i) => i.classList.remove("invalid"));
}

function validateName(v) {
  if (v.trim().length < 2) return "Please enter your full name.";
  if (!/^[A-Za-z .'-]+$/.test(v.trim())) return "Name can contain only letters and spaces.";
  return "";
}
function validateEmail(v) {
  return EMAIL_RE.test(v.trim()) ? "" : "Please enter a valid email address.";
}
function validatePhone(v) {
  return PHONE_RE.test(v.trim()) ? "" : "Enter a valid 10-digit mobile number.";
}
function validatePassword(v) {
  if (v.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return "Use both letters and numbers.";
  return "";
}

/* ---------- router ---------- */
const VIEWS = ["home", "about", "contact", "auth", "dashboard", "section"];
const SECTIONS = {
  general: {
    title: "Normal eye problems",
    text: "Photo upload and symptom questions for redness, eye flu and irritation. This is the next page we will build.",
  },
  pre: {
    title: "Pre-surgery help",
    text: "Upload pre-operative and medicine slips. Coming after the first section.",
  },
  post: {
    title: "Post-surgery help",
    text: "Upload post-operative documents for recovery guidance. Coming after the first section.",
  },
};

function showView(name) {
  VIEWS.forEach((v) => $("view-" + v).classList.toggle("hidden", v !== name));
  document.querySelectorAll("#nav-links [data-link]").forEach((a) =>
    a.classList.toggle("active", a.dataset.link === name)
  );
  $("nav-links").classList.remove("open");
  $("menu-toggle").setAttribute("aria-expanded", "false");
  window.scrollTo(0, 0);
}

function route() {
  const hash = (location.hash || "#home").slice(1);
  const [page, param] = hash.split("/");
  const session = getSession();

  // Protected pages
  if ((page === "dashboard" || page === "section") && !session) {
    location.hash = "#auth";
    return;
  }
  // Logged-in users do not need the login page
  if (page === "auth" && session) {
    location.hash = "#dashboard";
    return;
  }

  if (page === "section") {
    const s = SECTIONS[param];
    if (!s) { location.hash = "#dashboard"; return; }
    $("section-title").textContent = s.title;
    $("section-text").textContent = s.text;
    showView("section");
    return;
  }

  showView(VIEWS.includes(page) ? page : "home");
}

/* ---------- navbar state ---------- */
function refreshNav() {
  const session = getSession();
  $("nav-auth").classList.toggle("hidden", !!session);
  $("nav-dashboard").classList.toggle("hidden", !session);
  $("nav-logout").classList.toggle("hidden", !session);
  $("hero-cta").setAttribute("href", session ? "#dashboard" : "#auth");
  $("hero-cta").textContent = session ? "Go to dashboard" : "Get started";
  if (session) $("user-name").textContent = session.name.split(" ")[0];
}

/* ---------- auth tabs ---------- */
function showAuthTab(which) {
  const login = which === "login";
  $("login-form").classList.toggle("hidden", !login);
  $("signup-form").classList.toggle("hidden", login);
  $("tab-login").classList.toggle("active", login);
  $("tab-signup").classList.toggle("active", !login);
}

/* ---------- sign up ---------- */
async function handleSignup(e) {
  e.preventDefault();
  const form = e.target;
  clearErrors(form);
  $("signup-error").textContent = "";

  const name = $("s-name").value;
  const email = $("s-email").value.trim().toLowerCase();
  const phone = $("s-phone").value.trim();
  const password = $("s-password").value;
  const confirm = $("s-confirm").value;

  const checks = [
    setError("s-name", validateName(name)),
    setError("s-email", validateEmail(email)),
    setError("s-phone", validatePhone(phone)),
    setError("s-password", validatePassword(password)),
    setError("s-confirm", confirm === password ? "" : "Passwords do not match."),
    setError("s-consent", $("s-consent").checked ? "" : "Please accept to continue."),
  ];
  if (checks.includes(false)) return;

  const users = getUsers();
  if (users[email]) {
    $("signup-error").textContent = "An account with this email already exists. Please login.";
    return;
  }

  try {
    const salt = makeSalt();
    const passwordHash = await hashPassword(password, salt);
    users[email] = {
      name: name.trim(),
      phone,
      salt,
      passwordHash,
      consentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    saveUsers(users);
    localStorage.setItem(SESSION_KEY, email);
    form.reset();
    refreshNav();
    toast("Account created. Welcome!");
    location.hash = "#dashboard";
  } catch (err) {
    $("signup-error").textContent = err.message;
  }
}

/* ---------- login ---------- */
async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  clearErrors(form);
  $("login-error").textContent = "";

  const email = $("l-email").value.trim().toLowerCase();
  const password = $("l-password").value;

  const checks = [
    setError("l-email", validateEmail(email)),
    setError("l-password", password ? "" : "Please enter your password."),
  ];
  if (checks.includes(false)) return;

  const user = getUsers()[email];
  try {
    const hash = user ? await hashPassword(password, user.salt) : null;
    if (!user || hash !== user.passwordHash) {
      $("login-error").textContent = "Incorrect email or password.";
      return;
    }
    localStorage.setItem(SESSION_KEY, email);
    form.reset();
    refreshNav();
    toast("Logged in successfully.");
    location.hash = "#dashboard";
  } catch (err) {
    $("login-error").textContent = err.message;
  }
}

function handleLogout() {
  localStorage.removeItem(SESSION_KEY);
  refreshNav();
  toast("You have been logged out.");
  location.hash = "#home";
}

/* ---------- contact form (stored locally for now) ---------- */
function handleContact(e) {
  e.preventDefault();
  const form = e.target;
  clearErrors(form);
  const name = $("c-name").value;
  const email = $("c-email").value;
  const message = $("c-message").value;

  const checks = [
    setError("c-name", validateName(name)),
    setError("c-email", validateEmail(email)),
    setError("c-message", message.trim().length >= 10 ? "" : "Please write at least 10 characters."),
  ];
  if (checks.includes(false)) return;

  const inbox = JSON.parse(localStorage.getItem("nm_messages") || "[]");
  inbox.push({ name: name.trim(), email: email.trim(), message: message.trim(), at: new Date().toISOString() });
  localStorage.setItem("nm_messages", JSON.stringify(inbox));
  form.reset();
  toast("Thanks! Your message has been saved.");
}

/* ---------- wire everything up ---------- */
document.addEventListener("DOMContentLoaded", () => {
  $("year").textContent = new Date().getFullYear();

  $("login-form").addEventListener("submit", handleLogin);
  $("signup-form").addEventListener("submit", handleSignup);
  $("contact-form").addEventListener("submit", handleContact);
  $("nav-logout").addEventListener("click", handleLogout);

  $("tab-login").addEventListener("click", () => showAuthTab("login"));
  $("tab-signup").addEventListener("click", () => showAuthTab("signup"));
  $("to-signup").addEventListener("click", (e) => { e.preventDefault(); showAuthTab("signup"); });
  $("to-login").addEventListener("click", (e) => { e.preventDefault(); showAuthTab("login"); });

  // Phone: digits only
  $("s-phone").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "");
  });

  // Show / hide password
  document.querySelectorAll(".pw-toggle").forEach((btn) =>
    btn.addEventListener("click", () => {
      const input = $(btn.dataset.target);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
    })
  );

  // Mobile menu
  $("menu-toggle").addEventListener("click", () => {
    const open = $("nav-links").classList.toggle("open");
    $("menu-toggle").setAttribute("aria-expanded", String(open));
  });

  // Dashboard choice cards
  document.querySelectorAll(".choice").forEach((card) =>
    card.addEventListener("click", () => {
      location.hash = "#section/" + card.dataset.section;
    })
  );

  window.addEventListener("hashchange", route);
  refreshNav();
  route();
});

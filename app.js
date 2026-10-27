// 入口：ログインは1つ。アドレスの @ 以下で生徒画面と教員画面に振り分ける
import {
  createBackend, isDemo, configReady, roleOf, escapeHtml, lsGet, lsSet,
  STUDENT_DOMAIN, TEACHER_DOMAIN
} from "./common.js";
import { mountStudent } from "./student.js";
import { mountTeacher } from "./teacher.js";

const app = document.getElementById("app");
const acct = document.getElementById("acct");
const MODE_KEY = "gcis_mode"; // 教員が前回使った画面（"teacher" / "student"）

let be, user = null, role = null, unmount = null;

function clearView() {
  unmount?.(); unmount = null;
  document.getElementById("save").textContent = "";
  document.getElementById("who").innerHTML = "";
  document.body.classList.remove("teacher");
  app.classList.remove("wide");
}

function renderSetupNeeded() {
  app.innerHTML = `<section class="card"><h2>準備中です</h2><p>先生がFirebaseの設定を入れると使えるようになります。</p>
  <p class="hint">先生へ：<code>firebase-config.js</code> に設定を貼ってください。動きを見るだけなら、URLの最後に <code>?demo</code> をつけて開けます。</p></section>`;
}

function renderLogin(msg = "") {
  clearView();
  acct.innerHTML = "";
  app.innerHTML = `
    <section class="card hero">
      <p class="eyebrow">GCIS 個人探究</p>
      <h1>探究ノート</h1>
      <p>2月に「もっと知りたい」と思える、自分の問いを見つけにいこう。</p>
      ${isDemo
        ? `<div class="prompt-actions"><button class="btn primary big" data-demo="student">デモ：生徒として入る</button>
           <button class="btn big" data-demo="teacher">デモ：教員として入る</button></div>`
        : `<button class="btn primary big" id="login">学校のGoogleアカウントでログイン</button>
           <p class="hint">生徒は @${STUDENT_DOMAIN}、先生は @${TEACHER_DOMAIN} のアカウントを選んでください</p>`}
      ${msg ? `<p class="error">${msg}</p>` : ""}
    </section>`;
  document.getElementById("login")?.addEventListener("click", login);
  app.querySelectorAll("[data-demo]").forEach(b => b.onclick = () => be.signIn(b.dataset.demo));
}

async function login() {
  try { await be.signIn(); }
  catch (e) {
    console.error(e);
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    renderLogin(e.code === "auth/popup-blocked"
      ? "ポップアップがブロックされました。ブラウザの設定でこのサイトのポップアップを許可してください。"
      : "ログインできませんでした。もう一度押してみてください。");
  }
}

async function relogin() {
  clearView();
  await be.signOut();
  if (!be.demo) login();
}

function renderAcct(mode) {
  const toggle = role === "teacher"
    ? `<button class="link" id="mode">${mode === "teacher" ? "生徒画面へ" : "教員画面へ"}</button>` : "";
  acct.innerHTML = `<span class="addr">${escapeHtml(user.email)}</span>${toggle}<button class="link" id="relogin">別のアカウントで入り直す</button>`;
  document.getElementById("relogin").onclick = relogin;
  document.getElementById("mode")?.addEventListener("click", () => show(mode === "teacher" ? "student" : "teacher"));
}

function show(mode) {
  clearView();
  if (role === "teacher") lsSet(MODE_KEY, mode);
  renderAcct(mode);
  if (mode === "teacher") {
    document.body.classList.add("teacher");
    app.classList.add("wide");
    unmount = mountTeacher({ be, user, app, dlg: document.getElementById("detail") });
  } else {
    unmount = mountStudent({ be, user, app, asTeacher: role === "teacher" });
  }
}

async function start() {
  if (!isDemo && !configReady) { renderSetupNeeded(); return; }
  if (isDemo) document.body.classList.add("is-demo");
  try { be = await createBackend(); }
  catch (e) { console.error(e); app.innerHTML = `<section class="card"><p class="error">読み込みに失敗しました。ページを再読み込みしてください。</p></section>`; return; }

  be.onUser(async u => {
    user = u;
    if (!u) { renderLogin(); return; }
    role = roleOf(u.email);
    if (!role) {
      await be.signOut();
      renderLogin(`このアカウント（${escapeHtml(u.email)}）では使えません。学校のアカウントで入り直してください。`);
      return;
    }
    show(role === "teacher" ? (lsGet(MODE_KEY) === "student" ? "student" : "teacher") : "student");
  });
}
start();

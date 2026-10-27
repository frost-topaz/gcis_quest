// 教員画面：クラスごとの進み具合（リアルタイム）
import {
  createBackend, isDemo, configReady, hasDomain, escapeHtml,
  TEACHER_DOMAIN, CLASSES, MAX_NUMBER, TEST_CLASS, classLabel
} from "./common.js";

const LESSON = "L01";
const STEP_NAMES = ["お題", "AI①", "AI②", "AI③", "共有"];
const STALL_MIN = 5; // この分数以上更新がなく未提出なら「止まってる？」

const app = document.getElementById("app");
const who = document.getElementById("who");
const dlg = document.getElementById("detail");

let be, unwatch = null, cls = 1, students = [], notes = [], tick = null;

function renderLogin(msg = "") {
  who.textContent = "";
  app.innerHTML = `
    <section class="card hero">
      <p class="eyebrow">教員画面</p>
      <h1>探究ノート</h1>
      <button class="btn primary big" id="login">教員のGoogleアカウントでログイン</button>
      <p class="hint">@${TEACHER_DOMAIN} のアカウントのみ</p>
      ${msg ? `<p class="error">${msg}</p>` : ""}
    </section>`;
  document.getElementById("login").onclick = async () => {
    try { await be.signIn(TEACHER_DOMAIN); }
    catch (e) { console.error(e); renderLogin("ログインできませんでした。ポップアップが許可されているか確認してください。"); }
  };
}

function renderShell() {
  const tabs = [...CLASSES, TEST_CLASS].map(c =>
    `<button class="tab ${c === cls ? "on" : ""}" data-cls="${c}">${classLabel(c)}</button>`).join("");
  app.innerHTML = `
    <section class="card">
      <div class="t-head">
        <div class="tabs">${tabs}</div>
        <div class="t-actions"><span class="pill">第1回（L01）</span><button class="btn ghost small" id="csv">CSVで保存</button></div>
      </div>
      <div id="summary" class="summary"></div>
      <div id="table"></div>
      <div id="missing" class="missing"></div>
    </section>`;
  app.querySelectorAll("[data-cls]").forEach(b => b.onclick = () => { cls = Number(b.dataset.cls); renderShell(); watch(); });
  document.getElementById("csv").onclick = downloadCsv;
}

function rows() {
  const byUid = Object.fromEntries(notes.map(n => [n.uid, n]));
  return students
    .map(s => ({ ...s, note: byUid[s.uid] || null }))
    .sort((a, b) => a.number - b.number);
}

function status(r) {
  const n = r.note;
  if (!n) return { label: "ログインのみ", cls: "st-none", stall: false };
  if (n.submitted) return { label: "提出済み", cls: "st-done", stall: false };
  const mins = n.updatedAt ? (Date.now() - n.updatedAt.getTime()) / 60000 : 0;
  return { label: `${(n.step ?? 0) + 1}. ${STEP_NAMES[n.step ?? 0]}`, cls: "st-work", stall: mins >= STALL_MIN };
}

function fmtTime(d) {
  return d ? d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "—";
}

function renderTable() {
  const rs = rows();
  const submitted = rs.filter(r => r.note?.submitted).length;
  const stalled = rs.filter(r => status(r).stall).length;
  document.getElementById("summary").innerHTML = `
    <div class="sum"><b>${rs.length}</b><span>ログイン / ${MAX_NUMBER}</span></div>
    <div class="sum"><b>${submitted}</b><span>提出済み</span></div>
    <div class="sum warn"><b>${stalled}</b><span>${STALL_MIN}分以上止まってる？</span></div>`;

  if (!rs.length) {
    document.getElementById("table").innerHTML = `<p class="hint">まだ誰もログインしていません。</p>`;
  } else {
    document.getElementById("table").innerHTML = `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>番号</th><th>進み具合</th><th>気になったこと</th><th>来週の一歩</th><th>やる日</th><th>更新</th></tr></thead>
        <tbody>${rs.map(r => {
          const st = status(r), d = r.note?.data || {};
          return `<tr data-uid="${r.uid}" class="${st.stall ? "stall" : ""}">
            <td class="num">${r.number}</td>
            <td><span class="st ${st.cls}">${st.label}</span>${st.stall ? ` <span class="st st-stall">止まってる？</span>` : ""}</td>
            <td>${escapeHtml(d.kininaru || "")}</td>
            <td>${escapeHtml(d.ippo || "")}</td>
            <td class="nowrap">${escapeHtml(d.ippoDate || "")}</td>
            <td class="nowrap">${fmtTime(r.note?.updatedAt)}</td></tr>`;
        }).join("")}</tbody></table></div>`;
    document.querySelectorAll("tr[data-uid]").forEach(tr => tr.onclick = () => showDetail(tr.dataset.uid));
  }

  const have = new Set(rs.map(r => r.number));
  const miss = Array.from({ length: MAX_NUMBER }, (_, i) => i + 1).filter(n => !have.has(n));
  document.getElementById("missing").innerHTML = cls === TEST_CLASS ? "" :
    miss.length ? `<b>まだログインしていない番号：</b>${miss.join("、")}` : `<b>全員ログインしています ✓</b>`;
  const dup = rs.map(r => r.number).filter((n, i, a) => a.indexOf(n) !== i);
  if (dup.length) document.getElementById("missing").innerHTML += `<p class="error">番号が重なっています：${[...new Set(dup)].join("、")}番（入力ミスの可能性）</p>`;
}

function showDetail(uid) {
  const r = rows().find(x => x.uid === uid); if (!r) return;
  const d = r.note?.data || {};
  const item = (k, label) => `<div class="tc-row"><span>${label}</span><b>${escapeHtml(d[k] || "—")}</b></div>`;
  dlg.innerHTML = `
    <div class="dlg">
      <div class="dlg-head"><h3>${classLabel(r.class)} ${r.number}番</h3><button class="btn ghost small" id="close">閉じる</button></div>
      <p class="hint">${escapeHtml(r.email || "")}</p>
      <div class="themecard">
        ${item("odai1", "時間が溶けたもの")}${item("odai2", "語りだすと止まらないもの")}${item("odai3", "最近モヤっとしたこと")}
        <div class="tc-row"><span>気になったキーワード</span><b>${escapeHtml(["kw1", "kw2", "kw3"].map(k => d[k]).filter(Boolean).join("・") || "—")}</b></div>
        ${item("kininaru", "気になったこと")}${item("shakai", "つながる社会の課題")}
        ${item("ippo", "来週までにやる一歩")}${item("ippoDate", "やる日")}${item("yosou", "予想")}
      </div>
    </div>`;
  dlg.showModal();
  document.getElementById("close").onclick = () => dlg.close();
}

function csvCell(s) { return `"${String(s ?? "").replace(/"/g, '""')}"`; }
function downloadCsv() {
  const head = ["クラス", "番号", "進み具合", "時間が溶けたもの", "語りだすと止まらないもの", "モヤっとしたこと", "キーワード1", "キーワード2", "キーワード3", "気になったこと", "社会の課題", "一歩", "やる日", "予想", "更新"];
  const lines = rows().map(r => {
    const d = r.note?.data || {};
    return [classLabel(r.class), r.number, status(r).label, d.odai1, d.odai2, d.odai3, d.kw1, d.kw2, d.kw3, d.kininaru, d.shakai, d.ippo, d.ippoDate, d.yosou, r.note?.updatedAt?.toLocaleString("ja-JP") || ""].map(csvCell).join(",");
  });
  const blob = new Blob(["﻿" + [head.map(csvCell).join(","), ...lines].join("\r\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `L01_${classLabel(cls)}.csv`; a.click();
  URL.revokeObjectURL(a.href);
}

function watch() {
  unwatch?.();
  students = []; notes = []; renderTable();
  if (be.demo) { [students, notes] = demoData(); renderTable(); return; }
  unwatch = be.watchClass(cls, LESSON,
    s => { students = s; renderTable(); },
    n => { notes = n; renderTable(); },
    e => { console.error(e); document.getElementById("table").innerHTML = `<p class="error">読み込めません（権限エラー）。@${TEACHER_DOMAIN} のアカウントか、Firestoreのルールを確認してください。</p>`; });
}

// デモ用の架空データ（実在の生徒ではありません）
function demoData() {
  const ex = [
    ["部活生って、練習後に何をどれだけ食べてるんだろう？", "部活の友だち3人に、昨日の練習後に食べたものを聞く"],
    ["なぜ推しの曲は何回聴いても飽きないの？", "同じ曲を5回聴いて、気づいたことを毎回メモする"],
    ["駅前の自転車はなぜいつも同じ場所に止まっている？", "駅前の駐輪場を朝と夕方に見に行き、台数を数える"],
    ["", ""]
  ];
  const st = [], nt = [];
  for (let i = 1; i <= 30; i++) {
    const uid = "u" + i, e = ex[i % ex.length], step = i % 5;
    st.push({ uid, class: cls, number: i, email: `student${i}@example` });
    if (i % 7 === 0) continue;
    nt.push({ uid, step, submitted: step === 4 && i % 2 === 0, updatedAt: new Date(Date.now() - (i % 9) * 60000),
      data: { kininaru: step >= 2 ? e[0] : "", ippo: step >= 3 ? e[1] : "", ippoDate: step >= 3 ? "2026-11-05" : "", yosou: step >= 3 ? "（予想の例）" : "" } });
  }
  return [st, nt];
}

async function start() {
  if (!isDemo && !configReady) { app.innerHTML = `<section class="card"><p>Firebaseの設定（js/firebase-config.js）がまだです。</p></section>`; return; }
  be = await createBackend();
  be.onUser(async u => {
    unwatch?.(); clearInterval(tick);
    if (!u) { renderLogin(); return; }
    if (!be.demo && !hasDomain(u.email, TEACHER_DOMAIN)) {
      await be.signOut();
      renderLogin(`教員画面は @${TEACHER_DOMAIN} のアカウントでのみ開けます。`);
      return;
    }
    who.innerHTML = `${escapeHtml(u.email)} <button class="link" id="out">ログアウト</button>`;
    document.getElementById("out").onclick = () => be.signOut();
    renderShell(); watch();
    tick = setInterval(renderTable, 30000); // 「止まってる？」表示を30秒ごとに更新
  });
  if (be.demo) be.signIn(TEACHER_DOMAIN);
}
start();

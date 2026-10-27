// 生徒画面：L01（気になることを見つけ、来週の一歩を決める）
import {
  createBackend, isDemo, configReady, hasDomain, escapeHtml,
  STUDENT_DOMAIN, CLASSES, MAX_NUMBER, TEST_CLASS, classLabel
} from "./common.js";

const LESSON = "L01";
const app = document.getElementById("app");
const saveBadge = document.getElementById("save");
const who = document.getElementById("who");

const MAP = ["気になる", "一歩", "文献", "問い", "計画", "着手", "RQ"];

const STEPS = [
  { title: "お題カード", mins: 4 },
  { title: "AI① キーワード20個", mins: 8 },
  { title: "AI② 気になったこと", mins: 7 },
  { title: "AI③ 来週の一歩", mins: 8 },
  { title: "班で共有して提出", mins: 8 }
];

let be, user = null, profile = null;
let note = { step: 0, submitted: false, data: {} };
let saveTimer = null;

const v = k => (note.data[k] || "").trim();

// ---------- プロンプト ----------
function prompt1() {
  return `私は高校1年生です。私についての答え：` +
    `【時間が溶けたもの：${v("odai1") || "なし"}】` +
    `【語りだすと止まらないもの：${v("odai2") || "なし"}】` +
    `【最近モヤっとしたこと：${v("odai3") || "なし"}】。` +
    `ここから探究のきっかけになるキーワードを20個、「ど真ん中7・ちょっと意外7・遠いけど面白い6」に分け、一言の説明をつけて表で出してください。`;
}
function prompt2() {
  const ks = ["kw1", "kw2", "kw3"].map(v).filter(Boolean).map(k => `【${k}】`).join("");
  return `気になったのは${ks}です。組み合わせたり、人・場所・場面にしぼったりして、もっと具体的なキーワードを10個、一言の説明つきで出してください。`;
}
function prompt3() {
  return `私が気になったのは【${v("kininaru")}】です。` +
    `①つながる社会の課題を、身近な場面で3つ　` +
    `②来週までに30分以内・お金不要・一人で安全にできる小さな一歩を5つ（見に行く／やってみる／聞く／測る。検索だけで終わるものは除く）。それぞれ一言で。`;
}

// ---------- 保存 ----------
function setBadge(text, cls = "") {
  saveBadge.textContent = text;
  saveBadge.className = "save " + cls;
}
function scheduleSave() {
  setBadge("入力中…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(), 2000); // 2秒まとめて保存（書き込み回数を抑える）
}
async function saveNow(markSubmitted = false) {
  clearTimeout(saveTimer);
  if (!user || !profile) return;
  try {
    setBadge("保存中…");
    await be.saveNote(user.uid, LESSON, profile, note, markSubmitted);
    setBadge(be.demo ? "デモ（保存されません）" : "保存しました ✓", "ok");
  } catch (e) {
    console.error(e);
    setBadge("保存できません。先生に声をかけてね", "ng");
  }
}

// ---------- 部品 ----------
function field(key, label, { placeholder = "", rows = 2, type = "textarea", hint = "" } = {}) {
  const val = escapeHtml(note.data[key] || "");
  const input = type === "textarea"
    ? `<textarea data-key="${key}" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${val}</textarea>`
    : `<input data-key="${key}" type="${type}" value="${val}" placeholder="${escapeHtml(placeholder)}">`;
  return `<label class="field"><span class="label">${label}</span>${hint ? `<span class="hint">${hint}</span>` : ""}${input}</label>`;
}

function promptBox(text, { openGemini = false, sameChat = false } = {}) {
  return `
    <div class="prompt">
      <div class="prompt-head">AIに送る文（自動でできています）</div>
      <pre class="prompt-text">${escapeHtml(text)}</pre>
      <div class="prompt-actions">
        <button class="btn" data-copy>コピーする</button>
        ${openGemini ? `<a class="btn ghost" href="https://gemini.google.com/app" target="_blank" rel="noopener">Geminiを開く ↗</a>` : ""}
      </div>
      ${sameChat ? `<p class="note">⚠️ さっきの<b>Geminiのタブに戻って、同じチャットに</b>貼ってください。新しいチャットにすると、AIは前の話を覚えていません。</p>`
                 : `<p class="note">Geminiに貼って送信。<b>このあとも同じチャットで続けます。</b></p>`}
    </div>`;
}

function progress(i) {
  return `<ol class="progress">${STEPS.map((s, j) =>
    `<li class="${j < i ? "done" : j === i ? "now" : ""}"><span>${j + 1}</span></li>`).join("")}</ol>`;
}

function nav(i, canNext, nextLabel = "次へ") {
  return `
    <div class="nav">
      ${i > 0 ? `<button class="btn ghost" data-go="${i - 1}">← もどる</button>` : `<button class="btn ghost" data-home>ホーム</button>`}
      <button class="btn primary" data-go="${i + 1}" ${canNext ? "" : "disabled"}>${nextLabel} →</button>
    </div>`;
}

// ---------- 画面 ----------
function renderSetupNeeded() {
  app.innerHTML = `<section class="card"><h2>準備中です</h2><p>先生がFirebaseの設定を入れると使えるようになります。</p>
  <p class="hint">先生へ：<code>js/firebase-config.js</code> に設定を貼ってください。動きを見るだけなら、URLの最後に <code>?demo</code> をつけて開けます。</p></section>`;
}

function renderLogin(msg = "") {
  who.textContent = "";
  app.innerHTML = `
    <section class="card hero">
      <p class="eyebrow">GCIS 個人探究</p>
      <h1>探究ノート</h1>
      <p>2月に「もっと知りたい」と思える、自分の問いを見つけにいこう。</p>
      <button class="btn primary big" id="login">学校のGoogleアカウントでログイン</button>
      <p class="hint">@${STUDENT_DOMAIN} のアカウントを選んでください</p>
      ${msg ? `<p class="error">${msg}</p>` : ""}
    </section>`;
  document.getElementById("login").onclick = async () => {
    try { await be.signIn(STUDENT_DOMAIN); }
    catch (e) {
      console.error(e);
      renderLogin(e.code === "auth/popup-blocked"
        ? "ポップアップがブロックされました。ブラウザの設定でこのサイトのポップアップを許可してください。"
        : "ログインできませんでした。もう一度押してみてください。");
    }
  };
}

function renderProfile() {
  const cls = profile?.class ?? "";
  const num = profile?.number ?? "";
  const classOpts = [...CLASSES, TEST_CLASS].map(c =>
    `<option value="${c}" ${c === cls ? "selected" : ""}>${classLabel(c)}</option>`).join("");
  const numOpts = Array.from({ length: MAX_NUMBER }, (_, i) => i + 1).map(n =>
    `<option value="${n}" ${n === num ? "selected" : ""}>${n}番</option>`).join("");
  app.innerHTML = `
    <section class="card">
      <h2>はじめに：クラスと番号</h2>
      <p>最初の1回だけです。</p>
      <div class="row">
        <label class="field"><span class="label">クラス</span><select id="cls"><option value="">選ぶ</option>${classOpts}</select></label>
        <label class="field"><span class="label">出席番号</span><select id="num"><option value="">選ぶ</option>${numOpts}</select></label>
      </div>
      <p class="hint">「テスト」は先生の動作確認用です。</p>
      <div class="nav"><span></span><button class="btn primary" id="ok" disabled>決定 →</button></div>
    </section>`;
  const c = document.getElementById("cls"), n = document.getElementById("num"), ok = document.getElementById("ok");
  const check = () => ok.disabled = !(c.value !== "" && n.value !== "");
  c.onchange = n.onchange = check; check();
  ok.onclick = async () => {
    ok.disabled = true;
    const isNew = !profile;
    profile = { email: user.email, class: Number(c.value), number: Number(n.value) };
    try {
      await be.saveProfile(user.uid, user.email, profile.class, profile.number, isNew);
      if (!isNew) await saveNow(); // ノート側のクラス・番号も合わせる
      showWho(); renderHome();
    } catch (e) {
      console.error(e); ok.disabled = false;
      alert("保存できませんでした。先生に声をかけてください。");
    }
  };
}

function showWho() {
  who.innerHTML = profile ? `${classLabel(profile.class)} ${profile.number}番 <button class="link" id="edit">変更</button> <button class="link" id="out">ログアウト</button>` : "";
  document.getElementById("edit")?.addEventListener("click", renderProfile);
  document.getElementById("out")?.addEventListener("click", () => be.signOut());
}

function renderHome() {
  const started = note.step > 0 || Object.keys(note.data).length > 0;
  app.innerHTML = `
    <section class="card hero">
      <p class="eyebrow">ゴール</p>
      <h2>2月に「もっと知りたい」と思える、自分の問いを持っている</h2>
      <ol class="map">${MAP.map((m, i) => `<li class="${i === 0 ? "now" : ""}">${m}</li>`).join("")}</ol>
      <ul class="promise">
        <li>気になることは、何度変えてもいい</li>
        <li>空欄があってもいい</li>
        <li>早く終わったら、先に進んでいい</li>
      </ul>
    </section>
    <section class="card lesson">
      <div>
        <p class="eyebrow">第1回 ${note.submitted ? "・提出済み ✓" : ""}</p>
        <h3>気になることを見つけて、来週の一歩を決める</h3>
      </div>
      <button class="btn primary" data-go="${note.submitted ? 4 : note.step}">${note.submitted ? "見なおす" : started ? "つづきから" : "はじめる"} →</button>
    </section>`;
}

function renderStep(i) {
  note.step = Math.max(0, Math.min(STEPS.length - 1, i));
  const s = STEPS[note.step];
  let body = "", can = true, nextLabel = "次へ";

  if (note.step === 0) {
    body = `
      <p>思いつくままに。<b>空欄があってもOK</b>（1つは書こう）。</p>
      ${field("odai1", "① 気づいたら時間が溶けていたのは？", { placeholder: "例：料理動画を見ること" })}
      ${field("odai2", "② 人に語りだすと止まらないのは？", { placeholder: "例：バスケ部のこと" })}
      ${field("odai3", "③ 最近モヤっとしたのは？", { placeholder: "例：電車で席を譲るか迷った" })}
      <details class="help"><summary>どうしても思いつかないとき</summary>
        <p>先生が配る「テーマの例」の一覧から、少しでも気になるものを1つ選んで、①に書いてOKです。</p></details>`;
    can = ["odai1", "odai2", "odai3"].some(k => v(k));
  }
  if (note.step === 1) {
    body = `
      ${promptBox(prompt1(), { openGemini: true })}
      <p>出てきた20個を眺めて、<b>直感で気になったもの</b>を3つ書こう。理由はいらない。</p>
      <div class="row3">
        ${field("kw1", "気になった ①", { type: "text" })}
        ${field("kw2", "気になった ②", { type: "text" })}
        ${field("kw3", "気になった ③", { type: "text" })}
      </div>
      <p class="hint">読み切れなかったら、各列から1つずつ選んでもOK。</p>`;
    can = ["kw1", "kw2", "kw3"].some(k => v(k));
  }
  if (note.step === 2) {
    body = `
      ${promptBox(prompt2(), { sameChat: true })}
      <p>出てきたキーワードを眺めていて、<b>気になったこと</b>を1つ、自分の言葉で書こう。</p>
      ${field("kininaru", "キーワードを眺めていて気になったこと", {
        rows: 3, placeholder: "例：部活生って、練習後に何をどれだけ食べてるんだろう？",
        hint: "書き方の例：「〇〇の△△が気になる」「なぜ〜？」「〜って本当？」"
      })}`;
    can = !!v("kininaru");
  }
  if (note.step === 3) {
    body = `
      ${promptBox(prompt3(), { sameChat: true })}
      ${field("shakai", "つながりそうな社会の課題（1つ）", { type: "text", placeholder: "例：若者の栄養の偏り", hint: "「なさそう」でもOK。無理につなげなくていい。" })}
      ${field("ippo", "来週までにやる一歩（5つから1つ選ぶ）", { rows: 2, placeholder: "例：部活の友だち3人に、昨日の練習後に食べたものを聞く" })}
      ${field("ippoDate", "やる日", { type: "date" })}
      ${field("yosou", "予想（〜すると〜だと思う。なぜなら〜）", { rows: 2, placeholder: "例：3人ともパンかお菓子で、タンパク質を意識している人はいないと思う。自分がそうだから。" })}
      <div class="rules"><b>一歩の安全ルール</b>
        <ul><li>聞いてよい相手は家族・友だちまで</li><li>他の人の個人情報や写真は集めない</li><li>「検索して終わり」ではなく、体を動かす一歩にする</li></ul></div>`;
    can = !!v("ippo") && !!v("yosou");
  }
  if (note.step === 4) {
    const d = note.data;
    body = `
      <div class="themecard">
        <div class="tc-row"><span>気になったキーワード</span><b>${escapeHtml(["kw1", "kw2", "kw3"].map(v).filter(Boolean).join("・") || "—")}</b></div>
        <div class="tc-row big"><span>気になったこと</span><b>${escapeHtml(d.kininaru || "—")}</b></div>
        <div class="tc-row"><span>つながる社会の課題</span><b>${escapeHtml(d.shakai || "—")}</b></div>
        <div class="tc-row big"><span>来週までにやる一歩</span><b>${escapeHtml(d.ippo || "—")}</b><em>${escapeHtml(d.ippoDate || "")}</em></div>
        <div class="tc-row"><span>予想</span><b>${escapeHtml(d.yosou || "—")}</b></div>
      </div>
      <div class="share">
        <b>班で共有（1人1分）</b>
        <p>この画面を見せながら「気になったこと・来週やること・予想」を話そう。聞く人は質問を1つ。</p>
      </div>
      ${note.submitted ? `<p class="okmsg">提出済み ✓　あとから直しても自動で保存されます。</p>` : ""}`;
    nextLabel = note.submitted ? "ホームへ" : "提出する";
  }

  app.innerHTML = `
    <section class="card">
      ${progress(note.step)}
      <div class="step-head"><h2>${note.step + 1}. ${s.title}</h2><span class="mins">目安 ${s.mins}分</span></div>
      ${body}
      ${nav(note.step, can, nextLabel)}
    </section>`;
  window.scrollTo(0, 0);

  // 入力で自動保存。「次へ」の可否も更新する
  app.querySelectorAll("[data-key]").forEach(el => {
    el.addEventListener("input", () => {
      note.data[el.dataset.key] = el.value;
      scheduleSave();
      const btn = app.querySelector(".nav .primary");
      if (btn && note.step < 4) btn.disabled = !canNextNow();
    });
  });
  app.querySelectorAll("[data-copy]").forEach(btn => btn.addEventListener("click", () => copyPrompt(btn)));
}

function canNextNow() {
  switch (note.step) {
    case 0: return ["odai1", "odai2", "odai3"].some(k => v(k));
    case 1: return ["kw1", "kw2", "kw3"].some(k => v(k));
    case 2: return !!v("kininaru");
    case 3: return !!v("ippo") && !!v("yosou");
    default: return true;
  }
}

async function copyPrompt(btn) {
  const text = btn.closest(".prompt").querySelector(".prompt-text").textContent;
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand("copy"); ta.remove();
  }
  btn.textContent = "コピーしました ✓";
  setTimeout(() => (btn.textContent = "コピーする"), 2000);
}

// 画面の移動（ボタン共通）
app.addEventListener("click", async e => {
  const go = e.target.closest("[data-go]");
  const home = e.target.closest("[data-home]");
  if (home) { await saveNow(); renderHome(); return; }
  if (!go) return;
  const to = Number(go.dataset.go);
  if (to >= STEPS.length) { // 提出
    if (!note.submitted) { note.submitted = true; await saveNow(true); renderStep(4); }
    else { renderHome(); }
    return;
  }
  renderStep(to);
  await saveNow();
});

// ---------- 起動 ----------
async function start() {
  if (!isDemo && !configReady) { renderSetupNeeded(); return; }
  if (isDemo) document.body.classList.add("is-demo");
  try { be = await createBackend(); }
  catch (e) { console.error(e); app.innerHTML = `<section class="card"><p class="error">読み込みに失敗しました。ページを再読み込みしてください。</p></section>`; return; }

  be.onUser(async u => {
    user = u; profile = null; note = { step: 0, submitted: false, data: {} };
    if (!u) { renderLogin(); return; }
    if (!be.demo && !hasDomain(u.email, STUDENT_DOMAIN)) {
      await be.signOut();
      renderLogin(`@${STUDENT_DOMAIN} のアカウントでログインしてください（先生用の画面は teacher.html です）。`);
      return;
    }
    app.innerHTML = `<section class="card"><p>読み込み中…</p></section>`;
    try {
      profile = await be.getProfile(u.uid);
      const saved = await be.getNote(u.uid, LESSON);
      if (saved) note = { step: saved.step || 0, submitted: !!saved.submitted, data: saved.data || {} };
    } catch (e) { console.error(e); }
    if (!profile) { renderProfile(); return; }
    showWho(); renderHome();
  });
}
start();

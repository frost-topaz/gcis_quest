// 生徒画面：L01（気になることを見つけ、来週の一歩を決める）
import {
  escapeHtml, kiOf, classLabel, methodOf, openGemini,
  CLASSES, MAX_NUMBER, TEST_CLASS
} from "./common.js";
import { THEMES } from "./themes.js";

const LESSON = "L01";
const MAP = ["気になる", "一歩", "文献", "問い", "計画", "着手", "RQ"];
const STEPS = [
  { title: "自分が何に興味があるのか、AIと一緒に探してみよう", mins: 4 },
  { title: "AI① キーワード20個", mins: 8 },
  { title: "AI② 「えっ、本当？」と思う説", mins: 7 },
  { title: "AI③ 来週の一歩", mins: 8 },
  { title: "班で共有して提出", mins: 8 }
];
const YOSOU_TEMPLATE = "たぶん＿＿だと思う。なぜなら＿＿。";
const SHORT_MSG = "思いついたことを、もう少しだけ足してみよう（いつ？どんなとき？）";

export function mountStudent({ be, user, app, asTeacher }) {
  const saveBadge = document.getElementById("save");
  const who = document.getElementById("who");
  const ac = new AbortController();
  let profile = null;
  let note = { step: 0, submitted: false, data: {} };
  let saveTimer = null, alive = true;

  const v = k => (note.data[k] || "").trim();
  const route = () => (note.data.route === "B" ? "B" : "A");

  // ---------- プロンプト ----------
  const KW_TAIL = "ここから探究のきっかけになるキーワードを20個、「ど真ん中7・ちょっと意外7・遠いけど面白い6」に分け、一言の説明をつけて表で出してください。番号はつけないでください。表のあとには、説明・アドバイス・問いの例・次の提案を書かないでください。表だけを出してください。";
  function prompt1() {
    if (route() === "B") {
      return `私は高校1年生です。【${v("theme")}】というテーマが少し気になっています。` +
        (v("themeWhere") ? `特に【${v("themeWhere")}】のところが気になりました。` : "") + KW_TAIL;
    }
    return `私は高校1年生です。私についての答え：` +
      `【時間が溶けたもの：${v("odai1") || "なし"}】` +
      `【語りだすと止まらないもの：${v("odai2") || "なし"}】` +
      `【最近モヤっとしたこと：${v("odai3") || "なし"}】。` + KW_TAIL;
  }
  function prompt2() {
    const ks = ["kw1", "kw2", "kw3"].map(v).filter(Boolean).map(k => `【${k}】`).join("");
    return `気になったのは${ks}です。それぞれについて、研究や専門家の間で「こう言われている」という意外な説を3つずつ、1つ40文字以内で出してください。` +
      `高校生が直感的に「えっ、本当？」と思うもの、できれば自分の生活で確かめられそうなものにしてください。` +
      `研究者の名前・論文名は書かないでください。理由・問い・調べ方も書かないでください。表のあとには何も書かないでください。`;
  }
  function prompt3() {
    return `私が「本当？」と思ったのは【${v("setsu")}】です。この説を確かめるために、来週までに30分以内・お金不要・安全にできる小さな一歩を5つ出してください` +
      `（見に行く／やってみる／聞く／測る。方法が偏らないように。検索だけで終わるものは除く）。` +
      `それぞれ、【方法】から始まる短い見出しを太字で書き、その下に何をして何を見ればよいかを1〜2行で書いてください。` +
      `前置きは書かないでください。最後に「ピンとこなければ『もう少し出して』と送ってください」と書いてください。`;
  }

  // ---------- 保存 ----------
  function setBadge(text, cls = "") { saveBadge.textContent = text; saveBadge.className = "save " + cls; }
  function scheduleSave() {
    setBadge("入力中…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNow(), 2000); // 2秒まとめて保存（書き込み回数を抑える）
  }
  async function saveNow(markSubmitted = false) {
    clearTimeout(saveTimer); saveTimer = null;
    if (!profile) return;
    try {
      setBadge("保存中…");
      await be.saveNote(user.uid, LESSON, profile, note, markSubmitted);
      if (alive) setBadge(be.demo ? "デモ（保存されません）" : "保存しました ✓", "ok");
    } catch (e) {
      console.error(e);
      if (alive) setBadge("保存できません。先生に声をかけてね", "ng");
    }
  }

  // ---------- 部品 ----------
  function field(key, label, { placeholder = "", rows = 2, type = "textarea", hint = "", short = false, chips = null } = {}) {
    const val = escapeHtml(note.data[key] || "");
    const input = type === "textarea"
      ? `<textarea data-key="${key}" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${val}</textarea>`
      : `<input data-key="${key}" type="${type}" value="${val}" placeholder="${escapeHtml(placeholder)}">`;
    const chipHtml = chips ? `<span class="chips">${chips.map(c =>
      `<button type="button" class="chip" data-insert="${escapeHtml(c.text)}" data-target="${key}">${escapeHtml(c.label)}</button>`).join("")}</span>` : "";
    return `<div class="field"><label><span class="label">${label}</span>${hint ? `<span class="hint">${hint}</span>` : ""}${chipHtml}${input}</label>` +
      (short ? `<p class="hint short" data-short="${key}" hidden>${SHORT_MSG}</p>` : "") + `</div>`;
  }

  function promptBox(text, { first = false } = {}) {
    return `
      <div class="prompt">
        <div class="prompt-head">AIに送る文（自動でできています）</div>
        <pre class="prompt-text">${escapeHtml(text)}</pre>
        <div class="prompt-actions">
          <button class="btn" data-copy>コピーする</button>
          <button class="btn ghost" data-gemini>${first ? "Geminiを右半分に開く ↗" : "Geminiのウィンドウを前に出す ↗"}</button>
        </div>
        <p class="note" data-gemini-msg>${first
          ? `開いたGeminiに貼って送信。<b>このあとも同じチャットで続けます。</b>（モデルは「Flash」のままでOK）`
          : `⚠️ さっきの<b>Geminiのウィンドウに戻って、同じチャットに</b>貼ってください。新しいチャットにすると、AIは前の話を覚えていません。`}</p>
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
      profile = { email: user.email, ki: kiOf(user.email), class: Number(c.value), number: Number(n.value) };
      try {
        await be.saveProfile(user.uid, profile, isNew);
        if (!isNew) await saveNow(); // ノート側のクラス・番号も合わせる
        showWho(); renderHome();
      } catch (e) {
        console.error(e); ok.disabled = false;
        alert("保存できませんでした。先生に声をかけてください。");
      }
    };
  }

  function showWho() {
    if (!profile) { who.innerHTML = ""; return; }
    who.innerHTML = asTeacher
      ? `<span class="tag">テスト（教員）</span>`
      : `${classLabel(profile.class)} ${profile.number}番 <button class="link" id="edit">変更</button>`;
    document.getElementById("edit")?.addEventListener("click", renderProfile);
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

  function step0() {
    if (route() === "B") {
      const sel = v("theme");
      return `
        <p><b>テーマの例</b>：少しでも気になるものを1つクリックしよう。あとで変えてもOK。</p>
        <div class="themes">${THEMES.map((t, i) =>
          `<button type="button" class="theme ${t === sel ? "on" : ""}" data-theme="${i}">${escapeHtml(t)}</button>`).join("")}</div>
        ${sel ? field("themeWhere", "どこが少し気になった？（なくてもOK）", { type: "text", placeholder: "例：「食」のところ。給食の残りが多いのが気になってた" }) : ""}
        <p class="switch"><button type="button" class="link" data-route="A">← 3つの質問にもどる</button></p>`;
    }
    return `
      <p class="lead">まずは3つの質問に答えるだけ。<b>空欄があってもOK。</b>頭の中の考えを、まとめずにそのまま打って大丈夫。話しことばも途中の文も「うーん」も歓迎。まとめるのはAIの仕事です。<span class="hint">（しゃべって入力もOK：Windowsキー＋H）</span></p>
      ${field("odai1", "① 気づいたら時間が溶けていたのは？", { placeholder: "例：料理動画とか、作らないのに気づいたら1時間くらい見てる", short: true })}
      ${field("odai2", "② 人に語りだすと止まらないのは？", { placeholder: "例：バスケ部の試合の話になると、あの逆転のときがさ…って止まらなくなる", short: true })}
      ${field("odai3", "③ 最近モヤっとしたのは？", { placeholder: "例：電車で席を譲るか迷って、結局声をかけられなくて、ずっとモヤモヤしてた", short: true })}
      <p class="switch"><button type="button" class="link" data-route="B">思いつかないときは → テーマの例から選ぶ</button></p>`;
  }

  function renderStep(i) {
    note.step = Math.max(0, Math.min(STEPS.length - 1, i));
    const s = STEPS[note.step];
    let body = "", nextLabel = "次へ";

    if (note.step === 0) body = step0();
    if (note.step === 1) {
      body = `
        ${promptBox(prompt1(), { first: true })}
        <p class="hint">画面が重なったら、このページを左に寄せよう（Windows：Windowsキー＋← ／ Chromebook：Alt＋[ ）。Chrome右上の「Geminiに相談」は使いません。</p>
        <p>出てきた20個を眺めて、<b>直感で気になったもの</b>を3つ書こう。理由はいらない。</p>
        <div class="row3">
          ${field("kw1", "気になった ①", { type: "text" })}
          ${field("kw2", "気になった ②", { type: "text" })}
          ${field("kw3", "気になった ③", { type: "text" })}
        </div>
        <p class="hint">読み切れなかったら、各列から1つずつ選んでもOK。</p>`;
    }
    if (note.step === 2) {
      body = `
        ${promptBox(prompt2())}
        <p>出てきた説を眺めて、<b>いちばん「えっ、本当？」と思った説を1つ選ぼう。</b></p>
        ${field("setsu", "選んだ説", { rows: 2, placeholder: "例：完全に静かな部屋よりも、適度な雑音がある場所の方が没頭しやすい", hint: "Geminiの文をコピーして貼ってOK" })}
        ${field("hikkakari", "ひっかかったところ（なくてもOK）", {
          rows: 2, placeholder: "例：本当に？ 自分は図書館のほうがはかどる気がする",
          hint: "書き出しを押すと入ります", chips: [
            { label: "本当に〜？", text: "本当に" }, { label: "自分だと〜", text: "自分だと" }, { label: "なんで〜なの？", text: "なんで" }]
        })}
        <p class="note">AIの説は、本当かどうか分かりません。<b>だから次で、自分で確かめてみます。</b></p>
        <p class="hint">ピンとこなければ、Geminiに「ほかの説も出してください」と送ってOK。</p>`;
    }
    if (note.step === 3) {
      body = `
        ${promptBox(prompt3())}
        ${field("ippo", "来週までにやる一歩（5つから1つ選ぶ）", { rows: 3, placeholder: "例：【やってみる】無音の部屋と、カフェの雑音を流した部屋で、15分ずつ同じ問題を解いて比べる", hint: "【やってみる】などの見出しごと貼ってOK。自分で思いついた一歩でもOK" })}
        ${field("ippoDate", "やる日", { type: "date" })}
        ${field("yosou", "予想", { rows: 2, placeholder: "例：たぶん雑音がある方がはかどると思う。なぜなら、家より図書館の方が勉強が進むから。", hint: "たぶん＿＿だと思う。なぜなら＿＿。", chips: [{ label: "書き出しを入れる", text: YOSOU_TEMPLATE }] })}
        <div class="rules"><b>一歩の安全ルール</b>
          <ul><li>他の人の個人情報や写真は集めない</li><li>「検索して終わり」ではなく、体を動かす一歩にする</li></ul></div>`;
    }
    if (note.step === 4) {
      const d = note.data, m = methodOf(d.ippo);
      body = `
        <div class="themecard">
          ${route() === "B" && d.theme ? `<div class="tc-row"><span>テーマの例</span><b>${escapeHtml(d.theme)}</b></div>` : ""}
          <div class="tc-row"><span>気になったキーワード</span><b>${escapeHtml(["kw1", "kw2", "kw3"].map(v).filter(Boolean).join("・") || "—")}</b></div>
          <div class="tc-row big"><span>「えっ、本当？」と思った説</span><b>${escapeHtml(d.setsu || "—")}</b></div>
          <div class="tc-row"><span>ひっかかったところ</span><b>${escapeHtml(d.hikkakari || "—")}</b></div>
          <div class="tc-row big"><span>来週までにやる一歩${m && m !== "不明" && m !== "その他" ? ` <i class="mt">${m}</i>` : ""}</span><b>${escapeHtml(d.ippo || "—")}</b><em>${escapeHtml(d.ippoDate || "")}</em></div>
          <div class="tc-row"><span>予想</span><b>${escapeHtml(d.yosou || "—")}</b></div>
        </div>
        ${field("geminiLink", "Geminiのチャットのリンク（なくてもOK）", { type: "url", placeholder: "https://…", hint: "Geminiの「共有」→「リンクをコピー」で取れます。共有できないときは空欄でOK" })}
        <div class="share">
          <b>班で共有（1人1分）</b>
          <p>この画面を見せながら「本当？と思った説・来週やること・予想」を話そう。聞く人は質問を1つ。</p>
        </div>
        ${note.submitted ? `<p class="okmsg">提出済み ✓　あとから直しても自動で保存されます。</p>` : ""}`;
      nextLabel = note.submitted ? "ホームへ" : "提出する";
    }

    app.innerHTML = `
      <section class="card">
        ${progress(note.step)}
        <div class="step-head"><h2>${note.step + 1}. ${s.title}</h2><span class="mins">目安 ${s.mins}分</span></div>
        ${body}
        ${nav(note.step, canNextNow(), nextLabel)}
      </section>`;
    window.scrollTo(0, 0);
    updateShortHints();
  }

  function yosouFilled() {
    const x = v("yosou").replace(/[\s　]/g, "");
    return !!x && x !== YOSOU_TEMPLATE.replace(/[\s　]/g, "");
  }
  function canNextNow() {
    switch (note.step) {
      case 0: return route() === "B" ? !!v("theme") : ["odai1", "odai2", "odai3"].some(k => v(k));
      case 1: return ["kw1", "kw2", "kw3"].some(k => v(k));
      case 2: return !!v("setsu");
      case 3: return !!v("ippo") && yosouFilled();
      default: return true;
    }
  }
  function updateShortHints() {
    app.querySelectorAll("[data-short]").forEach(p => {
      const n = v(p.dataset.short).length;
      p.hidden = !(n > 0 && n < 10);
    });
  }
  function refreshNext() {
    const btn = app.querySelector(".nav .primary");
    if (btn && note.step < 4) btn.disabled = !canNextNow();
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

  function gemini(btn, force = false) {
    const r = openGemini({ force });
    const msg = btn.closest(".prompt").querySelector("[data-gemini-msg]");
    if (r === "lost") {
      msg.innerHTML = `Geminiのウィンドウが見つかりません。<b>開いているときは、そのウィンドウに戻ってください</b>（タスクバー、または Alt＋Tab）。閉じてしまったときは <button class="link" data-gemini-force>新しく開く</button>（前の話は引き継がれません）`;
    } else if (r === "blocked") {
      msg.innerHTML = `ポップアップが止められました。アドレスバー右の表示から、このサイトのポップアップを許可してください。`;
    }
  }

  function insertChip(btn) {
    const el = app.querySelector(`[data-key="${btn.dataset.target}"]`);
    if (!el) return;
    const t = btn.dataset.insert;
    if (t === YOSOU_TEMPLATE) {
      if (!el.value.trim()) el.value = t;
      el.focus(); el.setSelectionRange(3, 5); // 最初の「＿＿」を選んでおく（打てば置きかわる）
    } else {
      const pos = el.selectionStart ?? el.value.length;
      el.value = el.value.slice(0, pos) + t + el.value.slice(el.selectionEnd ?? pos);
      el.focus(); el.setSelectionRange(pos + t.length, pos + t.length);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ---------- イベント（画面共通） ----------
  app.addEventListener("input", e => {
    const el = e.target.closest("[data-key]");
    if (!el) return;
    note.data[el.dataset.key] = el.value;
    scheduleSave(); refreshNext(); updateShortHints();
  }, { signal: ac.signal });

  app.addEventListener("click", async e => {
    const t = e.target;
    if (t.closest("[data-copy]")) { copyPrompt(t.closest("[data-copy]")); return; }
    if (t.closest("[data-gemini-force]")) { gemini(t.closest(".prompt").querySelector("[data-gemini]"), true); return; }
    if (t.closest("[data-gemini]")) { gemini(t.closest("[data-gemini]")); return; }
    if (t.closest("[data-insert]")) { insertChip(t.closest("[data-insert]")); return; }
    const rt = t.closest("[data-route]");
    if (rt) { note.data.route = rt.dataset.route; renderStep(0); scheduleSave(); return; }
    const th = t.closest("[data-theme]");
    if (th) {
      note.data.theme = THEMES[Number(th.dataset.theme)];
      renderStep(0); scheduleSave();
      app.querySelector('[data-key="themeWhere"]')?.scrollIntoView({ block: "center" });
      return;
    }
    if (t.closest("[data-home]")) { await saveNow(); renderHome(); return; }
    const go = t.closest("[data-go]");
    if (!go) return;
    const to = Number(go.dataset.go);
    if (to >= STEPS.length) { // 提出
      if (!note.submitted) { note.submitted = true; await saveNow(true); renderStep(4); }
      else { renderHome(); }
      return;
    }
    renderStep(to);
    await saveNow();
  }, { signal: ac.signal });

  // ---------- 起動 ----------
  (async () => {
    app.innerHTML = `<section class="card"><p>読み込み中…</p></section>`;
    try {
      profile = await be.getProfile(user.uid);
      const saved = await be.getNote(user.uid, LESSON);
      if (saved) note = { step: saved.step || 0, submitted: !!saved.submitted, data: saved.data || {} };
      const ki = kiOf(user.email);
      if (asTeacher) { // 教員は番号の入力なしで「テスト」として保存
        const want = { email: user.email, ki, class: TEST_CLASS, number: 0 };
        if (!profile || profile.class !== TEST_CLASS || profile.number !== 0 || profile.ki !== ki) {
          await be.saveProfile(user.uid, want, !profile);
        }
        profile = want;
      } else if (profile && profile.ki !== ki) { // 第1版のプロフィールに期を足す
        profile = { ...profile, email: user.email, ki };
        await be.saveProfile(user.uid, profile, false);
      }
    } catch (e) { console.error(e); }
    if (!alive) return;
    if (!profile) { renderProfile(); return; }
    showWho(); renderHome();
  })();

  return () => {
    if (saveTimer) saveNow(); // 画面を切り替える直前の入力も保存する
    alive = false; ac.abort();
  };
}

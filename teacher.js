// 教員画面：期・クラスごとの進み具合（リアルタイム）
import {
  escapeHtml, classLabel, kiLabel, firstYearKi, methodOf, lsGet, lsSet,
  CLASSES, MAX_NUMBER, TEST_CLASS, METHODS
} from "./common.js";

const LESSON = "L01";
const STEP_NAMES = ["お題", "AI①", "AI②", "AI③", "共有"];
const STALL_MIN = 5; // この分数以上更新がなく未提出なら「止まってる？」

export function mountTeacher({ be, app, dlg }) {
  const k1 = firstYearKi();
  const KIS = [k1, String(k1 - 1), String(k1 - 2), ""]; // 1年・2年・3年・期なし
  let ki = KIS.includes(lsGet("gcis_t_ki") ?? "x") ? lsGet("gcis_t_ki") : k1;
  let cls = Number(lsGet("gcis_t_cls") ?? 1);
  if (![...CLASSES, TEST_CLASS].includes(cls)) cls = 1;
  let unwatch = null, students = [], notes = [];

  function renderShell() {
    const tabs = [...CLASSES, TEST_CLASS].map(c =>
      `<button class="tab ${c === cls ? "on" : ""}" data-cls="${c}">${classLabel(c)}</button>`).join("");
    const kiOpts = KIS.map((k, i) =>
      `<option value="${k}" ${k === ki ? "selected" : ""}>${kiLabel(k)}${i < 3 && k ? `（いまの${i + 1}年）` : ""}</option>`).join("");
    app.innerHTML = `
      <section class="card">
        <div class="t-head">
          <div class="tabs"><select id="ki" class="ki" ${cls === TEST_CLASS ? "disabled" : ""}>${kiOpts}</select>${tabs}</div>
          <div class="t-actions"><span class="pill">第1回（L01）</span><button class="btn ghost small" id="csv">CSVで保存</button></div>
        </div>
        ${cls === TEST_CLASS ? `<p class="hint">テスト：期を問わず表示します（アドレス順）。先生が「生徒画面へ」で入力したものもここに出ます。</p>` : ""}
        <div id="summary" class="summary"></div>
        <div id="methods" class="methods"></div>
        <div id="table"></div>
        <div id="missing" class="missing"></div>
      </section>`;
    app.querySelectorAll("[data-cls]").forEach(b => b.onclick = () => {
      cls = Number(b.dataset.cls); lsSet("gcis_t_cls", String(cls)); renderShell(); watch();
    });
    document.getElementById("ki").onchange = e => { ki = e.target.value; lsSet("gcis_t_ki", ki); watch(); };
    document.getElementById("csv").onclick = downloadCsv;
  }

  function rows() {
    const byUid = Object.fromEntries(notes.map(n => [n.uid, n]));
    const rs = students.map(s => ({ ...s, note: byUid[s.uid] || null }));
    return cls === TEST_CLASS
      ? rs.sort((a, b) => String(a.email).localeCompare(String(b.email)))
      : rs.sort((a, b) => a.number - b.number);
  }

  function status(r) {
    const n = r.note;
    if (!n) return { label: "ログインのみ", cls: "st-none", stall: false };
    if (n.submitted) return { label: "提出済み", cls: "st-done", stall: false };
    const mins = n.updatedAt ? (Date.now() - n.updatedAt.getTime()) / 60000 : 0;
    return { label: `${(n.step ?? 0) + 1}. ${STEP_NAMES[n.step ?? 0]}`, cls: "st-work", stall: mins >= STALL_MIN };
  }

  const fmtTime = d => d ? d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "—";
  const numCell = r => cls === TEST_CLASS ? escapeHtml(r.number ? `${r.number}番` : "教員") : r.number;
  const safeUrl = u => /^https:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "";

  function renderTable() {
    if (!document.getElementById("table")) return;
    const rs = rows();
    const submitted = rs.filter(r => r.note?.submitted).length;
    const stalled = rs.filter(r => status(r).stall).length;
    document.getElementById("summary").innerHTML = `
      <div class="sum"><b>${rs.length}</b><span>ログイン${cls === TEST_CLASS ? "" : ` / ${MAX_NUMBER}`}</span></div>
      <div class="sum"><b>${submitted}</b><span>提出済み</span></div>
      <div class="sum warn"><b>${stalled}</b><span>${STALL_MIN}分以上止まってる？</span></div>`;

    // 一歩の方法の偏り
    const count = Object.fromEntries([...METHODS, "その他", "不明"].map(m => [m, 0]));
    rs.forEach(r => { const m = methodOf(r.note?.data?.ippo); if (m) count[m]++; });
    const total = Object.values(count).reduce((a, b) => a + b, 0);
    document.getElementById("methods").innerHTML = total
      ? `<span class="hint">一歩の方法：</span>${[...METHODS, "その他", "不明"].filter(m => count[m] || METHODS.includes(m))
          .map(m => `<span class="mchip ${count[m] ? "" : "zero"}">${m} <b>${count[m]}</b></span>`).join("")}`
      : "";

    if (!rs.length) {
      document.getElementById("table").innerHTML = `<p class="hint">まだ誰もログインしていません。</p>`;
    } else {
      document.getElementById("table").innerHTML = `
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>${cls === TEST_CLASS ? "アドレス" : "番号"}</th><th>進み具合</th><th>「本当？」と思った説</th><th>方法</th><th>来週の一歩</th><th>やる日</th><th>更新</th></tr></thead>
          <tbody>${rs.map(r => {
            const st = status(r), d = r.note?.data || {}, m = methodOf(d.ippo);
            return `<tr data-uid="${r.uid}" class="${st.stall ? "stall" : ""}">
              ${cls === TEST_CLASS ? `<td class="addr-cell">${escapeHtml(r.email || "")}</td>` : `<td class="num">${numCell(r)}</td>`}
              <td><span class="st ${st.cls}">${st.label}</span>${st.stall ? ` <span class="st st-stall">止まってる？</span>` : ""}</td>
              <td>${escapeHtml(d.setsu || "")}</td>
              <td class="nowrap">${m ? `<span class="mchip">${m}</span>` : ""}</td>
              <td>${escapeHtml(d.ippo || "")}</td>
              <td class="nowrap">${escapeHtml(d.ippoDate || "")}</td>
              <td class="nowrap">${fmtTime(r.note?.updatedAt)}</td></tr>`;
          }).join("")}</tbody></table></div>`;
      app.querySelectorAll("tr[data-uid]").forEach(tr => tr.onclick = () => showDetail(tr.dataset.uid));
    }

    const box = document.getElementById("missing");
    if (cls === TEST_CLASS) { box.innerHTML = ""; return; }
    const have = new Set(rs.map(r => r.number));
    const miss = Array.from({ length: MAX_NUMBER }, (_, i) => i + 1).filter(n => !have.has(n));
    box.innerHTML = miss.length ? `<b>まだログインしていない番号：</b>${miss.join("、")}` : `<b>全員ログインしています ✓</b>`;
    const dup = rs.map(r => r.number).filter((n, i, a) => a.indexOf(n) !== i);
    if (dup.length) box.innerHTML += `<p class="error">番号が重なっています：${[...new Set(dup)].join("、")}番（入力ミスの可能性）</p>`;
  }

  function showDetail(uid) {
    const r = rows().find(x => x.uid === uid); if (!r) return;
    const d = r.note?.data || {};
    const item = (k, label) => `<div class="tc-row"><span>${label}</span><b>${escapeHtml(d[k] || "—")}</b></div>`;
    const link = safeUrl(d.geminiLink);
    const first = d.route === "B"
      ? `<div class="tc-row"><span>入口</span><b>テーマの例から選んだ</b></div>${item("theme", "テーマの例")}${item("themeWhere", "どこが少し気になった？")}`
      : `${item("odai1", "時間が溶けたもの")}${item("odai2", "語りだすと止まらないもの")}${item("odai3", "最近モヤっとしたこと")}`;
    dlg.innerHTML = `
      <div class="dlg">
        <div class="dlg-head"><h3>${r.class === TEST_CLASS ? "テスト" : `${kiLabel(r.ki)} ${classLabel(r.class)} ${r.number}番`}</h3><button class="btn ghost small" id="close">閉じる</button></div>
        <p class="hint">${escapeHtml(r.email || "")}</p>
        <div class="themecard">
          ${first}
          <div class="tc-row"><span>気になったキーワード</span><b>${escapeHtml(["kw1", "kw2", "kw3"].map(k => d[k]).filter(Boolean).join("・") || "—")}</b></div>
          ${item("setsu", "「えっ、本当？」と思った説")}${item("hikkakari", "ひっかかったところ")}
          <div class="tc-row"><span>来週までにやる一歩（方法：${escapeHtml(methodOf(d.ippo) || "—")}）</span><b>${escapeHtml(d.ippo || "—")}</b></div>
          ${item("ippoDate", "やる日")}${item("yosou", "予想")}
          <div class="tc-row"><span>Geminiのチャット</span><b>${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener">開く ↗</a>` : escapeHtml(d.geminiLink || "—")}</b></div>
        </div>
      </div>`;
    dlg.showModal();
    document.getElementById("close").onclick = () => dlg.close();
  }

  const csvCell = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
  function downloadCsv() {
    const head = ["期", "クラス", "番号", "アドレス", "進み具合", "入口", "テーマの例", "どこが気になった", "時間が溶けたもの", "語りだすと止まらないもの", "モヤっとしたこと",
      "キーワード1", "キーワード2", "キーワード3", "本当？と思った説", "ひっかかったところ", "方法", "一歩", "やる日", "予想", "Geminiのリンク", "更新"];
    const lines = rows().map(r => {
      const d = r.note?.data || {};
      return [kiLabel(r.ki), classLabel(r.class), r.number || "", r.email, status(r).label, d.route === "B" ? "テーマの例" : "3つの質問",
        d.theme, d.themeWhere, d.odai1, d.odai2, d.odai3, d.kw1, d.kw2, d.kw3, d.setsu, d.hikkakari, methodOf(d.ippo), d.ippo, d.ippoDate, d.yosou, d.geminiLink,
        r.note?.updatedAt?.toLocaleString("ja-JP") || ""].map(csvCell).join(",");
    });
    const blob = new Blob(["﻿" + [head.map(csvCell).join(","), ...lines].join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = cls === TEST_CLASS ? `${LESSON}_テスト.csv` : `${LESSON}_${kiLabel(ki)}_${classLabel(cls)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function watch() {
    unwatch?.();
    students = []; notes = []; renderTable();
    if (be.demo) { [students, notes] = demoData(); renderTable(); return; }
    unwatch = be.watchGroup({ ki, cls }, LESSON,
      s => { students = s; renderTable(); },
      n => { notes = n; renderTable(); },
      e => {
        console.error(e);
        const t = document.getElementById("table");
        if (t) t.innerHTML = `<p class="error">読み込めません（権限エラー）。先生のアカウント（@soka.ed.jp）か、Firestoreのルールが最新か確認してください。</p>`;
      });
  }

  // デモ用の架空データ（実在の生徒ではありません）
  function demoData() {
    const ex = [
      ["完全に静かな部屋よりも、適度な雑音がある場所の方が没頭しやすい", "【やってみる】無音と、カフェの雑音を流したときで、15分ずつ同じ問題を解いて比べる"],
      ["画面を白黒にするだけで、スマホを見る時間が激減する", "【測る】3日はいつもどおり、3日は白黒にして、スクリーンタイムを記録する"],
      ["ご褒美をあげると、かえってやる気が下がることがある", "【聞く】部活の友だち3人に、ご褒美があるとやる気が上がるか下がるかを聞く"],
      ["夢中になりやすいのは、少し難しいくらいの課題", "【見に行く】昼休みの図書館で、集中している人がどんな席を選んでいるか見る"],
      ["", ""]
    ];
    const st = [], nt = [];
    const n = cls === TEST_CLASS ? 3 : 30;
    for (let i = 1; i <= n; i++) {
      const uid = "u" + i, e = ex[(i * 3) % ex.length], step = i % 5;
      st.push(cls === TEST_CLASS
        ? { uid, ki: "", class: 0, number: i === 1 ? 0 : i, email: i === 1 ? "demo.teacher@soka.ed.jp" : `test${i}@example` }
        : { uid, ki, class: cls, number: i, email: `${ki}student${i}@example` });
      if (i % 7 === 0) continue;
      nt.push({ uid, step, submitted: step === 4 && i % 2 === 0, updatedAt: new Date(Date.now() - (i % 9) * 60000),
        data: { setsu: step >= 2 ? e[0] : "", hikkakari: step >= 2 ? "本当に？" : "", ippo: step >= 3 ? e[1] : "", ippoDate: step >= 3 ? "2026-11-05" : "", yosou: step >= 3 ? "（予想の例）" : "",
          kw1: "集中", route: i % 6 === 0 ? "B" : "A", theme: i % 6 === 0 ? "「SNS」に対して、私たちはどう向き合っていくか？" : "" } });
    }
    return [st, nt];
  }

  renderShell(); watch();
  const tick = setInterval(renderTable, 30000); // 「止まってる？」表示を30秒ごとに更新
  return () => { unwatch?.(); clearInterval(tick); if (dlg.open) dlg.close(); };
}

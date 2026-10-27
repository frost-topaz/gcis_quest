// 共通：Firebase の読み込み・ログイン・保存（デモモードあり）
import { firebaseConfig } from "./firebase-config.js";

export const STUDENT_DOMAIN = "tokyo.soka.ed.jp"; // 生徒
export const TEACHER_DOMAIN = "soka.ed.jp";       // 教員（@tokyo.soka.ed.jp は含まない）
export const CLASSES = [1, 2, 3, 4, 5, 6, 7, 8];
export const MAX_NUMBER = 41;
export const TEST_CLASS = 0; // 動作確認用（教員画面では「テスト」と表示）
export const GEMINI_URL = "https://gemini.google.com/app";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

export const isDemo = new URLSearchParams(location.search).has("demo");
export const configReady = !Object.values(firebaseConfig).some(v => String(v).includes("ここに"));

export function hasDomain(email, domain) {
  return String(email || "").toLowerCase().endsWith("@" + domain);
}
export function roleOf(email) {
  if (hasDomain(email, STUDENT_DOMAIN)) return "student";
  if (hasDomain(email, TEACHER_DOMAIN)) return "teacher";
  return null;
}

// 期：アドレスの頭2桁（例：59…@tokyo.soka.ed.jp → "59"）。数字でなければ ""
export function kiOf(email) {
  const m = String(email || "").toLowerCase().match(/^([0-9]{2})/);
  return m ? m[1] : "";
}
// その年度の高校1年の期（2026年度＝59期）
export function firstYearKi(d = new Date()) {
  const fy = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return String(fy - 1967);
}
export function kiLabel(ki) { return ki ? `${ki}期` : "期なし"; }

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function classLabel(c) {
  return c === TEST_CLASS ? "テスト" : `${c}組`;
}

// 一歩の【方法】を読み取る（生徒が見出しごと貼ったとき）
export const METHODS = ["やってみる", "測る", "見に行く", "聞く"];
export function methodOf(ippo) {
  const s = String(ippo || "");
  if (!s.trim()) return "";
  const m = s.match(/[【\[［]\s*([^】\]］]{1,10}?)\s*[】\]］]/);
  const word = m ? m[1].trim() : "";
  if (METHODS.includes(word)) return word;
  const head = METHODS.find(x => s.trim().startsWith(x));
  if (head) return head;
  return word ? "その他" : "不明";
}

// Gemini を画面の右半分の別ウィンドウで開く。2回目以降は前に出すだけ（チャットを消さない）
// 戻り値："opened"（開いた）／"focused"（前に出した）／"lost"（開いたはずだが見つからない）／"blocked"
let geminiWin = null;
export function openGemini({ force = false } = {}) {
  if (geminiWin && !geminiWin.closed) { geminiWin.focus(); return "focused"; }
  let opened = false;
  try { opened = sessionStorage.getItem("gcis_gemini") === "1"; } catch { /* なし */ }
  if (opened && !force) return "lost"; // 新しく開くとチャットが分かれるので、先に戻ってもらう
  const W = screen.availWidth || 1366, H = screen.availHeight || 768;
  const feat = `popup=yes,left=${Math.round(W / 2)},top=0,width=${Math.round(W / 2)},height=${H}`;
  const w = window.open(GEMINI_URL, "gcis_gemini", feat) || window.open(GEMINI_URL, "_blank");
  if (!w) return "blocked";
  geminiWin = w;
  try { sessionStorage.setItem("gcis_gemini", "1"); } catch { /* なし */ }
  try { w.focus(); } catch { /* なし */ }
  return "opened";
}

export function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* 保存できなくても動く */ } }

// ---------- バックエンド（本番：Firebase / デモ：メモリ） ----------
export async function createBackend() {
  if (isDemo) return demoBackend();
  const [{ initializeApp }, authMod, fs] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-firestore.js")
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = fs.getFirestore(app);
  const toDate = x => x?.toDate?.() || null;

  return {
    demo: false,
    onUser(cb) { return authMod.onAuthStateChanged(auth, cb); },
    async signIn() {
      const provider = new authMod.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      return authMod.signInWithPopup(auth, provider);
    },
    signOut() { return authMod.signOut(auth); },
    async getProfile(uid) {
      const s = await fs.getDoc(fs.doc(db, "students", uid));
      return s.exists() ? s.data() : null;
    },
    async saveProfile(uid, p, isNew) {
      const data = { email: p.email, ki: p.ki, class: p.class, number: p.number, updatedAt: fs.serverTimestamp() };
      if (isNew) data.createdAt = fs.serverTimestamp();
      await fs.setDoc(fs.doc(db, "students", uid), data, { merge: true });
    },
    async getNote(uid, lesson) {
      const s = await fs.getDoc(fs.doc(db, "notes", `${uid}_${lesson}`));
      return s.exists() ? s.data() : null;
    },
    async saveNote(uid, lesson, p, note, markSubmitted = false) {
      const data = {
        uid, lesson, ki: p.ki, class: p.class, number: p.number,
        step: note.step, submitted: !!note.submitted,
        data: note.data, updatedAt: fs.serverTimestamp()
      };
      if (markSubmitted) data.submittedAt = fs.serverTimestamp();
      await fs.setDoc(fs.doc(db, "notes", `${uid}_${lesson}`), data, { merge: true });
    },
    // 教員用：1つの期・クラス（テストは期を問わない）をリアルタイムで受け取る
    watchGroup({ ki, cls }, lesson, onStudents, onNotes, onError) {
      const sw = [fs.where("class", "==", cls)];
      const nw = [fs.where("lesson", "==", lesson), fs.where("class", "==", cls)];
      if (cls !== TEST_CLASS) { sw.push(fs.where("ki", "==", ki)); nw.push(fs.where("ki", "==", ki)); }
      const u1 = fs.onSnapshot(fs.query(fs.collection(db, "students"), ...sw),
        snap => onStudents(snap.docs.map(d => ({ uid: d.id, ...d.data() }))), onError);
      const u2 = fs.onSnapshot(fs.query(fs.collection(db, "notes"), ...nw),
        snap => onNotes(snap.docs.map(d => ({ id: d.id, ...d.data(), updatedAt: toDate(d.data().updatedAt) }))), onError);
      return () => { u1(); u2(); };
    }
  };
}

// デモ：メモリだけ。生徒役と教員役を切り替えて試せる（入力は保存されない）
function demoBackend() {
  let user = null;
  const profiles = {}, notes = {};
  let listener = () => {};
  return {
    demo: true,
    onUser(cb) { listener = cb; cb(user); return () => {}; },
    async signIn(as = "student") {
      user = as === "teacher"
        ? { uid: "demo-t", email: "demo.teacher@" + TEACHER_DOMAIN }
        : { uid: "demo-s", email: firstYearKi() + "demo@" + STUDENT_DOMAIN };
      listener(user);
    },
    async signOut() { user = null; listener(null); },
    async getProfile(uid) { return profiles[uid] || null; },
    async saveProfile(uid, p) { profiles[uid] = { ...p }; },
    async getNote(uid, lesson) { return notes[uid + lesson] ? JSON.parse(JSON.stringify(notes[uid + lesson])) : null; },
    async saveNote(uid, lesson, p, note) { notes[uid + lesson] = JSON.parse(JSON.stringify(note)); },
    watchGroup() { return () => {}; }
  };
}

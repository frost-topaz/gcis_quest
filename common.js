// 共通：Firebase の読み込み・ログイン・保存（デモモードあり）
import { firebaseConfig } from "./firebase-config.js";

export const STUDENT_DOMAIN = "tokyo.soka.ed.jp"; // 生徒
export const TEACHER_DOMAIN = "soka.ed.jp";       // 教員
export const CLASSES = [1, 2, 3, 4, 5, 6, 7, 8];
export const MAX_NUMBER = 41;
export const TEST_CLASS = 0; // 動作確認用（教員画面では「テスト」と表示）

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

export const isDemo = new URLSearchParams(location.search).has("demo");
export const configReady = !Object.values(firebaseConfig).some(v => String(v).includes("ここに"));

export function hasDomain(email, domain) {
  return String(email || "").toLowerCase().endsWith("@" + domain);
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function classLabel(c) {
  return c === TEST_CLASS ? "テスト" : `${c}組`;
}

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

  return {
    demo: false,
    onUser(cb) { return authMod.onAuthStateChanged(auth, cb); },
    async signIn(domain) {
      const provider = new authMod.GoogleAuthProvider();
      provider.setCustomParameters({ hd: domain, prompt: "select_account" });
      return authMod.signInWithPopup(auth, provider);
    },
    signOut() { return authMod.signOut(auth); },
    async getProfile(uid) {
      const s = await fs.getDoc(fs.doc(db, "students", uid));
      return s.exists() ? s.data() : null;
    },
    async saveProfile(uid, email, cls, number, isNew) {
      const data = { email, class: cls, number, updatedAt: fs.serverTimestamp() };
      if (isNew) data.createdAt = fs.serverTimestamp();
      await fs.setDoc(fs.doc(db, "students", uid), data, { merge: true });
    },
    async getNote(uid, lesson) {
      const s = await fs.getDoc(fs.doc(db, "notes", `${uid}_${lesson}`));
      return s.exists() ? s.data() : null;
    },
    async saveNote(uid, lesson, profile, note, markSubmitted = false) {
      const data = {
        uid, lesson, class: profile.class, number: profile.number,
        step: note.step, submitted: !!note.submitted,
        data: note.data, updatedAt: fs.serverTimestamp()
      };
      if (markSubmitted) data.submittedAt = fs.serverTimestamp();
      await fs.setDoc(fs.doc(db, "notes", `${uid}_${lesson}`), data, { merge: true });
    },
    // 教員用：クラスの生徒とノートをリアルタイムで受け取る
    watchClass(cls, lesson, onStudents, onNotes, onError) {
      const u1 = fs.onSnapshot(
        fs.query(fs.collection(db, "students"), fs.where("class", "==", cls)),
        snap => onStudents(snap.docs.map(d => ({ uid: d.id, ...d.data() }))), onError);
      const u2 = fs.onSnapshot(
        fs.query(fs.collection(db, "notes"), fs.where("lesson", "==", lesson), fs.where("class", "==", cls)),
        snap => onNotes(snap.docs.map(d => ({ id: d.id, ...d.data(), updatedAt: d.data().updatedAt?.toDate?.() || null }))), onError);
      return () => { u1(); u2(); };
    }
  };
}

function demoBackend() {
  let user = null, profile = null;
  const notes = {};
  let listener = () => {};
  return {
    demo: true,
    onUser(cb) { listener = cb; cb(user); return () => {}; },
    async signIn(domain = STUDENT_DOMAIN) { user = { uid: "demo", email: "demo@" + domain }; listener(user); },
    async signOut() { user = null; profile = null; listener(null); },
    async getProfile() { return profile; },
    async saveProfile(uid, email, cls, number) { profile = { email, class: cls, number }; },
    async getNote(uid, lesson) { return notes[lesson] || null; },
    async saveNote(uid, lesson, p, note) { notes[lesson] = JSON.parse(JSON.stringify(note)); },
    watchClass() { return () => {}; }
  };
}

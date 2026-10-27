# 探究ノート（GCIS 個人探究）

GCIS（Global Citizenship Inquiry Studies）の個人探究で使う、生徒用の探究ノートアプリです。

- 入口は1つ：`index.html`。ログインしたアドレスで振り分けます（@tokyo.soka.ed.jp → 生徒画面、@soka.ed.jp → 教員画面）
- 教員は右上の「生徒画面へ／教員画面へ」で切り替え。生徒画面での入力は「テスト」として保存されます
- `teacher.html` はトップへ移動するだけのページです（古いブックマーク用）
- 動きだけ見る：URLの最後に `?demo` をつける（保存されません。生徒役・教員役を選べます。教員画面のデータは架空）

## ファイルの役割（フォルダは使わず、すべてこの階層に置く）
| ファイル | 役割 |
|---|---|
| `index.html` / `app.js` | 入口（ログインと振り分け） |
| `student.js` | 生徒画面 |
| `teacher.js` | 教員画面 |
| `teacher.html` | トップへ移動するだけ |
| `common.js` | 共通（ログイン・保存・ドメインの設定） |
| `themes.js` | テーマの例（入口B）。年度が変わったら差し替える |
| `style.css` | 見た目 |
| `firebase-config.js` | Firebase の設定（先生が一度だけ書き換える。更新用の zip には入らない） |
| `firestore.rules` | アクセスのルール（Firebase コンソールに貼る控え） |

## 初回だけの設定
1. `firebase-config.js` を GitHub 上で開き、鉛筆マークで編集。Firebase の `firebaseConfig` の値を貼って保存
2. Firebase コンソール → Firestore Database → ルール に `firestore.rules` の全文を貼って「公開」
3. Settings → Pages → Branch を `main` / `(root)` にして Save
4. Firebase コンソール → Authentication → 設定 → 承認済みドメイン に `frost-topaz.github.io` があることを確認

## 更新のしかた
1. Claude から届いたファイルを「Add file → Upload files」にドラッグ
2. コミット画面で「Create a new branch」を選んで Propose changes → PR を作ってマージ
3. 「テスト」クラスで動作確認。問題があれば、その PR の「Revert」で元に戻す
- 授業のある月曜日には更新しない
- ファイルを減らすときは、Claude が削除するファイル名を伝える（アップロードでは消えないため）

## データ（Firestore）
- `students/{uid}`：email・ki（期＝アドレスの頭2桁、数字でなければ空）・class（0〜8、0はテスト）・number（教員のテストは0）・createdAt・updatedAt
- `notes/{uid}_L01`：uid・lesson・ki・class・number・step（0〜4）・submitted・data（入力内容）・updatedAt・submittedAt
- data（L01）：route（A＝3つの質問／B＝テーマの例）・odai1〜3・theme・themeWhere・kw1〜3・setsu（説）・hikkakari（ひっかかり）・ippo・ippoDate・yosou・geminiLink
- 生徒は自分のデータだけ、教員は全員のデータを読める。教員が書けるのは自分の「テスト」だけ。

生徒の個人データはこのリポジトリには置きません（Firebase にだけ保存されます）。

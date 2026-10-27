# 探究ノート（GCIS 個人探究）

GCIS（Global Citizenship Inquiry Studies）の個人探究で使う、生徒用の探究ノートアプリです。

- 生徒画面：`index.html`（@tokyo.soka.ed.jp でログイン）
- 教員画面：`teacher.html`（@soka.ed.jp でログイン）
- 動きだけ見る：URLの最後に `?demo` をつける（保存されません。教員画面のデモは架空のデータ）

## 初回だけの設定
1. `js/firebase-config.js` を GitHub 上で開き、鉛筆マークで編集。Firebase の `firebaseConfig` の値を貼って保存
2. Firebase コンソール → Firestore Database → ルール に `firestore.rules` の全文を貼って「公開」
3. Settings → Pages → Branch を `main` / `(root)` にして Save
4. Firebase コンソール → Authentication → 設定 → 承認済みドメイン に `frost-topaz.github.io` があることを確認

## 更新のしかた
Claude から届く zip を展開し、「Add file → Upload files」で中身を上書きアップロード。
`js/firebase-config.js` は次回以降の zip には入りません。

## データ（Firestore）
- `students/{uid}`：email・class（0〜8、0は動作確認用）・number・createdAt・updatedAt
- `notes/{uid}_L01`：uid・lesson・class・number・step（0〜4）・submitted・data（入力内容）・updatedAt・submittedAt
- 生徒は自分のデータだけ、教員は全員のデータを読める。教員は書き込みできない。

生徒の個人データはこのリポジトリには置きません（Firebase にだけ保存されます）。

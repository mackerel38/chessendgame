# ENDGAME / 終盤道場

日本語のチェス終盤トレーニングアプリ。3駒の5局面から勝ち・引き分けを練習します。

## 実行

```sh
npm install
npm run dev
```

## 検証

```sh
npm test
npx tsc --noEmit
npm run build
```

Node.js 22.13.0 以上が必要です。GitHub Pages 向けの静的ビルドに対応しています。

## GitHub Pages

```sh
npm run dev:pages
npm run build:pages
npm run preview:pages
```

`dist-pages/` にサーバー不要の静的ファイルを出力します。リポジトリの Settings → Pages → Source を GitHub Actions に設定すると、main への push で `.github/workflows/pages.yml` がテスト・ビルド・公開します。プロジェクトページのサブパスと独自ドメインは configure-pages の情報から自動で設定します。

ローカルでサブパスを検証する場合は `PAGES_BASE_PATH=/chessendgame npm run build:pages` を使います。`PAGES_SITE_URL` に HTTPS の公開先 URL を指定すると SNS 用の画像 URL も埋め込みます。

Pages 版はブラウザから Lichess API に直接問い合わせます。API の CORS 許可を確認済みで、API キーや独自のサーバーは不要です。

既存の `npm run dev` / `npm run build` は Sites 版のために残しています。

## 対局の仕様

- Lichess の Syzygy テーブルベース HTTP API で、初期局面と指し手ごとの評価・最善応手を取得します。インターネット接続が必要です。
- `moves[].category` は指した後の相手側の評価です。`loss` は指した側の勝ちです。
- 勝ちの練習では勝ちを、引き分けの練習では少なくとも引き分けを維持する手を受け入れます。悪化する手は盤面を進めず再考を促します。
- 不明・曖昧なカテゴリは正解として扱いません。接続エラー時は対局を止めて再接続できます。
- 相手は API が返す最善順の先頭の手を指します。手の合法性とチェックメイト・ステイルメイト・駒不足・50手ルール・3回の同一局面は chess.js が扱います。50手・同一局面3回の引き分けは練習上、自動成立とします。
- 昇格はクイーン・ルーク・ビショップ・ナイトから選びます。
- 達成した局面の ID のみ、この端末の localStorage に保存します。

## 構成

- `app/page.tsx`: 練習画面、棋譜、ヒント、局面選択
- `lib/trainer.ts`: 収録局面・評価・終局判定
- `app/api/tablebase/route.ts`: 局面検証、タイムアウト、キャッシュ付き API 接続
- `tests/trainer.test.ts`: 評価の向き、引き分け、昇格、合法な初期局面を検証

API 仕様: https://github.com/lichess-org/lila-tablebase

5局面すべてで最善手の連続による目標到達を API 経由で確認しました。ブラウザの操作テストは実施していません。

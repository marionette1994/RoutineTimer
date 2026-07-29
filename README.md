# 律帖 — ルーチンタイマー

## 設置

**フォルダごと**アップロードしてください。単一ファイルではなくなりました。

```
routine-timer/
├── index.html
├── app.js                  ← 事前コンパイル済み（Babel不要）
├── sw.js                   ← オフライン用
├── manifest.json
├── icon.svg
└── vendor/
    ├── react.production.min.js
    └── react-dom.production.min.js
```

GitHub Pages に置いたら、Chrome で開いて **メニュー → ホーム画面に追加**。
2回目以降はオフラインでも起動します（Service Worker は https でのみ有効）。

## 更新するとき

`sw.js` の `CACHE = 'ritcho-v5'` の数字を上げてください。
上げないと古いキャッシュが残り続けます。

新しい版を検出すると、一覧の先頭に「新しい版があります」と出ます。
**実行中は勝手に切り替わりません。** 更新ボタンを押したときだけ差し替わります。

## データ

- 保存先は端末内（localStorage）
- 設定 → バックアップ → 書き出す で、ルーチン・実施ログ・設定を1ファイルに保存
- 30日書き出していないと一覧の先頭に警告が出ます

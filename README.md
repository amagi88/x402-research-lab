# x402 Research Lab

WSL: `/home/shunya/projects/x402-research-lab`

最新会話（3か月でx402実装・MCP接続・外部成果）に基づく練習環境。完成品の仕様は `docs/ASSIGNMENT.md`。

## WSLで直接実行（検証済みの構成）

Node.js 24.14以降を使用します。nvmを使う場合は `nvm use` でバージョンを選択できます。

```bash
cd ~/projects/x402-research-lab
npm install
npm run dev
# 別ターミナルで
npm run client
npm run typecheck
npm run check:sdk
```

停止はサーバーのターミナルでCtrl+C。

## Dockerで実行（エンジン復旧後の代替）

Docker Desktop起動・WSL integration有効の状態で:

```bash
cd ~/projects/x402-research-lab
docker compose up -d --build
curl -fsS http://localhost:4021/health
docker compose run --rm client
docker compose exec server npm run typecheck
docker compose exec server npm run check:sdk
docker compose logs -f server
docker compose stop
```

ソース変更はwatchで反映。依存はpackage-lock.jsonで固定。ホストへのnpmは不要。

現状: Express起動、SDK導入、ClientのHTTP接続のみ。`/research`の501は正常な未実装表示。402・署名・決済・調査・MCPは課題として残している。秘密鍵・faucet資金なしで環境検証できる。

`.env.example`は将来の設定項目の見本。現段階では読み込まない。決済課題の実装時に必要なプロセスへ必要な値だけ渡す。購入者の秘密鍵はResource Serverへ渡さない。

以前の `~/projects/reward-service` とDBボリュームは保存。今回はDB/Worker不要。必要になったら履歴・冪等性・復旧のために追加する。

公式資料:
- https://docs.x402.org/getting-started/quickstart-for-sellers
- https://docs.x402.org/getting-started/quickstart-for-buyers
- https://github.com/x402-foundation/x402

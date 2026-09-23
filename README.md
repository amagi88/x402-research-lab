# Web3 Transaction Diagnosis Service

既存のAI AgentからMCP Tool `diagnose_transaction` を呼び出し、Base SepoliaのERC-20送金トランザクションを診断する練習プロジェクトです。完成時にはtxHashから取引状態、送金内容、失敗原因とその根拠、次の対応、開発者向け・顧客向けの説明を返します。x402によるテストUSDCの従量課金もMVPの対象です。画面は作りません。

実装範囲、順番、完了条件は [docs/TICKETS.md](docs/TICKETS.md) を参照してください。T-001のMCP Serverは動作確認済みです。次はT-002の入出力schemaとエラー形式を実装します。診断と決済は未実装です。

## WSLで起動

Node.js 24.14以上が必要です。nvmを使う場合は、先に使用するNode.jsを選択してください。

```bash
cd ~/projects/x402-research-lab
nvm use
npm ci
npm run dev
```

サーバーは `http://localhost:4021` で待ち受けます。停止するときは起動したターミナルでCtrl+Cを押します。

## 動作確認

以下は別のWSLターミナルで実行します。

```bash
cd ~/projects/x402-research-lab
nvm use
npm run typecheck
curl -fsS http://localhost:4021/health
```

`/health` が `OK` を返したら、MCP Toolの一覧を確認します。

```bash
curl -sS -X POST http://localhost:4021/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

応答の `data:` 行に `diagnose_transaction` が含まれていれば登録できています。次にToolを呼びます。

```bash
curl -sS -X POST http://localhost:4021/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"diagnose_transaction","arguments":{"chainId":84532,"txHash":"0xabc"}}}'
```

現時点の応答は仮実装です。`0xabc` は動作確認用の短い文字列で、実在するtxHashではありません。成功・失敗の判定やオンチェーン調査は行いません。MCPの応答は `event: message` と `data: {...}` の形式で表示されます。`content[0].text` には、`status: "not_implemented"`、`txHash`、`chainId` を含むJSON文字列が返ります。

## Dockerを使う場合

Docker DesktopとWSL integrationが使える環境では、代わりに次の手順でサーバーを起動できます。

```bash
cd ~/projects/x402-research-lab
docker compose up -d --build server
curl -fsS http://localhost:4021/health
docker compose exec server npm run typecheck
docker compose down
```

`src/client.ts`、`src/mcp.ts`、`/research` は旧ウォレット調査用のコードです。現行の診断Toolの動作確認には上記の `/mcp` を使います。

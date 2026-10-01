# Web3 Transaction Diagnosis Service

既存のAI AgentからMCP Tool `diagnose_transaction` を呼び出し、Base SepoliaのERC-20送金トランザクションを診断する練習プロジェクトです。完成時にはtxHashから取引状態、送金内容、失敗原因とその根拠、次の対応、開発者向け・顧客向けの説明を返します。x402によるテストUSDCの従量課金もMVPの対象です。画面は作りません。

実装範囲、順番、完了条件は [docs/TICKETS.md](docs/TICKETS.md) を参照してください。T-001のMCP ServerとT-002のschemaは実装済みです。T-003のRPC取得層はMCP Toolへ接続済みです。ERC-20送金内容と失敗原因の解析、決済は未実装です。

## WSLで起動

Node.js 24.14以上が必要です。nvmを使う場合は、先に使用するNode.jsを選択してください。

```bash
cd ~/projects/x402-research-lab
nvm use
npm ci
cp .env.example .env
# .envのBASE_SEPOLIA_RPC_URLにAlchemyの実際のAPIキーを設定する
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
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"diagnose_transaction","arguments":{"chainId":84532,"txHash":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}}'
```

例の64桁のtxHashは入力形式の確認用で、実在する取引ではありません。MCPの応答は `event: message` と `data: {...}` の形式です。`content[0].text` はT-002のJSON形式で、取引が見つからないときは `status: "not_found"`、Receiptがないときは `"pending"`、Receiptがあるときは実行結果に応じて `"success"` または `"failed"` を返します。`success`はトークン移動の確認を意味しません。短い`0xabc`を渡すと入力検証エラーになり、RPC障害は `RPC_UNAVAILABLE` になります。

## Alchemy接続とT-003の検証

Alchemy DashboardでBase SepoliaのNode API用HTTPS endpointを取得します。`.env.example`をコピーして`.env`を作り、`BASE_SEPOLIA_RPC_URL`の`<API_KEY>`を自分のキーに置き換えてください。`.env`はGit管理対象外です。公開RPCのURLは設定例のみで、自動切替先にはなりません。

通常の単体テストとMSWでAlchemyのJSON-RPCを差し替える結合テストには、APIキーも外部ネットワーク接続も不要です。結合テストはMCP Toolから実際のController、UseCase、Repositoryを通します。

```bash
npm run typecheck
npm test
```

T-003の内部処理は`createGetTxInformationController().handle({ txHash, chainId: 84532 })`から呼び出せます。MCP Serverはこの処理を呼び、bigintを含む内部データからT-002のJSON応答を作ります。

処理は次の責務で分けています。

| 層          | 担当                                                        |
| ----------- | ----------------------------------------------------------- |
| Controller  | 入力schemaの検証、UseCaseの呼び出し、既存Toolエラーへの変換 |
| UseCase     | chainId照合、取得手順、データ整合性、補助情報欠落の扱い     |
| Repository  | AlchemyClientの呼び出し、viem例外の変換、内部データへの変換 |
| Domain      | SDKに依存しないデータ型とRepositoryのインターフェース       |
| Composition | 環境変数の読み取り、各クラスの生成と接続                    |

呼び出しは`Controller → UseCase → Repository → AlchemyClient`です。UseCaseはDomainのRepositoryインターフェースに依存し、テストではモックを渡せます。完成済みのAlchemyClientはTransactionとReceiptの取得に使い、chainId・Block・現在Block番号は同じURLで生成したRPCクライアントから取得します。`availability: confirmed`はReceiptの取得を表し、finalityや送金成功を保証する値ではありません。

現時点ではReceiptから取引の実行状態までを返します。ERC-20の送金内容、revert data、説明の詳細化は後続チケットで実装します。

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

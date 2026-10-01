# Web3 Transaction Diagnosis Service

既存のAI AgentからMCP Tool `diagnose_transaction` を呼び出し、Base SepoliaのERC-20送金トランザクションを診断する練習プロジェクトです。完成時にはtxHashから取引状態、送金内容、失敗原因とその根拠、次の対応、開発者向け・顧客向けの説明を返します。x402によるテストUSDCの従量課金もMVPの対象です。画面は作りません。

実装範囲、順番、完了条件は [docs/TICKETS.md](docs/TICKETS.md) を参照してください。T-001のMCP ServerとT-002のschemaは実装済みです。T-003のRPC取得層は実装されていますが、実Alchemy接続は利用者のAPIキーと既知のtxHashで確認してください。MCPの診断応答と決済は未実装です。

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
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"diagnose_transaction","arguments":{"chainId":84532,"txHash":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}}'
```

現時点の応答は仮実装です。例の64桁のtxHashは入力形式の確認用で、実在する取引とは限りません。成功・失敗の判定やオンチェーン調査は行いません。MCPの応答は `event: message` と `data: {...}` の形式で表示されます。`content[0].text` には、`status: "not_implemented"`、`txHash`、`chainId` を含むJSON文字列が返ります。短い`0xabc`を渡すと、入力検証エラーになります。

## Alchemy接続とT-003の検証

Alchemy DashboardでBase SepoliaのNode API用HTTPS endpointを取得します。`.env.example`をコピーして`.env`を作り、`BASE_SEPOLIA_RPC_URL`の`<API_KEY>`を自分のキーに置き換えてください。`.env`はGit管理対象外です。公開RPCのURLは設定例のみで、自動切替先にはなりません。

通常の単体テストと型チェックにはAPIキーは不要です。

```bash
npm run typecheck
npm test
```

実接続テストでは、`.env`の`BASE_SEPOLIA_TEST_TX_HASH`に**Base Sepoliaで確定済み**の実在するtxHashを設定し、次を実行します。テストはchainId、Transaction、Receiptを確認します。APIキーやRPC URLをテスト出力へ表示しません。

```bash
RUN_ALCHEMY_INTEGRATION=1 node --env-file=.env ./node_modules/jest/bin/jest.js --runInBand --runTestsByPath test/alchemy.integration.test.ts
```

T-003の入口は`createGetTxInformationController().handle({ txHash, chainId: 84532 })`です。組み立て用の関数を`src/composition/createGetTxInformationController.ts`からimportします。戻り値はbigintを含む内部データで、診断Toolの最終的なJSON応答への変換はT-004以降で実装します。

処理は次の責務で分けています。

| 層          | 担当                                                        |
| ----------- | ----------------------------------------------------------- |
| Controller  | 入力schemaの検証、UseCaseの呼び出し、既存Toolエラーへの変換 |
| UseCase     | chainId照合、取得手順、データ整合性、補助情報欠落の扱い     |
| Repository  | AlchemyClientの呼び出し、viem例外の変換、内部データへの変換 |
| Domain      | SDKに依存しないデータ型とRepositoryのインターフェース       |
| Composition | 環境変数の読み取り、各クラスの生成と接続                    |

呼び出しは`Controller → UseCase → Repository → AlchemyClient`です。UseCaseはDomainのRepositoryインターフェースに依存し、テストではモックを渡せます。完成済みのAlchemyClientはTransactionとReceiptの取得に使い、chainId・Block・現在Block番号は同じURLで生成したRPCクライアントから取得します。`availability: confirmed`はReceiptの取得を表し、finalityや送金成功を保証する値ではありません。

MCP Toolの応答は引き続き仮実装で、T-004以降にこのControllerと接続します。

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

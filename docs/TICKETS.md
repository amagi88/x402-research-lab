# Web3 Transaction Diagnosis Service — MVPチケット

最終更新: 2026-09-17  
対象: `/home/shunya/projects/x402-research-lab`

## このファイルの使い方

このファイルは、人間が実装順序、現在地、完了条件を確認するための作業一覧です。上から順番に進め、着手時と完了時にステータスを更新します。

- `[ ]` 未着手
- `[-]` 対応中
- `[x]` 完了
- `[!]` ブロック中

完了条件をすべて満たすまで、チケットを完了にしません。実装中に要件を変更した場合は、コードとこのファイルを一緒に更新します。

## 作るもの

Base Sepolia上のERC-20送金Transactionを診断する、有料MCP Toolを作ります。既存AI AgentがToolを呼び出し、x402でテストUSDCを支払い、次の結果を取得します。

- Transactionの状態
- ERC-20送金内容
- 判明した失敗原因と確度
- 診断根拠と推奨対応
- 開発者向けの技術説明
- 顧客向けの平易な説明

独自フロントエンドは作りません。

## MVPで固定する事項

| 項目             | MVPの決定                            |
| ---------------- | ------------------------------------ |
| MCP Tool名       | `diagnose_transaction`               |
| 診断対象チェーン | Base Sepolia (`eip155:84532`)        |
| 診断対象         | ERC-20 `transfer` / `transferFrom`   |
| 支払い方式       | x402 v2 `exact`                      |
| 支払い通貨       | Base SepoliaのテストUSDC             |
| 価格             | 1診断あたり0.01 USDC相当             |
| MCP接続          | Streamable HTTP                      |
| 診断時間         | 通常時60秒以内                       |
| 原因の確度       | `confirmed` / `probable` / `unknown` |
| データ保存       | なし                                 |

### 課金境界

- MCPの入力schemaに違反する呼び出しと未対応chainIdは、支払い前に拒否します。
- schemaが正しく、対応chainIdへの診断を開始した呼び出しは1回の診断として扱います。
- `not_found`、`pending`、未対応Transaction種別も診断結果に含みます。
- Facilitator障害、RPC障害、内部エラーで診断結果を生成できなかった場合は、有料結果を返しません。
- 支払い結果が不明なタイムアウトでは、自動的に新しい支払いを作って再試行しません。

## MVP対象外

- 独自Web画面
- Mainnet決済
- マルチチェーン診断
- DEX、NFT、Bridgeの意味解析
- 独自Facilitator、Wallet、Smart Contract
- 診断履歴や請求情報を保存するDB
- Transactionの再送、キャンセル、置換
- AIによる根拠のない原因推測
- 顧客への自動送信

## 全体の完了条件

- [ ] 既存AI Agentから`diagnose_transaction`を呼び出せる
- [ ] 未払い呼び出しにx402の支払い要求が返る
- [ ] x402 Clientが支払い条件と利用上限を検査してから署名する
- [ ] Base SepoliaのテストUSDCで決済できる
- [ ] 決済完了後だけ診断結果を取得できる
- [ ] 成功・失敗・未確定・不存在・診断不能を区別できる
- [ ] ERC-20の送信元、送信先、token、数量を解析できる
- [ ] 事実、推測、特定不能を区別できる
- [ ] 開発者向け説明と顧客向け説明に矛盾がない
- [ ] 診断と決済の正常系・異常系テストが通る
- [ ] 秘密鍵やPayment SignatureをログやGitへ保存しない

## 推奨実装順

```text
T-001 → T-002 → T-003 → T-004 → T-005 → T-006 → T-007
                                                    ↓
                                                  T-008 → T-009 → T-010
                                                                      ↓
                                                                    T-011 → T-012 → T-013
```

診断機能を無料状態で完成させてから、同じToolをx402で保護します。x402は後回しの追加機能ではなく、MVPの必須部分です。

---

## [x] T-001: Transaction Diagnosis MCP Serverを起動する

**目的**  
現在の`/research`用scaffoldを、Transaction診断用MCP Serverへ置き換えます。

**作業内容**

- MCP ServerをStreamable HTTPで起動する
- MCP endpointを`/mcp`にする
- `diagnose_transaction` Toolを登録する
- 初期段階では固定の未実装レスポンスを返す
- `/health`で稼働状態を確認できるようにする
- READMEの旧ウォレット調査記述をTransaction診断へ更新する

**完了条件**

- [x] MCP Clientから接続できる
- [x] `tools/list`に`diagnose_transaction`が表示される
- [x] Toolを呼ぶと構造化された仮レスポンスが返る
- [x] `npm run typecheck`が成功する

**依存**: なし

---

## [ ] T-002: 入出力schemaとエラー形式を定義する

**目的**  
後続チケットが同じ契約に従って実装できるようにします。

**入力**

```json
{
  "chainId": 84532,
  "txHash": "0x..."
}
```

**作業内容**

- `chainId`を整数として検証する
- `txHash`を32 byteの16進数として検証する
- MVPでは`84532`以外を`UNSUPPORTED_CHAIN`として拒否する
- 診断結果のTypeScript型とZod schemaを作る
- エラーコード、メッセージ、再試行可否を統一する
- schema versionをレスポンスへ含める

**最低限のエラーコード**

- `INVALID_INPUT`
- `UNSUPPORTED_CHAIN`
- `TRANSACTION_NOT_FOUND`
- `RPC_UNAVAILABLE`
- `UNSUPPORTED_TRANSACTION_TYPE`
- `DIAGNOSIS_INDETERMINATE`
- `PAYMENT_REQUIRED`
- `PAYMENT_REJECTED`
- `PAYMENT_FAILED`

**完了条件**

- [ ] 不正なtxHashをRPCへ問い合わせる前に拒否できる
- [ ] 未対応chainIdをRPCへ問い合わせる前に拒否できる
- [ ] 正常結果とエラー結果のschema testが通る

**依存**: T-001

---

## [ ] T-003: Base SepoliaからTransaction情報を取得する

**目的**  
診断に必要なオンチェーンデータを取得します。

**作業内容**

- Base Sepolia用RPC Clientを作る
- Transaction、Receipt、Block、現在Block番号を取得する
- Event Logを内部モデルへ変換する
- RPC URLを環境変数から設定する
- timeoutを設定し、RPC障害をTransaction失敗と区別する

**完了条件**

- [ ] 実在するtxHashからTransactionとReceiptを取得できる
- [ ] Receiptがない場合に`pending`判定用の情報を返せる
- [ ] txHashが見つからない場合を識別できる
- [ ] timeout、rate limit、接続失敗を`RPC_UNAVAILABLE`として扱える
- [ ] RPC URLやcredentialをログへ出さない

**依存**: T-002

---

## [ ] T-004: Transactionの状態を判定する

**目的**  
Transactionのライフサイクルを一貫した状態へ分類します。

**判定状態**

- `pending`
- `success`
- `failed`
- `not_found`
- `unsupported`
- `indeterminate`

**作業内容**

- TransactionがありReceiptがない場合は`pending`とする
- Receipt statusから`success`と`failed`を判定する
- RPC障害時は`indeterminate`とする
- blockNumberとconfirmationsを返す
- 判定に使った事実をevidenceへ格納する

**完了条件**

- [ ] 各状態のunit testが通る
- [ ] `failed`と`indeterminate`を混同しない
- [ ] confirmationsを「finalized」と断定しない

**依存**: T-003

---

## [ ] T-005: ERC-20送金を解析する

**目的**  
誰から誰へ、どのtokenをいくら送ろうとしたかを構造化します。

**作業内容**

- `transfer(address,uint256)`と`transferFrom(address,address,uint256)`のcalldataをdecodeする
- `Transfer(address,address,uint256)` Eventをdecodeする
- tokenのname、symbol、decimalsをbest effortで取得する
- token metadataが取れなくてもatomic amountを保持する
- 大きな整数をJavaScriptの`number`へ変換しない
- calldata上の「意図」とEvent Log上の「実際の移動」を分ける

**完了条件**

- [ ] 成功した`transfer`と`transferFrom`を解析できる
- [ ] failed Transactionでもcalldataから試行内容を確認できる
- [ ] Event Logがない場合に送金成功と断定しない
- [ ] token metadata取得失敗が診断全体を失敗させない

**依存**: T-004

---

## [ ] T-006: 失敗原因と診断確度を判定する

**目的**  
確認できた事実と推測を分離し、原因不明を正しく返します。

**作業内容**

- Receipt statusによる実行失敗を`confirmed`とする
- RPCが対応する場合はrevert dataまたはtraceを取得する
- standardなrevert reasonとcustom errorをdecodeする
- シミュレーションで再現した原因を直接証拠と区別する
- gasUsedとgas limitだけでout-of-gasを断定しない
- 原因を取得できない場合は`unknown`とlimitationsを返す

**完了条件**

- [ ] 原因を取得できたfailed Transactionで根拠を返せる
- [ ] 原因を取得できない場合に`unknown`を返せる
- [ ] 推測を`confirmed`として返すテストケースがない

**依存**: T-005

---

## [ ] T-007: 推奨対応と2種類の説明を生成する

**目的**  
開発者の判断とサポート担当者の顧客案内を、同じ診断結果から支援します。

**作業内容**

- 診断コードごとの推奨対応ruleを作る
- developer explanationを決定論的なtemplateで作る
- customer explanationを平易な日本語のtemplateで作る
- 原因不明の場合は追加確認事項を提示する
- 二重送金の可能性がある再送を無条件に推奨しない
- 顧客説明に内部RPC、stack trace、秘密情報を含めない

**完了条件**

- [ ] 2種類の説明が同じ状態・原因を示している
- [ ] 推奨対応ごとに理由が付いている
- [ ] `unknown`時に断定表現を使用しない
- [ ] 顧客説明だけで現在の状態と次の行動が分かる

**依存**: T-006

---

## [ ] T-008: 無料版診断Toolのテストを完成させる

**目的**  
x402を追加する前に、商品本体であるTransaction診断を安定させます。

**作業内容**

- RPC Clientをmockしたunit testを作る
- 実Base Sepoliaを使うintegration testを分離する
- 成功、失敗、pending、not found、RPC障害を検証する
- ERC-20解析、確度、推奨対応、説明文を検証する
- fixture txHashと期待結果を文書化する
- 60秒以内の応答を確認する

**完了条件**

- [ ] unit testがネットワーク接続なしで再現できる
- [ ] integration testの実行方法がREADMEにある
- [ ] 定義済みの正常系・異常系がすべて通る
- [ ] レスポンスがT-002のschemaに一致する

**依存**: T-007

---

## [ ] T-009: diagnose_transactionをx402有料Toolにする

**目的**  
Transaction診断を、1回ごとに購入できるMCP Toolへ変えます。

**作業内容**

- `@x402/mcp`と必要なx402 packageを導入する
- 既存Facilitator ClientとBase Sepoliaの`exact` schemeを設定する
- 受取先addressを環境変数で設定する
- 価格を0.01 USDC相当に設定する
- Tool handlerをpayment wrapperで保護する
- 支払い検証前、settlement失敗時に有料結果を返さない

**完了条件**

- [ ] 未払い呼び出しに支払い要求が返る
- [ ] 不正な支払いを拒否できる
- [ ] 正しい支払い時だけ診断handlerが実行される
- [ ] settlement成功後だけ診断結果が返る
- [ ] Server側に購入者の秘密鍵が存在しない

**依存**: T-008

---

## [ ] T-010: Agent側のx402対応MCP Clientを作る

**目的**  
既存AI Agentが、許可された条件の診断だけを安全に購入できるようにします。

**作業内容**

- x402対応MCP Clientと購入者Wallet signerを構成する
- private keyを環境変数またはsecret storeから読む
- Tool名、Network、asset、価格、payTo、接続先をコードで検査する
- 1回上限0.01 USDC、セッション上限0.10 USDC、最大10回にする
- 支払い結果不明時の自動再購入を禁止する

**完了条件**

- [ ] 許可した支払いだけ署名できる
- [ ] 金額、Network、asset、payToの改ざんを拒否できる
- [ ] 11回目を署名前に拒否できる
- [ ] private keyとPayment Signatureがログへ出ない

**依存**: T-009

---

## [ ] T-011: Base Sepoliaでx402決済E2Eを通す

**目的**  
AgentのTool呼び出しから決済、診断結果取得までを実testnetで確認します。

**事前準備**

- 受取用EVM address
- 購入用の専用testnet Wallet
- 購入WalletのBase SepoliaテストUSDC
- 利用するFacilitator URL

**完了条件**

- [ ] 実testnet支払いを1回完了できる
- [ ] settlement Transaction hashまたは同等の証拠を確認できる
- [ ] Toolの診断結果をAgent側で受け取れる
- [ ] 支払額、asset、Network、受取先が設定と一致する
- [ ] 秘密鍵や再利用可能な署名を証拠へ残していない

**依存**: T-010

---

## [ ] T-012: x402異常系と再試行安全性をテストする

**目的**  
支払い失敗時の誤課金、無制限再試行、有料結果の漏えいを防ぎます。

**テストケース**

- 残高不足、不正署名、期限切れauthorization、authorization再利用
- 未許可Network、asset、payTo、価格
- Facilitator timeout、settlement失敗、Tool実行失敗
- 支払い後の応答timeout、セッション上限超過

**完了条件**

- [ ] 支払いエラーと診断エラーを区別できる
- [ ] settlement失敗時に診断結果を返さない
- [ ] timeout時に新しい支払いを自動作成しない
- [ ] 同じauthorizationのreplayが拒否される
- [ ] 異常系で秘密情報がログへ出ない

**依存**: T-011

---

## [ ] T-013: 既存AI Agentへ接続しMVPを受け入れ確認する

**目的**  
実際の利用者フローで、MVPが課題を解決できることを確認します。

**開発者シナリオ**

1. 開発者がAgentへchainとtxHashを渡す
2. Agentが有料Toolを呼び出す
3. 開発者が状態、根拠、原因、推奨対応を確認する

**サポートシナリオ**

1. サポート担当者が問い合わせ内容をAgentへ入力する
2. Agentが有料Toolを呼び出す
3. サポート担当者が顧客向け説明を確認する
4. 原因不明または技術対応が必要ならエンジニアへ引き継ぐ

**作業内容**

- 既存AI AgentへMCP接続設定を追加する
- Agent向けTool descriptionを調整する
- 2種類の利用シナリオを実行する
- setup、環境変数、起動、テスト手順をREADMEへ記載する
- 5分以内のデモ手順を作る

**完了条件**

- [ ] Agentとの会話から支払いと診断が完了する
- [ ] 開発者向け説明から判定根拠を確認できる
- [ ] 顧客向け説明から状態と次の行動を理解できる
- [ ] 原因不明時にエスカレーションを案内できる
- [ ] 新しい開発者がREADMEだけでローカル起動できる
- [ ] 「全体の完了条件」がすべてチェック済みである

**依存**: T-012

## 実装後に判断する事項

- Mainnetでの価格
- 対応チェーンの追加順
- BazaarへのTool登録
- 診断履歴の保存
- RPC Providerの有料契約
- trace対応Providerの選定
- 動的価格、batch settlement、subscription

## 参考資料

- x402 MCP公式ガイド: <https://github.com/x402-foundation/x402/blob/main/docs/guides/mcp-server-with-x402.md>
- x402 v2仕様: <https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md>
- x402公式リポジトリ: <https://github.com/x402-foundation/x402>

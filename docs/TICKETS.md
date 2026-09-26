# Web3 Transaction Diagnosis Service — MVPチケット

最終更新: 2026-09-27

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

## [x] T-002: 入出力schemaとエラー形式を定義する

**目的**  
後続チケットが同じ契約に従って実装できるようにします。ここでは「入力を拒否するエラー」「診断して判明した結果」「決済時のエラー」を区別します。T-002で形式とschemaを定義し、RPCやx402の実処理は後続チケットで実装します。

**入力**

```json
{
  "chainId": 84532,
  "txHash": "0x0000000000000000000000000000000000000000000000000000000000000000"
}
```

**入力検証の順序**

1. `McpServer.registerTool`のZod `inputSchema`で`chainId`をJSONの整数、`txHash`を`0x`に続く64桁の16進数として検証する。欠落、`null`、型違い、小数、短すぎるhash、16進数以外の文字、前後の空白はSDKが`isError: true`のTool結果として返す。16進数の英字は大文字・小文字の両方を許可する。
2. 入力形式が正しい場合だけTool内でchainIdを確認し、`84532`以外の整数は`UNSUPPORTED_CHAIN`とする。
3. どちらもRPC問い合わせ前に拒否する。x402導入時は支払い要求より前に同じ検証を実施し、無効な入力を課金しない。入力値や秘密情報を丸ごとログへ出さない。

**診断結果（Tool正常応答）の形式**

MCP `tools/call`の結果は`isError`なし、または`isError: false`にし、`content[0].text`に以下のJSON文字列を入れる。これは**形式を示す架空の成功例**であり、実在するTransactionの診断結果ではない。T-002ではこの契約のTypeScript型・Zod schema・schema testを作る。実データの取得と説明文の生成はT-003〜T-007で実装する。

```json
{
  "schemaVersion": "1",
  "chainId": 84532,
  "txHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "status": "success",
  "code": null,
  "blockNumber": 12345678,
  "confirmations": 3,
  "transfer": {
    "method": "transfer",
    "tokenAddress": "0x3333333333333333333333333333333333333333",
    "symbol": "TKN",
    "decimals": 6,
    "intended": {
      "from": "0x1111111111111111111111111111111111111111",
      "to": "0x2222222222222222222222222222222222222222",
      "amountRaw": "1000000"
    },
    "observed": [
      {
        "from": "0x1111111111111111111111111111111111111111",
        "to": "0x2222222222222222222222222222222222222222",
        "amountRaw": "1000000"
      }
    ]
  },
  "failure": null,
  "evidence": [
    { "source": "receipt", "detail": "status=1" },
    { "source": "event_log", "detail": "Transferイベントを確認" }
  ],
  "limitations": [],
  "recommendedActions": [],
  "explanations": {
    "developer": "Receiptのstatusは1で、Transferイベントを確認しました。",
    "customer": "送金処理の成功を確認しました。"
  }
}
```

**フィールドの意味**

`null`は「この1つの値をまだ得られない、または該当しない」、`[]`は「一覧に入る項目が現時点で0件」を表す。フィールド自体を省略するのではなく、下表の規則に従って値を入れる。

| フィールド           | 何を表すか                                                   | 値がない場合・注意点                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`      | この診断結果のJSON形式の版                                   | 文字列の`"1"`で固定。MCP Serverのソフトウェア版とは別                                                                                                                                  |
| `chainId`            | 調べたチェーンの番号                                         | MVPではBase Sepoliaの`84532`                                                                                                                                                           |
| `txHash`             | 調べたTransactionの識別子                                    | 入力された`0x`＋64桁のhash。Walletアドレスとは別                                                                                                                                       |
| `status`             | Transactionについて現時点で判明した状態                      | `pending` / `success` / `failed` / `not_found` / `unsupported` / `indeterminate`。`success`はReceipt上の実行成功であり、トークン移動の確認とは別                                       |
| `code`               | 特別な結果をAgentが機械的に区別するための識別子              | 通常は`null`。`not_found`→`TRANSACTION_NOT_FOUND`、`unsupported`→`UNSUPPORTED_TRANSACTION_TYPE`、`indeterminate`→`DIAGNOSIS_INDETERMINATE`。`pending` / `success` / `failed`では`null` |
| `blockNumber`        | 取引が取り込まれたBlockの番号                                | 未採掘・未検出など、取得できなければ`null`                                                                                                                                             |
| `confirmations`      | 取引を含むBlock以降の確認数                                  | 未採掘・未検出なら`null`。得られた場合は非負の整数。数値だけでfinalizedとは断定しない                                                                                                  |
| `transfer`           | 対象のERC-20送金として読み取れた内容                         | 対象外または解析できなければ`null`。取引全体の成功と送金の実行は分けて見る                                                                                                             |
| `failure`            | 取引が失敗したときに分かった原因と、その確かさ               | `status: failed`以外は`null`。失敗が確定しても原因不明ならオブジェクトを残し、`reason: null`、`confidence: "unknown"`にする                                                            |
| `evidence`           | 判定に使ったオンチェーン情報やシミュレーション結果の一覧     | 材料がなければ`[]`。`simulation`は実際の実行を示す直接証拠ではない                                                                                                                     |
| `limitations`        | この診断で**まだ分からないこと・調査できなかった範囲**の一覧 | 不明点がなければ`[]`。空でも「すべて分かった」という保証ではない。Tool自体のエラーコードとは別                                                                                         |
| `recommendedActions` | 次に確認・対応するとよいことと、その理由の一覧               | 提案がなければ`[]`。空配列は「再送して安全」という意味ではない                                                                                                                         |
| `explanations`       | 同じ診断を、開発者向けと顧客向けに説明する文                 | `not_found`や`pending`でも、現時点の状態と次の確認事項を説明する                                                                                                                       |

`transfer`が`null`ではない場合の内訳は次のとおり。

| フィールド                      | 何を表すか                                                       | 値がない場合・注意点                                                                |
| ------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `transfer.method`               | 呼び出したERC-20関数                                             | `transfer`または`transferFrom`                                                      |
| `transfer.tokenAddress`         | 対象トークンのContractアドレス                                   | 送金先アドレスではない。`0x`＋40桁のアドレス                                        |
| `transfer.symbol`               | トークンの表示用略称（例: `USDC`）                               | metadataを取得できなければ`null`。識別にはアドレスを使う                            |
| `transfer.decimals`             | `amountRaw`を人間向け数量へ換算するときの小数桁数                | metadataを取得できなければ`null`。`0`も有効                                         |
| `transfer.intended`             | calldataから読み取った、**実行しようとした**送金内容             | 失敗した取引でも残る場合がある。実際に移動した証拠ではない                          |
| `transfer.intended.from`        | 送金元として指定・推定できたアドレス                             | 確定できなければ`null`。`transferFrom`ではcalldataの`from`を使う                    |
| `transfer.intended.to`          | 送金先として指定されたアドレス                                   | ERC-20 Contractのアドレスとは別                                                     |
| `transfer.intended.amountRaw`   | 送ろうとした数量の最小単位                                       | 例: `decimals: 6`なら`"1000000"`は1 token。精度を失わないよう10進整数の文字列にする |
| `transfer.observed`             | 対象トークンの`Transfer` Event Logで確認した**実際の移動**の一覧 | 対応するEvent Logがなければ`[]`。`intended`と違う可能性がある                       |
| `transfer.observed[].from`      | 各Event Logで確認した送金元アドレス                              | `intended.from`と異なる可能性がある                                                 |
| `transfer.observed[].to`        | 各Event Logで確認した送金先アドレス                              | `intended.to`と異なる可能性がある                                                   |
| `transfer.observed[].amountRaw` | 各Event Logで確認した最小単位の数量                              | 10進整数の文字列。複数Eventがあればそれぞれに入れる                                 |

残りの入れ子の項目は次の意味を持つ。

| フィールド                    | 何を表すか                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `failure.reason`              | 確認・推定できた失敗原因。取得できなければ`null`                                                                                             |
| `failure.confidence`          | **失敗原因**の確かさ。`confirmed`＝直接の根拠あり、`probable`＝推定、`unknown`＝特定不能。Receiptによる取引失敗の確かさとは別                |
| `evidence[].source`           | 情報の取得元。`transaction` / `receipt` / `event_log` / `trace` / `simulation`。`simulation`は再現の結果であり、実際の取引の直接証拠ではない |
| `evidence[].detail`           | その取得元で確認した具体的な事実。例: `Receipt status=0`                                                                                     |
| `recommendedActions[].action` | 次に行う確認や対応。例: `残高と承認額を確認する`                                                                                             |
| `recommendedActions[].reason` | その対応を勧める理由。根拠のない再送を勧めない                                                                                               |
| `explanations.developer`      | 技術的な根拠と未確定事項を含む開発者向けの説明                                                                                               |
| `explanations.customer`       | 顧客が「何が分かり、次に何をすればよいか」を理解できる平易な説明。内部RPCや秘密情報は含めない                                                |

`limitations`の具体例: `status: pending`なら「Receiptがまだないため成功・失敗を判定できません」、`status: failed`でrevert dataを取れなければ「失敗は確認できましたが、revert dataを取得できず原因は特定できません」。token metadataを取得できなければ「symbol/decimalsが不明なため、人間向け数量は表示できません」。いずれも**分からない範囲を正直に伝える情報**であり、`RPC_UNAVAILABLE`のように診断そのものを返せないToolエラーとは区別する。

**フィールド間の相関ルール**

各フィールドを単独で検証するだけでは、`not_found`なのに送金内容がある、といった矛盾を見逃す。以下の「T-002で検証」はZod schemaと逆方向のテスト（矛盾するJSONを拒否するテスト）に含める。

| 相関する項目                                                       | 守るルール                                                                                                                                                | 矛盾する例                                       | 検証時期                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------- |
| `status` ↔ `code`                                                  | `pending` / `success` / `failed`は`code: null`。`not_found` / `unsupported` / `indeterminate`は上表の対応するcodeだけを許す                               | `status: "not_found"`かつ`code: null`            | T-002（実装済み）               |
| `status` ↔ `failure`                                               | `failed`だけ`failure`オブジェクトを持つ。それ以外は`failure: null`                                                                                        | `status: "success"`かつ`failure`あり             | T-002（実装済み）               |
| `status: not_found` ↔ `blockNumber` / `confirmations` / `transfer` | 取引が未検出ならBlock番号・確認数・送金解析は得られないため、すべて`null`                                                                                 | `not_found`なのに`transfer`あり                  | T-002                           |
| `status: unsupported` ↔ `transfer`                                 | MVP対象のERC-20送金として扱えないため`transfer: null`                                                                                                     | `unsupported`なのに`transfer.method: "transfer"` | T-002                           |
| `blockNumber` ↔ `confirmations`                                    | `confirmations`が数値なら`blockNumber`も数値。Blockが不明なのに確認数だけ算出しない。Blockが分かっても確認数を取得できなければ`confirmations: null`でよい | `blockNumber: null`かつ`confirmations: 3`        | T-002                           |
| `failure.reason` ↔ `failure.confidence`                            | 原因を取得できず`reason: null`なら`confidence: "unknown"`。`confirmed`や`probable`には具体的な原因文が必要                                                | `reason: null`かつ`confidence: "confirmed"`      | T-002                           |
| `error.code` ↔ `error.retryable`                                   | `RPC_UNAVAILABLE`だけ`true`。`UNSUPPORTED_CHAIN`と`INTERNAL_ERROR`は`false`                                                                               | `INTERNAL_ERROR`かつ`retryable: true`            | T-002（実装済み）               |
| MCP `isError` ↔ 応答の種類                                         | 診断結果は`isError`なし/`false`、Toolエラーは`true`。`TRANSACTION_NOT_FOUND`は診断結果でありToolエラーではない                                            | `not_found`を`isError: true`で返す               | T-002のMCPテスト、実診断はT-008 |

次は**値だけでは意味を判定できない相関**。T-002のZodで文面の正しさまで判定しようとせず、診断処理を実装するチケットで検証する。

- `pending`はReceipt未取得を示す。`transfer.intended`がcalldataから読める場合はあるが、Receipt由来の`transfer.observed`は空配列とし、未確認の移動を成功と表現しない（T-003〜T-005）。`pending`というstatusだけを理由に`blockNumber`を必ず`null`とはしない。TransactionからBlock番号だけ分かる場合もあり得るため。
- `transfer.intended`は試行、`transfer.observed`は対応するEvent Logで確認した移動。両者が同じ値になるとは限らない。`observed`に項目を入れたら、そのEvent Logに基づく`evidence`も記録する（T-005・T-008）。
- `failure.confidence: "confirmed"`は**原因**の直接根拠がある場合だけ。Receiptが失敗を示すだけなら「失敗した事実」は確かでも原因は`unknown`になり得る（T-006）。
- 原因不明、Receipt未取得、token metadata不足など、説明に影響する欠落は`limitations`で具体的に伝える。`recommendedActions[].reason`は根拠に結び付け、`explanations.developer`と`.customer`は同じ状態・原因を示す（T-006〜T-008）。
- `chainId`と`txHash`は診断依頼の対象と一致させる。単独の出力schemaは入力との一致を検証できないため、Toolの結合テストで確認する（T-008）。
- 入力形式不正・未対応chainIdは支払い要求前に拒否する。x402導入後に決済境界の結合テストで確かめる（T-009・T-012）。

**Toolの診断エラー形式**

入力スキーマ違反の応答形式はMCP SDKに任せ、フィールド別の修正案をZodのエラーメッセージに設定する。アプリケーション上のエラーは`isError: true`にし、`content[0].text`に以下のJSON文字列を入れる。`schemaVersion`は文字列の`"1"`で固定する。`message`は利用者向け、`details`は任意の補足で、秘密鍵・RPC credential・Payment Signature・stack traceを含めない。

```json
{
  "schemaVersion": "1",
  "error": {
    "code": "UNSUPPORTED_CHAIN",
    "message": "Base SepoliaのchainId（84532）を指定してください。",
    "retryable": false,
    "details": [{ "field": "chainId", "reason": "unsupported_value" }]
  }
}
```

エラー応答の各フィールドは次の意味を持つ。

| フィールド               | 何を表すか                                           |
| ------------------------ | ---------------------------------------------------- |
| `schemaVersion`          | エラーJSONの形式の版。正常応答と同じ`"1"`            |
| `error`                  | 診断結果を返せなかった理由をまとめたオブジェクト     |
| `error.code`             | Agentが分岐に使うエラー識別子（下表）                |
| `error.message`          | 人が読んで次の行動を判断するための説明               |
| `error.retryable`        | 一時的な原因で、後から再確認する余地があるか         |
| `error.details`          | どの入力が問題かなどの補足。補足がなければ省略できる |
| `error.details[].field`  | 問題のある入力項目名。例: `chainId`                  |
| `error.details[].reason` | 機械可読な理由。例: `unsupported_value`              |

`retryable`は原因が一時的で再確認の余地があるかを示すだけで、自動再実行・自動再決済の許可ではない。支払い後の結果が不明な場合は、支払い状態を確認するまで新しい支払いを作らない。MCP/JSON-RPC自体のプロトコルエラーはこのアプリケーション用形式とは別に扱う。

| エラーコード        | 発生条件                                                | 利用者に伝える次の行動                                    | `retryable` | 課金境界           |
| ------------------- | ------------------------------------------------------- | --------------------------------------------------------- | ----------- | ------------------ |
| `UNSUPPORTED_CHAIN` | 形式は正しいがchainIdが`84532`以外                      | Base SepoliaのchainIdを指定                               | `false`     | 支払い前に拒否     |
| `RPC_UNAVAILABLE`   | timeout、rate limit、接続失敗で必要な情報を取得できない | RPC復旧後に再確認。支払い済みか不明なら先に決済状態を確認 | `true`      | 診断結果を返さない |
| `INTERNAL_ERROR`    | 想定外のサーバー障害で診断結果を生成できない            | 運営側で調査し、決済状態を確認                            | `false`     | 診断結果を返さない |

**エラーではなく診断結果として返すもの**

以下は有効な入力に対して調査を実施した結果であり、MCP Toolの`isError`を立てない。`status`と`code`を診断結果schemaに含め、原因が未確定なら断定しない。課金対象となるかは上記「課金境界」に従う。

| 結果コード                     | `status`        | 判定条件と注意点                                                                                                                                                            |
| ------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRANSACTION_NOT_FOUND`        | `not_found`     | RPCへの照会は成功したが、その時点で取引を見つけられない。永久に存在しないとは断定しない                                                                                     |
| `UNSUPPORTED_TRANSACTION_TYPE` | `unsupported`   | 取引は見つかったが、ERC-20 `transfer` / `transferFrom`の対象外                                                                                                              |
| `DIAGNOSIS_INDETERMINATE`      | `indeterminate` | 取得できた情報だけでは取引状態を判定できない。Receiptで実行失敗と分かるが原因不明な場合は`failed`と原因確度`unknown`を使う。取得自体に失敗した`RPC_UNAVAILABLE`とも区別する |

`pending`はReceiptがまだない診断結果、`failed`はReceiptが実行失敗を示す診断結果とする。どちらもTool自体のエラーではない。

**決済時のエラー（T-009〜T-012で実装）**

これらは診断結果ではなく、x402が要求するHTTP/MCPの応答形式を優先する。T-002ではAgent側で区別する名称と意味を定義し、通常の`content[0].text`形式へ無理に詰め込まない。

| 分類名             | 発生条件                                                                            | 次の行動                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `PAYMENT_REQUIRED` | 有効な診断依頼だが、支払いがまだない                                                | 提示されたNetwork・asset・金額・受取先をClient側の許可条件と照合してから購入を判断する |
| `PAYMENT_REJECTED` | 署名、期限、Network、asset、金額などが条件に合わず、支払いを受け付けない            | 拒否理由を確認し、支払い条件や残高を修正する。署名を無条件に繰り返さない               |
| `PAYMENT_FAILED`   | Facilitatorの障害、settlement失敗などで決済を完了できない、または完了を確認できない | 決済状態を確認する。結果不明のtimeoutでは自動で新しい支払いを作らない                  |

支払い失敗時は診断結果を返さない。支払い後の診断障害でも新たな購入を自動で行わず、先に決済状態を確認する。

**作業内容**

- 入力のTypeScript型・Zod schemaを定義し、SDKによる形式検証とTool内での未対応chainId判定を使い分ける
- 上記の正常応答の型・Zod schemaを定義し、`status`と`code`の組合せ、`null`と空配列の使い分けを検証する
- アプリケーションのToolエラーの型・Zod schemaに`code`、`message`、`retryable`、任意の`details`を定義する
- 支払い前の入力拒否、診断結果、RPC障害、決済エラーの境界を文書化する

**完了条件**

- [x] 不正なtxHashと未対応chainIdをRPC問い合わせ・支払い要求前に拒否できる
- [x] 入力形式の不正はSDKの検証エラー、形式は正しいが未対応のchainIdは`UNSUPPORTED_CHAIN`として区別できる
- [x] `not_found`、`pending`、`unsupported`をToolエラーと混同しない
- [x] `success`、`failed`、`pending`、`not_found`、`unsupported`、`indeterminate`の正常応答とToolエラーのschema testが通り、コードと再試行可否が上表に一致する
- [x] 上記のT-002相関ルールについて、矛盾するJSONをschemaが拒否するテストが通る
- [x] エラー応答やログに秘密情報が入らない

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
- RPC障害で必要情報を取得できない場合は`RPC_UNAVAILABLE`とし、診断結果の`indeterminate`とは区別する
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

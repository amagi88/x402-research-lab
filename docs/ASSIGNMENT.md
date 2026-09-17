# 注意: この文書は旧案です

この文書は「ウォレット調査API」を検討していた時点の記録です。
現在は「x402で購入できるWeb3 Transaction Diagnosis MCP Tool」を開発します。
実装範囲、順序、完了条件は [TICKETS.md](./TICKETS.md) を参照してください。

# 最終的に作るもの（旧案）

## 合意された方向と今回の具体化

最新会話の方向は「x402で有料APIを実装し、MCP Agentから購入できる独自作品を作り、3か月以内に外部成果を出す」。事業テーマはAgent向けWeb3 Intelligence APIが第一仮説であり、需要が検証済みという意味ではない。

練習を進めるため、今回の具体案を「1チェーンのウォレット調査API」に置く。顧客の反応で対象・内容は変更してよい。

## 完成時のデモ

ユーザーがウォレットを指定 → Agentがresearch_walletを選ぶ → MCP Toolが有料GET /research?address=...を呼ぶ → 402の条件を確認 → 支払い上限・network・asset・payToを検査 → Clientが署名して再送 → 既存Facilitatorが検証・決済 → APIの調査結果を取得 → Agentが根拠付きで説明。

実装順序や決済前後の応答制御は導入SDKを読み確認する。verify成功をsettle成功として扱わない。

## MVPの調査内容（今回の案）

1チェーンに限定し、address・chainId・調査時刻・blockNumber・ネイティブ残高・トランザクション数（送信nonce）・コントラクトコード有無を取得する。出典と取得範囲を返す。nonceを全取引履歴の件数と呼ばない。全トークン保有・全履歴はIndexer等が必要な次段階。根拠なしに安全・危険のスコアを断定しない。

## 段階別の完成条件

### Week 1–2: Express + x402 Client

- GET /researchは未払いで402とPAYMENT-REQUIREDを返す。
- SDKでBase Sepoliaのexact決済を構成。初めは固定fixtureの調査データでもよい。
- Clientが署名してPAYMENT-SIGNATUREを付け再送し、testnet USDCで決済して結果を取得。
- PAYMENT-REQUIRED / PAYMENT-SIGNATURE / PAYMENT-RESPONSEの構造を観察して説明する。秘密鍵や再利用可能な署名を公開ログに残さない。
- 実行手順とtestnet取引の証拠を記録する。fixtureやモックだけでは決済完了としない。

### Week 3–4: 決済と失敗の理解

- verifyとsettle、EIP-712、EIP-3009、authorization nonceと取引nonceの違いを説明。
- 不正署名・期限切れ・残高不足・再利用・Facilitator timeout・決済失敗を検証。
- 決済失敗時に有料結果を返さないこと、結果不明時の再試行で再購入を無条件に実行しないことを確認。
- 外部読み取りデータを実装し、データソース障害と決済障害を区別する。

### Week 5–8: MCP + 独自作品

- research_wallet(address)をMCP Toolとして提供し、HTTP購入Clientを呼ぶ。
- 1回上限に加えセッション総額・回数上限を設け、超過は署名前に拒否。
- AI AgentからTool実行し、取得結果と根拠を説明できる。
- 異常系の自動テストと再現手順、構成図、5分程度のデモを残す。

### Week 9–12: 外部成果と需要検証

- README・設定例・テスト・デモを含む作品をGitHubに公開する。
- x402関連PRまたはBountyを最低1件提出する（採用・受賞は必須ではない）。
- Web3事業者/Agent builder 10人を目安に課題・利用意向・支払い意向を記録。
- 技術完成と売れるかは別判定。利用されない/払われないなら対象や価値を変更。

## 今回の範囲

環境と課題定義のみ。メインネット送金・公開・外部への連絡は今回実行しない。
Facilitator、Wallet、独自スマートコントラクト、大規模SaaSを自作する必要はない。
最初の手: src/server.tsの/researchを対象に公式SDKの支払いmiddlewareを組み込む。

1. 文書概要・位置づけ1.1. 本書の目的本書は、02_requirements.md（AI質問機能 要件定義書）で確定した機能要件・非機能要件を実現するための具体的なシステム設計を定義する。API スキーマ、クラス・関数インターフェース、例外ハンドリングフロー、画面 DOM 構造、およびクライアント側スクリプトの挙動を確定させ、次フェーズ（04_implementation.md）における実装の設計図とすることを目的とする。1.2. ドキュメント進行管理体系（改番確定）要望書（01_request.md）にて重複していたドキュメント番号を以下の通り整理し、以降のフェーズで統一運用する。docs/ai/01_request.md（追加要望書・完了）docs/ai/02_requirements.md（要件定義書・完了）docs/ai/03_design.md（詳細設計書・本書）docs/ai/04_implementation.md（実装手順書およびソースコード）docs/ai/05_test_spec.md（テスト仕様書）docs/ai/06_test_results.md（テスト実施結果報告書）2. アーキテクチャ・モジュール設計2.1. レイヤー構成と依存関係既存の TODO アプリ（src/apps/todo/）の 3 層構造を踏襲し、単方向依存（index.ts → aiRouter.ts → aiController.ts → aiService.ts）を維持する。レイヤーファイルパス主な責務依存先エントリ統合index.ts/ai パスへのルーターマウント（既存ルート・404・エラーハンドラーと干渉しない位置に配置）aiRouterルーティングsrc/apps/ai/aiRouter.tsHTTP メソッド・URL パスとコントローラー関数のマッピングexpress, aiControllerプレゼンテーションsrc/apps/ai/aiController.ts画面描画制御、リクエストボディ検証、JSON レスポンス整形、エラー変換・委譲express, aiServiceビジネスロジックsrc/apps/ai/aiService.ts@google/genai SDK の呼び出し、タイムアウト制御、外部 API 例外の抽象化@google/genaiビューviews/ai/index.ejsAI質問画面の HTML 構造定義public/ai/ai.js, 既存共通 CSSフロントエンド制御public/ai/ai.js入力文字数カウント、二重送信防止、fetch 通信、サニタイズ＋整形描画DOM API, POST /ai/ask2.2. index.ts へのマウント設計既存の Express アプリケーション設定（express.json() ミドルウェア適用後、かつ 404 ハンドラーおよびグローバルエラーハンドラー定義前）に以下を追加する。TypeScriptimport aiRouter from './src/apps/ai/aiRouter';

// 既存のルーティング定義付近に配置
app.use('/ai', aiRouter);
※ POST /ai/ask は JSON リクエストを受け取るため、index.ts において app.use(express.json()) が app.use('/ai', aiRouter) より前に有効化されていることを前提とする。3. API インターフェース設計3.1. エンドポイント仕様一覧メソッドパスコントローラー関数Content-Type (Req)Content-Type (Res)概要GET/airenderIndexなしtext/html; charset=utf-8AI質問画面のレンダリングPOST/ai/askpostAskapplication/jsonapplication/json; charset=utf-8質問の送信とAI回答の生成・返却3.2. GET /ai 詳細仕様リクエストパラメータ: なし処理内容: res.render('ai/index', { title: 'AI質問アシスタント', maxLength: 2000 }) を呼び出す。正常レスポンス: HTTP 200 OK（HTML ドキュメント）3.3. POST /ai/ask 詳細仕様リクエストボディ（JSON）JSON{
  "question": "ExpressとTypeScriptでエラーハンドリングを統一するコツを教えてください。"
}
フィールド型必須制約questionstring必須typeof question === 'string' かつ question.trim().length >= 1 かつ question.trim().length <= 2000正常レスポンス（HTTP 200 OK）JSON{
  "success": true,
  "data": {
    "answer": "ExpressとTypeScriptでエラーハンドリングを統一するには、主に以下の3つのポイントが重要です。\n\n1. カスタムエラークラスの定義...",
    "model": "gemini-2.5-flash"
  }
}
エラーレスポンス（HTTP 400 / 500 / 502 / 504）すべての異常系レスポンスは統一フォーマットで返却し、フロントエンドでのエラー表示処理を単純化する。JSON{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "質問内容を入力してください。"
  }
}
エラーコード・HTTPステータス対応表error.codeHTTP ステータス発生条件error.message（画面表示文言）INVALID_REQUEST_FORMAT400 Bad Requestリクエストボディがオブジェクトでない、または question が文字列型でないリクエスト形式が正しくありません。VALIDATION_EMPTY400 Bad Requestquestion.trim().length === 0質問内容を入力してください。VALIDATION_TOO_LONG400 Bad Requestquestion.trim().length > 2000質問は2,000文字以内で入力してください。AI_CONFIG_ERROR500 Internal Server Error環境変数 AI_API_KEY が未設定または空文字現在AI機能を利用できません。管理者にお問い合わせください。AI_TIMEOUT_ERROR504 Gateway TimeoutGemini API の応答が 30,000ms を超過AIからの応答がタイムアウトしました。時間をおいて再度お試しください。AI_UPSTREAM_ERROR502 Bad GatewayGemini API 側のエラー（認証失敗、レート制限 429、サーバー障害、空レスポンス等）AIサービスとの通信中にエラーが発生しました。しばらくしてから再度お試しください。INTERNAL_SERVER_ERROR500 Internal Server Error上記以外の予期せぬ例外（グローバルエラーハンドラー連携時）予期せぬエラーが発生しました。4. バックエンド詳細設計4.1. 型定義・カスタムエラー設計（src/apps/ai/aiService.ts）サービス層でのエラー種別をコントローラー層へ安全に伝達するため、専用のエラークラスおよびレスポンス型を定義する。TypeScriptexport type AiErrorCode =
  | 'AI_CONFIG_ERROR'
  | 'AI_TIMEOUT_ERROR'
  | 'AI_UPSTREAM_ERROR';

export class AiServiceError extends Error {
  public readonly code: AiErrorCode;
  public readonly statusCode: number;
  public readonly userMessage: string;

  constructor(code: AiErrorCode, statusCode: number, userMessage: string, detailMessage?: string) {
    super(detailMessage || userMessage);
    this.name = 'AiServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.userMessage = userMessage;
  }
}

export interface AskAiResult {
  answer: string;
  model: string;
}
4.2. サービス層詳細設計（src/apps/ai/aiService.ts）定数・SDK 初期化方針使用モデル: gemini-2.5-flashタイムアウト時間: 30000 ミリ秒（30秒）システム指示文（systemInstruction）:「あなたはWebアプリケーション内の親切で正確なAIアシスタントです。ユーザーの質問に対して、簡潔かつ分かりやすく日本語で回答してください。」クライアント初期化:モジュール読み込み時ではなく関数呼び出し時（または遅延初期化）に process.env.AI_API_KEY を検証する。これにより、APIキー未設定時でもサーバー起動自体は失敗せず、/ai/ask 呼び出し時に適切な 500 エラーを返却できる。generateAnswer(question: string): Promise<AskAiResult> 処理フローAPIキー検証:const apiKey = process.env.AI_API_KEY?.trim();!apiKey の場合、AiServiceError('AI_CONFIG_ERROR', 500, '現在AI機能を利用できません。管理者にお問い合わせください。', 'AI_API_KEY is not configured') をスローする。SDK インスタンス化とタイムアウト制御:const ai = new GoogleGenAI({ apiKey });AbortController と setTimeout（30,000ms）を生成する。ai.models.generateContent に config: { systemInstruction, abortSignal: controller.signal } を渡して呼び出し、並行してタイマーによるタイムアウト Promise と Promise.race で競合させる（SDK 側のアボート遅延や未対応ケースでも確実に 30 秒で打ち切るため）。finally ブロックで必ず clearTimeout を実行し、タイマーリークを防止する。レスポンス検証:const answerText = response.text?.trim();!answerText の場合（セーフティフィルタによるブロックや空返却時）、AiServiceError('AI_UPSTREAM_ERROR', 502, 'AIサービスとの通信中にエラーが発生しました。しばらくしてから再度お試しください。', 'Empty response from Gemini API') をスローする。正常返却:{ answer: answerText, model: 'gemini-2.5-flash' } を返却する。例外正規化（catch ブロック）:既に AiServiceError の場合はそのまま再スローする。タイムアウト起因（error.name === 'AbortError' またはタイムアウトフラグが true）の場合は AiServiceError('AI_TIMEOUT_ERROR', 504, ...) に変換してスローする。その他の SDK エラー（HTTP 401/403/429/500/503 やネットワーク障害）は、詳細を console.error('[AiService] Gemini API Error:', error) に記録した上で、AiServiceError('AI_UPSTREAM_ERROR', 502, ...) に変換してスローする（生エラー詳細や API キー情報はクライアントへ漏洩させない）。4.3. コントローラー層詳細設計（src/apps/ai/aiController.ts）renderIndex(req: Request, res: Response, next: NextFunction): voidtry ブロック内で res.render('ai/index', { title: 'AI質問機能', maxLength: 2000 }) を実行する。テンプレート描画エラー時は next(error) を呼び出す。postAsk(req: Request, res: Response, next: NextFunction): Promise<void>リクエスト形式検証:req.body が存在しない、または typeof req.body.question !== 'string' の場合、HTTP 400 で INVALID_REQUEST_FORMAT を返却して終了。文字列正規化と長さ検証:const trimmedQuestion = req.body.question.trim();trimmedQuestion.length === 0 の場合、HTTP 400 で VALIDATION_EMPTY を返却して終了。trimmedQuestion.length > 2000 の場合、HTTP 400 で VALIDATION_TOO_LONG を返却して終了。サービス呼び出し:const result = await generateAnswer(trimmedQuestion);HTTP 200 で { success: true, data: result } を返却する。例外ハンドリング（catch (error)）:error instanceof AiServiceError の場合:console.error(\[AiController] ${error.code}: ${error.message}`);`res.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.userMessage } });それ以外の予期せぬエラー（SyntaxError 以外のランタイム例外等）の場合:API リクエスト（/ai/ask）ではクライアントの fetch が JSON を期待しているため、JSON 形式で 500 を返すか、既存のグローバルエラーハンドラーが JSON 応答に対応していない可能性を考慮し、console.error('[AiController] Unexpected Error:', error) を出力した上で res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: '予期せぬエラーが発生しました。' } }) を返却する（ヘッダー送信済みの場合は next(error) に委譲）。4.4. ルーター層詳細設計（src/apps/ai/aiRouter.ts）TypeScriptimport { Router } from 'express';
import { renderIndex, postAsk } from './aiController';

const aiRouter = Router();

aiRouter.get('/', renderIndex);
aiRouter.post('/ask', postAsk);

export default aiRouter;
5. フロントエンド詳細設計5.1. ビュー構造・DOM ID 仕様（views/ai/index.ejs）既存の views/todo/ 配下の EJS テンプレート（共通レイアウト・CSS クラス構成）に合わせ、シンプルで視認性の高い画面を構成する。public/ai/ai.js から確実に要素を参照するため、以下の id 属性を規定する。要素の役割HTML 要素id 属性初期状態・属性仕様ナビゲーションnav / a-href="/"（TOPへ戻る）、href="/todo"（TODO一覧へ）のリンクを配置質問フォームformai-ask-formフォーム送信イベント（submit）を JS でフック質問入力欄textareaquestion-inputrows="5", maxlength="2000", placeholder="AIに質問したい内容を入力してください..."文字数カウンターspanchar-count初期テキスト 0 / 2000（上限接近時に警告色クラスを付与）送信ボタンbuttonsubmit-buttontype="submit", テキスト「質問する」クリアボタンbuttonclear-buttontype="button", テキスト「クリア」（入力と表示をリセット）ローディング表示divloading-indicatorhidden 属性付与（スピナー＋「AIが回答を生成しています...」）エラー表示領域diverror-boxhidden 属性付与、role="alert"（赤い枠線・背景で視認性を確保）回答表示コンテナsectionanswer-sectionhidden 属性付与使用モデル表示spananswer-modelレスポンスの data.model をテキスト表示回答本文エリアdivanswer-contentサニタイズ・整形済み HTML を描画する領域回答コピーボタンbuttoncopy-buttontype="button", 生テキストをクリップボードへコピー※ <script src="/ai/ai.js" defer></script> を読み込む（インラインスクリプトは記述しない）。5.2. クライアントスクリプト状態遷移・制御設計（public/ai/ai.js）UI 状態管理（4 状態）setUiState(state) 関数により、画面上の各要素の活性・表示状態を一元制御する。状態名question-inputsubmit-buttonloading-indicatorerror-boxanswer-sectionIDLE（初期・待機）有効有効（「質問する」）非表示非表示非表示LOADING（送信中）disableddisabled（「送信中...」）表示非表示前回結果があれば維持または非表示SUCCESS（回答表示）有効有効（「質問する」）非表示非表示表示ERROR（エラー表示）有効有効（「質問する」）非表示表示非表示イベント処理フローinput イベント（question-input）:現在の文字数 input.value.length を取得し、char-count を ${length} / 2000 に更新する。1,800 文字以上の場合、カウンターに警告スタイルクラス（例: is-warning）を付与する。submit イベント（ai-ask-form）:event.preventDefault() を実行。二重送信ガード: isSubmitting === true の場合は即座にリターン。クライアント側事前バリデーション:const trimmed = questionInput.value.trim();空文字の場合は API 通信を行わず ERROR 状態へ遷移し、「質問内容を入力してください。」を表示。2,000 文字超過の場合は ERROR 状態へ遷移し、「質問は2,000文字以内で入力してください。」を表示。送信開始: isSubmitting = true とし、LOADING 状態へ遷移。非同期通信:JavaScriptconst response = await fetch('/ai/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: trimmed })
});
const result = await response.json();
レスポンス判定:response.ok && result.success の場合:生テキスト（result.data.answer）を保持（コピー機能用）。formatAndSanitizeAnswer(result.data.answer) で安全な HTML に変換し、answer-content へ反映。SUCCESS 状態へ遷移。それ以外の場合:result?.error?.message || 'エラーが発生しました。' を error-box に textContent で設定し、ERROR 状態へ遷移。ネットワーク遮断等の catch 時:「サーバーとの通信に失敗しました。ネットワーク接続を確認してください。」を表示し、ERROR 状態へ遷移。finally: isSubmitting = false に戻す。キーボードショートカット（利便性向上）:question-input フォーカス中に Ctrl + Enter（macOS では Cmd + Enter）が押下された場合、フォーム送信をトリガーする。5.3. 回答テキストのサニタイズ＆整形アルゴリズム（formatAndSanitizeAnswer）外部の大型 Markdown ライブラリを増やさず、軽量かつ XSS ゼロを保証するため、「1. 全文 HTML エスケープ」を最優先で実行した後に、「2. 限定的な書式変換」を適用する 2 段階パイプラインを採用する。ステップ 1: 完全 HTML エスケープ（XSS 無害化）入力文字列の &, <, >, ", ' をそれぞれ &amp;, &lt;, &gt;, &quot;, &#39; に置換する。これにより、AI の出力に <script> や onerror= 等が含まれていても 100% 文字列として無害化される。ステップ 2: 軽量フォーマット変換（エスケープ済み文字列に対して適用）コードブロック（```...```）を <pre><code>...</code></pre> に変換。インラインコード（`...`）を <code>...</code> に変換。太字（**...**）を <strong>...</strong> に変換。改行（\n）を <br> に変換（<pre> ブロック内を除く）。6. セキュリティ・環境変数設計6.1. 環境変数仕様（.env / .env.example）コード スニペット# Google Gemini API Key (AI質問機能で使用)
AI_API_KEY=your_gemini_api_key_here
.env.example にキー名とダミー値を追記し、開発者へ設定項目を明示する。.env は .gitignore 対象であることを確認し、実キーがリポジトリにコミットされない運用とする。6.2. セキュリティチェックリスト秘匿情報の非露出: aiService.ts および aiController.ts でキャッチしたエラーオブジェクト全体（HTTP ヘッダーや認証情報を含む可能性があるオブジェクト）を res.json() に渡さない。コンテンツインジェクション防止: エラーメッセージの表示には必ず element.textContent を使用する。回答表示領域のみ、ステップ 1 で完全エスケープ済みの文字列を innerHTML に代入する。ペイロード制限: index.ts の express.json({ limit: '100kb' }) 等のデフォルト制限により、巨大 JSON 送信によるメモリ枯渇を防止する。7. 次フェーズ（04_implementation.md）への引き継ぎ事項次フェーズでは、本詳細設計書に基づき以下の作業を実施する。依存パッケージ @google/genai のインストール手順の明記設計通りに実装した全ソースコードの提示・配置src/apps/ai/aiService.tssrc/apps/ai/aiController.tssrc/apps/ai/aiRouter.tsviews/ai/index.ejspublic/ai/ai.jsindex.ts（差分・統合箇所）docs/ai/04_implementation.md としての実装手順書・変更一覧ドキュメントの作成
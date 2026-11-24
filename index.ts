import express, { Request, Response } from 'express';
import path from 'path';
import { pool } from './db';


const app = express(); // Expressアプリケーションを作成
const port: number = 3000; // ローカルで使用するポート番号


// ------------------------------
// Expressの基本設定
// ------------------------------
app.use(express.urlencoded({ extended: true })); // フォームから送信されたデータを受け取れるようにする
app.use(express.static(path.join(process.cwd(), 'public'))); // CSSや画像などの静的ファイルを公開する
app.set('view engine', 'ejs'); // テンプレートエンジンにEJSを設定
app.set('views', path.join(process.cwd(), 'views')); // EJSファイルを保存するフォルダーを指定


// ------------------------------
// ルーティング
// ------------------------------


// 「/」にアクセスされたときの処理
app.get('/', (req: Request, res: Response): void => {
  res.send('20261110 test up');
});

// Neonへの接続をSELECT文で確認する
app.get('/api/db-check', async (_req, res) => {
  try {
    const result = await pool.query('SELECT 1 AS connection_test');
    res.json({
      status: 'ok',
      database: result.rows[0].connection_test === 1 ? 'connected' : 'error',
    });
  } catch (error) {
    console.error('DB接続確認に失敗しました', error);
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});



// ------------------------------
// サーバー起動
// ------------------------------


app.listen(port, (): void => {
  console.log(`Server started: http://localhost:${port}`);
});

// [追加] AI質問機能ルーター
import aiRouter from './src/apps/ai/aiRouter';

// [追加] /ai パスへのマウント（404ハンドラーより前に配置）
app.use('/ai', aiRouter);

// --- 既存の404ハンドラー・グローバルエラーハンドラー ---
# Health Dashboard

[English](README.md) | 日本語

[Google Health API](https://developers.google.com/health) (v4) から歩数・睡眠・心拍数などを取得して表示する、ローカル用の健康ダッシュボードです。
`docker compose up` だけで起動します。

```
ブラウザ → frontend (nginx, :3000) → backend (FastAPI) → health.googleapis.com
```

## クイックスタート(デモデータ)

```bash
docker compose up -d --build
```

http://localhost:3000 を開きます。`.env` が無い状態では **デモデータ** で起動するので、Google の設定をしなくても画面を確認できます。

## 自分のデータを表示する

### 1. Google Cloud の設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成(既存のものでも可)
2. **API とサービス → ライブラリ** で「Google Health API」を有効化
3. **Google Auth Platform → ブランディング / 対象** で OAuth 同意画面を作成
   - ユーザーの種類は「外部」、公開ステータスは「テスト」のままで OK
   - **テストユーザー** にデータを見たい Google アカウントを追加
4. **Google Auth Platform → データアクセス** で次のスコープを追加
   - `.../auth/googlehealth.activity_and_fitness.readonly`
   - `.../auth/googlehealth.health_metrics_and_measurements.readonly`
   - `.../auth/googlehealth.sleep.readonly`
5. **Google Auth Platform → クライアント** で OAuth クライアント ID を作成
   - アプリケーションの種類: **ウェブ アプリケーション**
   - 承認済みのリダイレクト URI: `http://localhost:3000/auth/callback`

詳しくは公式の [Set up Google Cloud and OAuth](https://developers.google.com/health/setup) を参照してください。

### 2. `.env` を作成して再起動

```bash
cp .env.example .env
# GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET を記入
docker compose up -d
```

http://localhost:3000 を開き「Google でログイン」から認可すると、ダッシュボードに自分のデータが表示されます。
体重は初期状態では非表示(取得もしない)です。ヘッダーの「体重を表示」にチェックすると表示され、その設定はブラウザに保存されます。

> データは Fitbit / Pixel Watch などで Google Health(旧 Fitbit)アプリに同期されている必要があります。

## 表示する指標

| 指標 | データ型 | 取得方法 |
| --- | --- | --- |
| 歩数 | `steps` | `dataPoints:dailyRollUp` |
| 距離 | `distance` | `dataPoints:dailyRollUp` |
| 消費カロリー | `total-calories` | `dataPoints:dailyRollUp`(14日ごとに分割) |
| 心拍数(平均・最低・最高) | `heart-rate` | `dataPoints:dailyRollUp`(14日ごとに分割) |
| アクティブゾーン | `active-zone-minutes` | `dataPoints:dailyRollUp` |
| 体重(「体重を表示」をオンにしたときだけ) | `weight` | `dataPoints:dailyRollUp` |
| 安静時心拍数 | `daily-resting-heart-rate` | `dataPoints.list` |
| 心拍変動 (HRV) | `daily-heart-rate-variability` | `dataPoints.list` |
| 血中酸素 (SpO2) | `daily-oxygen-saturation` | `dataPoints.list` |
| 睡眠(ステージ別) | `sleep` | `dataPoints.list` |

指標ごとに個別に取得しているので、権限不足やデータ無しで一部が失敗しても他の指標は表示されます(失敗した指標は画面上部に理由が出ます)。

## 構成

```
.
├── docker-compose.yml
├── .env.example
├── backend/            # FastAPI: OAuth・Google Health API 呼び出し・整形
│   └── app/
│       ├── main.py           # ルーティング (/api/*, /auth/*)
│       ├── oauth.py          # 認可コードフロー・トークン保存/更新
│       ├── google_health.py  # Google Health API クライアント
│       ├── metrics.py        # 各指標の取得と整形
│       └── demo.py           # デモデータ生成
└── frontend/           # React + Recharts。nginx で配信し /api, /auth を backend にプロキシ
```

### API

| エンドポイント | 説明 |
| --- | --- |
| `GET /api/status` | 動作モード(`demo` / `live`)と認証状態 |
| `GET /api/dashboard?days=14` | 全指標をまとめて返す(`weight=true` で体重も含める、`refresh=true` でキャッシュ無視) |
| `GET /auth/login` | Google の同意画面へリダイレクト |
| `GET /auth/callback` | 認可コードをトークンに交換して保存 |
| `POST /auth/logout` | トークンを失効させて削除 |

## 設定(`.env`)

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | なし | 未設定ならデモモード |
| `APP_BASE_URL` | `http://localhost:3000` | ブラウザでアクセスするURL。リダイレクト URI は `${APP_BASE_URL}/auth/callback` |
| `PORT` | `3000` | ホスト側の公開ポート(変える場合は `APP_BASE_URL` とリダイレクト URI も合わせる) |
| `TZ` | `Asia/Tokyo` | 日付の区切りに使うタイムゾーン |
| `DEMO_MODE` | 自動 | `true` で常にデモデータ |
| `CACHE_TTL_SECONDS` | `300` | API 結果のキャッシュ秒数 |

## セキュリティについて

- 1人がローカルで使う前提です。アクセストークン/リフレッシュトークンは Docker ボリューム `backend-data` の `token.json` に保存され、**アクセスできる人は誰でもそのアカウントのデータを閲覧できます**。インターネットに公開しないでください。
- 要求するスコープは読み取り専用のみです。
- トークンを完全に消すには画面の「接続解除」を押すか、`docker compose down -v` でボリュームごと削除してください。

## 開発

### デモデータでの動作確認

ログイン後の画面ではデモデータは使いません。画面を試したいときは、デモモードの別インスタンスを 3001 番で起動します(本番の 3000 番やトークンには影響しません)。

```bash
DEMO_MODE=true PORT=3001 docker compose -p health-dashboard-demo up -d --build
# 終わったら
docker compose -p health-dashboard-demo down -v
```

### ローカル実行

```bash
# backend
cd backend && pip install -r requirements.txt
DATA_DIR=./.data uvicorn app.main:app --reload

# frontend (別ターミナル。/api と /auth は localhost:8000 にプロキシされる)
cd frontend && npm install && npm run dev
```

フロントエンドを `npm run dev` で動かす場合、`APP_BASE_URL=http://localhost:5173` にし、リダイレクト URI に `http://localhost:5173/auth/callback` も追加してください。

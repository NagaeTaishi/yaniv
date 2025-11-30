FROM node:20-alpine

# アプリ用ディレクトリを作成
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm install

# アプリのソースをコピー
COPY . .

# Viteの開発サーバーが待ち受けるポート
EXPOSE 5173

# Vite開発サーバーを起動（ホストマシンからアクセス可能にするため--hostオプションを追加）
CMD ["npm", "run", "dev", "--", "--host"]

FROM node:20-alpine

# アプリ用ディレクトリを作成
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm install

# アプリのソースをコピー
COPY . .

# サーバーが待ち受けるポート
EXPOSE 3000

# アプリ起動コマンド
CMD [ "node", "server.js" ]

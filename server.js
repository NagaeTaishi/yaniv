// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }, // 開発中は全許可
  serveClient: true,
});

app.get("/", (req, res) => {
  res.send("Yaniv server is running!");
});

// HTTP endpoint for room creation
app.post("/create_room", (req, res) => {
  const roomId = uuidv4().substring(0, 8); // 短いIDにする
  rooms[roomId] = {
    id: roomId,
    players: [],
    master: null,
    deck: createDeck(),
    state: "waiting", // waiting, playing, finished
  };

  console.log(`[CREATE ROOM] New room created with ID: ${roomId}`);
  res.json({ roomId });
});

// HTTP endpoint to check if room exists
app.get("/check_room/:roomId", (req, res) => {
  console.log(`[CHECK ROOM] Checking room ${req.params.roomId}`);
  const { roomId } = req.params;
  const roomExists = !!rooms[roomId];

  if (roomExists) {
    console.log(`[CHECK ROOM] Room ${roomId} exists`);
    res.json({ exists: true, roomId });
  } else {
    console.log(`[CHECK ROOM] Room ${roomId} does not exist`);
    res.json({ exists: false });
  }
});

const PORT = 3000;

// 部屋の管理
const rooms = {};

// デッキ生成
function createDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = [
    "A", "2", "3", "4", "5", "6", "7",
    "8", "9", "10", "J", "Q", "K",
  ];
  const deck = [];
  for (let suit of suits) {
    for (let rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return shuffle(deck);
}

// デッキをシャッフル
function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

// 手札を配布
function dealHands(deck, playerCount, handSize = 5) {
  const hands = [];
  for (let i = 0; i < playerCount; i++) {
    hands.push(deck.splice(0, handSize));
  }
  return hands;
}

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // 部屋に参加
  socket.on("join_room", ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("error", "Room not found");
      return;
    }

    // すでに参加済みかチェック
    const existingPlayer = room.players.find((p) => p.id === socket.id);
    if (existingPlayer) {
      return;
    }

    // 最初のプレイヤーをマスターに設定
    if (room.players.length === 0) {
      room.master = socket.id;
    }

    room.players.push({
      id: socket.id,
      nickname: nickname,
      hand: [],
    });

    socket.join(roomId);
    socket.data.roomId = roomId; // 切断時に部屋を特定するため
    console.log(`${nickname} joined room ${roomId}`);

    // プレイヤー情報を全員に通知
    io.to(roomId).emit("players_updated", {
      players: room.players.map((p) => ({ id: p.id, nickname: p.nickname })),
      master: room.master,
    });

    // 4人揃ったら自動でゲーム開始
    if (room.players.length === 4) {
      setTimeout(() => {
        startGame(roomId);
      }, 1000);
    }
  });

  // ゲーム開始（手札配布）
  socket.on("start_game", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("error", "Room not found");
      return;
    }

    // マスターのみがゲームを開始できる
    if (room.master !== socket.id) {
      socket.emit("error", "Only the master can start the game");
      return;
    }

    // 3人以上必要
    if (room.players.length < 3) {
      socket.emit("error", "Need at least 3 players to start");
      return;
    }

    startGame(roomId);
  });

  // 切断
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    const roomId = socket.data.roomId;

    if (roomId && rooms[roomId]) {
      const room = rooms[roomId];
      room.players = room.players.filter((p) => p.id !== socket.id);

      // マスターが退出した場合、次のプレイヤーをマスターに
      if (room.master === socket.id && room.players.length > 0) {
        room.master = room.players[0].id;
      }

      // プレイヤー情報を更新
      io.to(roomId).emit("players_updated", {
        players: room.players.map((p) => ({ id: p.id, nickname: p.nickname })),
        master: room.master,
      });

      // 部屋が空になったら削除
      if (room.players.length === 0) {
        delete rooms[roomId];
        console.log(`Room ${roomId} deleted`);
      }
    }
  });
});

// ゲーム開始処理を共通化
function startGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const hands = dealHands(room.deck, room.players.length, 5);

  room.players.forEach((player, index) => {
    player.hand = hands[index];
    io.to(player.id).emit("hand_update", player.hand);
  });

  room.state = "playing";

  io.to(roomId).emit("game_started", {
    players: room.players.map((p) => ({ id: p.id, nickname: p.nickname })),
    state: room.state,
  });

  console.log(`Game started in room ${roomId}`);
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }, // 開発中は全許可
  serveClient: true,
});

app.get("/", (req, res) => {
  res.send("Yaniv server is running!");
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

  // 部屋作成
  socket.on("create_room", (data, callback) => {
    const roomId = uuidv4();
    rooms[roomId] = {
      id: roomId,
      players: [],
      deck: createDeck(),
      state: "waiting", // waiting, playing, finished
    };

    console.log(`Room created: ${roomId}`);
    if (callback) callback({ roomId });
  });

  // 部屋に参加
  socket.on("join_room", ({ roomId, playerName }, callback) => {
    const room = rooms[roomId];
    if (!room) {
      if (callback) callback({ error: "Room not found" });
      return;
    }

    room.players.push({
      id: socket.id,
      name: playerName,
      hand: [],
    });

    socket.join(roomId);
    console.log(`${playerName} joined room ${roomId}`);

    if (callback) callback({ success: true });

    // 状態を全員に通知
    io.to(roomId).emit("room_update", {
      players: room.players.map((p) => p.name),
      state: room.state,
    });
  });

  // ゲーム開始（手札配布）
  socket.on("start_game", ({ roomId }, callback) => {
    const room = rooms[roomId];
    if (!room) {
      if (callback) callback({ error: "Room not found" });
      return;
    }

    const hands = dealHands(room.deck, room.players.length, 5);

    room.players.forEach((player, index) => {
      player.hand = hands[index];
      io.to(player.id).emit("hand_update", player.hand); // 各プレイヤーに自分の手札を送る
    });

    room.state = "playing";

    io.to(roomId).emit("room_update", {
      players: room.players.map((p) => p.name),
      state: room.state,
    });

    if (callback) callback({ success: true });
    console.log(`Game started in room ${roomId}`);
  });

  // 切断
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.players = room.players.filter((p) => p.id !== socket.id);
      io.to(roomId).emit("room_update", {
        players: room.players.map((p) => p.name),
        state: room.state,
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

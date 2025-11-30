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

  // JOKERを2枚追加
  deck.push({ suit: "🃏", rank: "JOKER" });
  deck.push({ suit: "🃏", rank: "JOKER" });

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

// カードの値を取得
function getCardValue(rank) {
  if (rank === "A") return 1;
  if (rank === "J") return 11;
  if (rank === "Q") return 12;
  if (rank === "K") return 13;
  if (rank === "JOKER") return 0;
  return parseInt(rank);
}

// 手札の合計値を計算
function calculateHandValue(hand) {
  return hand.reduce((sum, card) => sum + getCardValue(card.rank), 0);
}

// カードセットのバリデーション
function isValidSet(cards) {
  if (cards.length === 1) return true;

  // 同じ数字のカード（2-4枚）
  const allSameRank = cards.every(card => card.rank === cards[0].rank);
  if (allSameRank && cards.length >= 2 && cards.length <= 4) {
    return true;
  }

  // 同じスートの連番（3枚以上）
  if (cards.length >= 3) {
    const sameSuit = cards.every(card => card.suit === cards[0].suit);
    if (sameSuit) {
      const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
      const cardRanks = cards.map(card => ranks.indexOf(card.rank)).sort((a, b) => a - b);
      const isSequential = cardRanks.every((rank, i) => i === 0 || rank === cardRanks[i - 1] + 1);
      if (isSequential) return true;
    }
  }

  return false;
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

  // カードを捨てる＆引くアクション
  socket.on("throw_and_pick", ({ roomId, cards, pickFrom, pickCard }) => {
    const room = rooms[roomId];
    if (!room || room.state !== "playing") {
      socket.emit("error", "Invalid game state");
      return;
    }

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) {
      socket.emit("error", "Player not found");
      return;
    }

    // 現在のプレイヤーかチェック
    if (room.currentPlayerIndex !== playerIndex) {
      socket.emit("error", "Not your turn");
      return;
    }

    // カードセットのバリデーション
    if (!isValidSet(cards)) {
      socket.emit("error", "Invalid card set");
      return;
    }

    const player = room.players[playerIndex];

    // プレイヤーが選択したカードを持っているかチェック
    const hasCards = cards.every(card =>
      player.hand.some(h => h.suit === card.suit && h.rank === card.rank)
    );

    if (!hasCards) {
      socket.emit("error", "You don't have these cards");
      return;
    }

    // カードを引く処理（捨てる前に）
    let pickedCard = null;
    if (pickFrom === 'discard' && pickCard) {
      // 直前の捨て札（lastDiscarded）から指定されたカードを引く
      if (!room.lastDiscarded || room.lastDiscarded.length === 0) {
        socket.emit("error", "No cards in last discard pile");
        return;
      }

      const discardIndex = room.lastDiscarded.findIndex(
        c => c.suit === pickCard.suit && c.rank === pickCard.rank
      );
      if (discardIndex !== -1) {
        pickedCard = room.lastDiscarded.splice(discardIndex, 1)[0];
        player.hand.push(pickedCard);
      } else {
        socket.emit("error", "Selected card not found in last discarded cards");
        return;
      }
    } else {
      // デッキから1枚引く
      if (room.deck.length > 0) {
        pickedCard = room.deck.pop();
        player.hand.push(pickedCard);
      }
    }

    // プレイヤーの手札から削除
    cards.forEach(card => {
      const index = player.hand.findIndex(h => h.suit === card.suit && h.rank === card.rank);
      if (index !== -1) {
        player.hand.splice(index, 1);
      }
    });

    // 捨て札パイルに追加し、lastDiscardedを更新
    room.discardPile.push(...cards);
    room.lastDiscarded = cards;

    // 手札の合計を更新
    player.handValue = calculateHandValue(player.hand);

    // 次のプレイヤーへ
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;

    // 全員に状態を通知
    io.to(roomId).emit("game_state_update", {
      currentPlayerIndex: room.currentPlayerIndex,
      lastDiscarded: room.lastDiscarded, // 直前に捨てられたカードのみ送る
      deckCount: room.deck.length,
    });

    // プレイヤーに手札を通知
    io.to(player.id).emit("hand_update", {
      hand: player.hand,
      handValue: player.handValue
    });

    console.log(`[ACTION] ${player.nickname} threw ${cards.length} card(s) and picked from ${pickFrom || 'deck'}`);
  });

  // Yaniv宣言
  socket.on("declare_yaniv", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.state !== "playing") {
      socket.emit("error", "Invalid game state");
      return;
    }

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) {
      socket.emit("error", "Player not found");
      return;
    }

    // 現在のプレイヤーかチェック
    if (room.currentPlayerIndex !== playerIndex) {
      socket.emit("error", "Not your turn");
      return;
    }

    const player = room.players[playerIndex];

    // 手札の合計が5以下かチェック
    if (player.handValue > 5) {
      socket.emit("error", `Cannot declare Yaniv with hand value ${player.handValue} (must be 5 or less)`);
      return;
    }

    room.yanivPlayer = player.id;
    room.state = "yaniv_declared";

    console.log(`[YANIV] ${player.nickname} declared Yaniv with hand value ${player.handValue}`);

    // 全員に通知
    io.to(roomId).emit("yaniv_declared", {
      playerId: player.id,
      playerNickname: player.nickname,
      handValue: player.handValue
    });

    // 5秒後にゲーム終了（Assafがなければ）
    room.assafTimer = setTimeout(() => {
      if (room.state === "yaniv_declared") {
        endGame(roomId, player.id, "yaniv");
      }
    }, 5000);
  });

  // Assaf宣言
  socket.on("declare_assaf", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.state !== "yaniv_declared") {
      socket.emit("error", "Can only declare Assaf after Yaniv");
      return;
    }

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) {
      socket.emit("error", "Player not found");
      return;
    }

    const player = room.players[playerIndex];
    const yanivPlayer = room.players.find(p => p.id === room.yanivPlayer);

    // Assaf条件チェック: 手札の合計がYaniv宣言者以下
    if (player.handValue > yanivPlayer.handValue) {
      socket.emit("error", `Cannot declare Assaf. Your hand value (${player.handValue}) is higher than Yaniv player (${yanivPlayer.handValue})`);
      return;
    }

    // Assafタイマーをクリア
    if (room.assafTimer) {
      clearTimeout(room.assafTimer);
      room.assafTimer = null;
    }

    console.log(`[ASSAF] ${player.nickname} declared Assaf with hand value ${player.handValue}`);

    // ゲーム終了
    endGame(roomId, player.id, "assaf");
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

// ゲーム終了処理
function endGame(roomId, winnerId, winType) {
  const room = rooms[roomId];
  if (!room) return;

  // Assafタイマーをクリア
  if (room.assafTimer) {
    clearTimeout(room.assafTimer);
    room.assafTimer = null;
  }

  room.state = "finished";

  // 全員の手札を公開
  const results = room.players.map(p => ({
    id: p.id,
    nickname: p.nickname,
    hand: p.hand,
    handValue: p.handValue,
    isWinner: p.id === winnerId,
    winType: p.id === winnerId ? winType : null
  }));

  room.gameResult = {
    winnerId,
    winType,
    results
  };

  // 全員に結果を通知
  io.to(roomId).emit("game_ended", room.gameResult);

  const winner = room.players.find(p => p.id === winnerId);
  console.log(`[GAME END] ${winner.nickname} won by ${winType}`);
}

// ゲーム開始処理を共通化
function startGame(roomId, startPlayerIndex = 0) {
  const room = rooms[roomId];
  if (!room) return;

  // デッキを再生成（新しいゲーム用）
  room.deck = createDeck();
  room.discardPile = []; // 捨て札
  room.currentPlayerIndex = startPlayerIndex; // 現在のターンのプレイヤー
  room.yanivPlayer = null; // Yaniv宣言したプレイヤー
  room.assafTimer = null; // Assafタイマー
  room.gameResult = null; // ゲーム結果

  // 最初のカードを捨て札として配置
  const firstCard = room.deck.pop();
  room.lastDiscarded = [firstCard]; // 直前の捨て札
  room.discardPile.push(firstCard);

  const hands = dealHands(room.deck, room.players.length, 5);

  room.players.forEach((player, index) => {
    player.hand = hands[index];
    player.handValue = calculateHandValue(player.hand);
    io.to(player.id).emit("hand_update", {
      hand: player.hand,
      handValue: player.handValue
    });
  });

  room.state = "playing";

  // 全員にゲーム開始を通知（手札の値は送らない）
  io.to(roomId).emit("game_started", {
    players: room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname
    })),
    currentPlayerIndex: room.currentPlayerIndex,
    state: room.state,
    lastDiscarded: room.lastDiscarded,
    deckCount: room.deck.length,
  });

  console.log(`[GAME START] Game started in room ${roomId}, starting player: ${room.players[startPlayerIndex].nickname}`);
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = window.location.origin;

interface Card {
  suit: string;
  rank: string;
}

interface Player {
  id: string;
  nickname: string;
  handValue?: number;
}

interface GamePlayer extends Player {
  hand: Card[];
  handValue: number;
  isWinner: boolean;
  winType: string | null;
}

type GameState = 'waiting' | 'playing' | 'yaniv_declared' | 'finished';

function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  // Nickname setup
  const [nickname, setNickname] = useState('');
  const [nicknameSet, setNicknameSet] = useState(false);

  // Waiting room state
  const [players, setPlayers] = useState<Player[]>([]);
  const [isMaster, setIsMaster] = useState(false);
  const [canStart, setCanStart] = useState(false);

  // Game state
  const [gameState, setGameState] = useState<GameState>('waiting');
  const [hand, setHand] = useState<Card[]>([]);
  const [handValue, setHandValue] = useState(0);
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [deckCount, setDeckCount] = useState(0);
  const [lastDiscarded, setLastDiscarded] = useState<Card[]>([]);
  const [selectedDiscardCard, setSelectedDiscardCard] = useState<Card | null>(null);
  const [pickMode, setPickMode] = useState<'deck' | 'discard' | null>(null);

  // Yaniv/Assaf state
  const [yanivPlayer, setYanivPlayer] = useState<string | null>(null);
  const [assafTimer, setAssafTimer] = useState(5);

  // Game result
  const [gameResult, setGameResult] = useState<{
    winnerId: string;
    winType: string;
    results: GamePlayer[];
  } | null>(null);

  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!roomId) {
      navigate('/');
      return;
    }

    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('error', (message: string) => {
      setError(message);
      setTimeout(() => setError(''), 5000);
    });

    // Waiting room events
    socket.on('players_updated', (data: { players: Player[], master: string }) => {
      setPlayers(data.players);
      setIsMaster(socket.id === data.master);
      setCanStart(data.players.length >= 3);
    });

    // Game events
    socket.on('game_started', (data: {
      players: Player[];
      currentPlayerIndex: number;
      state: string;
      lastDiscarded: Card[];
      deckCount: number;
    }) => {
      setGameState('playing');
      setPlayers(data.players);
      setCurrentPlayerIndex(data.currentPlayerIndex);
      setLastDiscarded(data.lastDiscarded);
      setDeckCount(data.deckCount);
    });

    socket.on('hand_update', (data: { hand: Card[], handValue: number }) => {
      setHand(data.hand);
      setHandValue(data.handValue);
      setSelectedCards([]);
    });

    socket.on('game_state_update', (data: {
      currentPlayerIndex: number;
      lastDiscarded: Card[];
      deckCount: number;
    }) => {
      setCurrentPlayerIndex(data.currentPlayerIndex);
      setLastDiscarded(data.lastDiscarded);
      setDeckCount(data.deckCount);
    });

    socket.on('yaniv_declared', (data: {
      playerId: string;
      playerNickname: string;
      handValue: number;
    }) => {
      setGameState('yaniv_declared');
      setYanivPlayer(data.playerId);

      // Start countdown
      let timeLeft = 5;
      setAssafTimer(timeLeft);
      const interval = setInterval(() => {
        timeLeft--;
        setAssafTimer(timeLeft);
        if (timeLeft <= 0) {
          clearInterval(interval);
        }
      }, 1000);
    });

    socket.on('game_ended', (data: {
      winnerId: string;
      winType: string;
      results: GamePlayer[];
    }) => {
      setGameState('finished');
      setGameResult(data);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId, navigate]);

  const handleSetNickname = () => {
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }

    if (socketRef.current) {
      socketRef.current.emit('join_room', {
        roomId,
        nickname: nickname.trim()
      });
      setNicknameSet(true);
      setError('');
    }
  };

  const handleStartGame = () => {
    if (socketRef.current && isMaster && canStart) {
      socketRef.current.emit('start_game', { roomId });
    }
  };

  const handleCardClick = (card: Card) => {
    const isSelected = selectedCards.some(c => c.suit === card.suit && c.rank === card.rank);
    if (isSelected) {
      setSelectedCards(selectedCards.filter(c => !(c.suit === card.suit && c.rank === card.rank)));
    } else {
      setSelectedCards([...selectedCards, card]);
    }
  };

  const handleThrowCards = () => {
    if (selectedCards.length === 0) {
      setError('Please select at least one card to throw');
      return;
    }
    setPickMode('deck');
  };

  const handlePickFromDeck = () => {
    if (socketRef.current && selectedCards.length > 0) {
      socketRef.current.emit('throw_and_pick', {
        roomId,
        cards: selectedCards,
        pickFrom: 'deck'
      });
      setPickMode(null);
      setSelectedDiscardCard(null);
    }
  };

  const handlePickFromDiscard = () => {
    if (socketRef.current && selectedCards.length > 0 && selectedDiscardCard) {
      socketRef.current.emit('throw_and_pick', {
        roomId,
        cards: selectedCards,
        pickFrom: 'discard',
        pickCard: selectedDiscardCard
      });
      setPickMode(null);
      setSelectedDiscardCard(null);
    }
  };

  const handleDiscardCardClick = (card: Card) => {
    setSelectedDiscardCard(card);
  };

  const handleYaniv = () => {
    if (socketRef.current) {
      socketRef.current.emit('declare_yaniv', { roomId });
    }
  };

  const handleAssaf = () => {
    if (socketRef.current) {
      socketRef.current.emit('declare_assaf', { roomId });
    }
  };

  const handleNextGame = () => {
    if (socketRef.current && gameResult) {
      const winnerIndex = players.findIndex(p => p.id === gameResult.winnerId);
      socketRef.current.emit('start_game', { roomId });
      setGameResult(null);
      setYanivPlayer(null);
    }
  };

  const handleCopyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isMyTurn = () => {
    return socketRef.current && players[currentPlayerIndex]?.id === socketRef.current.id;
  };

  const canDeclareYaniv = () => {
    return isMyTurn() && handValue <= 5;
  };

  const canDeclareAssaf = () => {
    return gameState === 'yaniv_declared' && yanivPlayer !== socketRef.current?.id;
  };

  const getCardColor = (suit: string) => {
    if (suit === '♥' || suit === '♦') return 'red';
    if (suit === '🃏') return '#9C27B0'; // Purple for JOKER
    return 'black';
  };

  const getCardDisplay = (card: Card) => {
    if (card.rank === 'JOKER') return card.suit; // Just show the joker emoji
    return `${card.rank}${card.suit}`;
  };

  // Render nickname input
  if (!nicknameSet) {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', textAlign: 'center' }}>
        <h1>Join Room</h1>
        <p>Room ID: {roomId}</p>
        <div style={{ marginTop: '40px' }}>
          <input
            type="text"
            placeholder="Enter your nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSetNickname()}
            style={{
              padding: '10px',
              fontSize: '16px',
              width: '100%',
              maxWidth: '300px',
              marginBottom: '10px',
              borderRadius: '5px',
              border: '1px solid #ccc'
            }}
          />
          <br />
          <button onClick={handleSetNickname} style={{
            padding: '15px 30px',
            fontSize: '18px',
            cursor: 'pointer',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            width: '100%',
            maxWidth: '300px'
          }}>
            Enter Room
          </button>
        </div>
        {error && <p style={{ color: 'red', marginTop: '20px' }}>{error}</p>}
      </div>
    );
  }

  // Render game result
  if (gameState === 'finished' && gameResult) {
    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
        <h1 style={{ textAlign: 'center' }}>Game Over!</h1>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h2>Winner: {gameResult.results.find(p => p.isWinner)?.nickname}</h2>
          <p>Victory Type: {gameResult.winType.toUpperCase()}</p>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <h3>Final Hands:</h3>
          {gameResult.results.map((player) => (
            <div
              key={player.id}
              style={{
                border: player.isWinner ? '3px solid gold' : '1px solid #ccc',
                borderRadius: '8px',
                padding: '15px',
                marginBottom: '15px',
                backgroundColor: player.isWinner ? '#fffacd' : 'white'
              }}
            >
              <div style={{ marginBottom: '10px' }}>
                <strong>{player.nickname}</strong>
                {player.isWinner && ' 👑'}
                <span style={{ float: 'right' }}>Value: {player.handValue}</span>
              </div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {player.hand.map((card, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #333',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      color: getCardColor(card.suit)
                    }}
                  >
                    {getCardDisplay(card)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center' }}>
          {isMaster && (
            <button
              onClick={handleNextGame}
              style={{
                padding: '15px 40px',
                fontSize: '20px',
                cursor: 'pointer',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '5px'
              }}
            >
              Start Next Game
            </button>
          )}
        </div>
      </div>
    );
  }

  // Render game in progress
  if (gameState === 'playing' || gameState === 'yaniv_declared') {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2>Yaniv Game - Room: {roomId}</h2>
          <p>Deck: {deckCount} cards remaining</p>
        </div>

        {/* Players info */}
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap' }}>
          {players.map((player, idx) => (
            <div
              key={player.id}
              style={{
                padding: '10px',
                border: currentPlayerIndex === idx ? '3px solid #4CAF50' : '1px solid #ccc',
                borderRadius: '5px',
                backgroundColor: currentPlayerIndex === idx ? '#e8f5e9' : 'white',
                minWidth: '150px',
                margin: '5px'
              }}
            >
              <strong>{player.nickname}</strong>
              {player.id === socketRef.current?.id && ' (You)'}
              {currentPlayerIndex === idx && <div>👉 Current Turn</div>}
            </div>
          ))}
        </div>

        {/* Last discarded cards */}
        {lastDiscarded.length > 0 && (
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <p>Last Discarded ({lastDiscarded.length} card{lastDiscarded.length > 1 ? 's' : ''}):</p>
            <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {lastDiscarded.map((card, idx) => {
                const isSelected = selectedDiscardCard?.suit === card.suit && selectedDiscardCard?.rank === card.rank;
                return (
                  <div
                    key={idx}
                    onClick={() => pickMode === 'deck' && handleDiscardCardClick(card)}
                    style={{
                      padding: '10px 15px',
                      border: isSelected ? '3px solid #2196F3' : '2px solid #333',
                      borderRadius: '5px',
                      backgroundColor: isSelected ? '#e3f2fd' : '#f5f5f5',
                      fontSize: '18px',
                      color: getCardColor(card.suit),
                      cursor: pickMode === 'deck' ? 'pointer' : 'default',
                      opacity: pickMode === 'deck' ? 1 : 0.7,
                      userSelect: 'none'
                    }}
                  >
                    {getCardDisplay(card)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Yaniv declaration */}
        {gameState === 'yaniv_declared' && (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            backgroundColor: '#fff3cd',
            border: '2px solid #ffc107',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            <h3>⚠️ YANIV DECLARED!</h3>
            <p>Time to declare Assaf: {assafTimer} seconds</p>
            {canDeclareAssaf() && (
              <button
                onClick={handleAssaf}
                style={{
                  padding: '12px 30px',
                  fontSize: '18px',
                  cursor: 'pointer',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  marginTop: '10px'
                }}
              >
                Declare ASSAF!
              </button>
            )}
          </div>
        )}

        {/* Player's hand */}
        <div style={{ marginBottom: '20px' }}>
          <h3>Your Hand (Value: {handValue})</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px' }}>
            {hand.map((card, idx) => {
              const isSelected = selectedCards.some(c => c.suit === card.suit && c.rank === card.rank);
              return (
                <div
                  key={idx}
                  onClick={() => handleCardClick(card)}
                  style={{
                    padding: '15px 20px',
                    border: isSelected ? '3px solid #2196F3' : '2px solid #333',
                    borderRadius: '8px',
                    backgroundColor: isSelected ? '#e3f2fd' : 'white',
                    cursor: 'pointer',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: getCardColor(card.suit),
                    userSelect: 'none'
                  }}
                >
                  {getCardDisplay(card)}
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          {pickMode === null ? (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={handleThrowCards}
                disabled={!isMyTurn() || gameState !== 'playing' || selectedCards.length === 0}
                style={{
                  padding: '12px 25px',
                  fontSize: '16px',
                  cursor: isMyTurn() && gameState === 'playing' && selectedCards.length > 0 ? 'pointer' : 'not-allowed',
                  backgroundColor: isMyTurn() && gameState === 'playing' && selectedCards.length > 0 ? '#2196F3' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px'
                }}
              >
                Throw Selected Cards ({selectedCards.length})
              </button>

              <button
                onClick={handleYaniv}
                disabled={!canDeclareYaniv() || gameState !== 'playing'}
                style={{
                  padding: '12px 25px',
                  fontSize: '16px',
                  cursor: canDeclareYaniv() && gameState === 'playing' ? 'pointer' : 'not-allowed',
                  backgroundColor: canDeclareYaniv() && gameState === 'playing' ? '#FF9800' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px'
                }}
              >
                Declare YANIV (Value ≤ 5)
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', backgroundColor: '#e3f2fd', borderRadius: '8px', marginTop: '10px' }}>
              <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px' }}>
                Choose where to pick a card from:
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={handlePickFromDeck}
                  style={{
                    padding: '12px 25px',
                    fontSize: '16px',
                    cursor: 'pointer',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px'
                  }}
                >
                  Pick from Deck
                </button>

                <button
                  onClick={handlePickFromDiscard}
                  disabled={!selectedDiscardCard}
                  style={{
                    padding: '12px 25px',
                    fontSize: '16px',
                    cursor: selectedDiscardCard ? 'pointer' : 'not-allowed',
                    backgroundColor: selectedDiscardCard ? '#FF9800' : '#ccc',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px'
                  }}
                >
                  Pick from Discard ({selectedDiscardCard ? '1 selected' : 'select a card'})
                </button>

                <button
                  onClick={() => {
                    setPickMode(null);
                    setSelectedDiscardCard(null);
                  }}
                  style={{
                    padding: '12px 25px',
                    fontSize: '16px',
                    cursor: 'pointer',
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && (
            <p style={{ color: 'red', marginTop: '15px', fontWeight: 'bold' }}>{error}</p>
          )}
        </div>
      </div>
    );
  }

  // Render waiting room
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ textAlign: 'center' }}>Waiting Room</h1>
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <p style={{ fontSize: '18px' }}>
          Room ID: <strong>{roomId}</strong>
          <button
            onClick={handleCopyRoomId}
            style={{
              marginLeft: '10px',
              padding: '5px 15px',
              cursor: 'pointer',
              backgroundColor: copied ? '#4CAF50' : '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '3px'
            }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </p>
      </div>

      <div style={{ border: '1px solid #ccc', borderRadius: '5px', padding: '20px', marginBottom: '20px' }}>
        <h2>Players ({players.length}/4)</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {players.map((player) => (
            <li
              key={player.id}
              style={{ padding: '10px', borderBottom: '1px solid #eee', fontSize: '18px' }}
            >
              {player.nickname}
              {player.id === socketRef.current?.id && ' (You)'}
              {isMaster && player.id === players[0]?.id && ' (Master)'}
            </li>
          ))}
        </ul>
      </div>

      <div style={{ textAlign: 'center' }}>
        {players.length < 3 && (
          <p style={{ color: '#666', fontSize: '16px' }}>
            Waiting for players... (Need at least 3 players to start)
          </p>
        )}

        {players.length === 3 && isMaster && (
          <div>
            <p style={{ color: '#4CAF50', fontSize: '16px', marginBottom: '10px' }}>
              Ready to start! (or wait for one more player)
            </p>
            <button
              onClick={handleStartGame}
              style={{
                padding: '15px 40px',
                fontSize: '20px',
                cursor: 'pointer',
                backgroundColor: '#FF5722',
                color: 'white',
                border: 'none',
                borderRadius: '5px'
              }}
            >
              Start Game
            </button>
          </div>
        )}

        {players.length === 3 && !isMaster && (
          <p style={{ color: '#666', fontSize: '16px' }}>
            Waiting for master to start the game...
          </p>
        )}

        {players.length === 4 && (
          <p style={{ color: '#4CAF50', fontSize: '18px', fontWeight: 'bold' }}>
            Game will start automatically...
          </p>
        )}
      </div>

      {error && (
        <p style={{ color: 'red', marginTop: '20px', textAlign: 'center' }}>{error}</p>
      )}
    </div>
  );
}

export default Room;

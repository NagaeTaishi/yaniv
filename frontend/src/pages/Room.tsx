import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = window.location.origin;

interface Player {
  id: string;
  nickname: string;
}

function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [nicknameSet, setNicknameSet] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isMaster, setIsMaster] = useState(false);
  const [canStart, setCanStart] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!roomId) {
      navigate('/');
      return;
    }

    // Socket.IO接続
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    socket.on('error', (message: string) => {
      setError(message);
    });

    // プレイヤー更新イベント
    socket.on('players_updated', (data: { players: Player[], master: string }) => {
      setPlayers(data.players);
      setIsMaster(socket.id === data.master);
      setCanStart(data.players.length >= 3);
    });

    // ゲーム開始イベント
    socket.on('game_started', () => {
      // ゲーム画面への遷移（後で実装）
      console.log('Game started!');
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

  const handleCopyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!nicknameSet) {
    return (
      <div style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '20px',
        textAlign: 'center'
      }}>
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
          <button
            onClick={handleSetNickname}
            style={{
              padding: '15px 30px',
              fontSize: '18px',
              cursor: 'pointer',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              width: '100%',
              maxWidth: '300px'
            }}
          >
            Enter Room
          </button>
        </div>

        {error && (
          <p style={{ color: 'red', marginTop: '20px' }}>{error}</p>
        )}
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px'
    }}>
      <h1 style={{ textAlign: 'center' }}>Waiting Room</h1>

      <div style={{
        textAlign: 'center',
        marginBottom: '30px'
      }}>
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

      <div style={{
        border: '1px solid #ccc',
        borderRadius: '5px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <h2>Players ({players.length}/4)</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {players.map((player) => (
            <li
              key={player.id}
              style={{
                padding: '10px',
                borderBottom: '1px solid #eee',
                fontSize: '18px'
              }}
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

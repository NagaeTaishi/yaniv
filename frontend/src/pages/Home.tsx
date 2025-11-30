import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = '/api';

function Home() {
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const navigate = useNavigate();

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/create_room`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to create room');
      }

      const data = await response.json();
      navigate(`/${data.roomId}`);
    } catch (err) {
      setError('Failed to create room. Please try again.');
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!roomId.trim()) {
      setError('Please enter a room ID');
      return;
    }

    setIsJoining(true);
    setError('');

    try {
      // Check if room exists
      const response = await fetch(`${API_URL}/check_room/${roomId.trim()}`);

      if (!response.ok) {
        throw new Error('Failed to check room');
      }

      const data = await response.json();

      if (!data.exists) {
        setError(`Room "${roomId}" does not exist. Please check the room ID and try again.`);
        return;
      }

      // Room exists, navigate to it
      navigate(`/${roomId.trim()}`);
    } catch (err) {
      setError('Failed to check room. Please try again.');
      console.error(err);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      padding: '20px',
      textAlign: 'center'
    }}>
      <h1>Yaniv Card Game</h1>

      <div style={{ marginTop: '40px' }}>
        <button
          onClick={handleCreateRoom}
          disabled={isCreating || isJoining}
          style={{
            padding: '15px 30px',
            fontSize: '18px',
            cursor: isCreating || isJoining ? 'not-allowed' : 'pointer',
            backgroundColor: isCreating || isJoining ? '#cccccc' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            marginBottom: '20px',
            width: '100%',
            maxWidth: '300px',
            opacity: isCreating || isJoining ? 0.6 : 1
          }}
        >
          {isCreating ? 'Creating...' : 'Create New Room'}
        </button>
      </div>

      <div style={{ marginTop: '40px' }}>
        <h3>Or Join Existing Room</h3>
        <input
          type="text"
          placeholder="Enter Room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !isJoining && !isCreating && handleJoinRoom()}
          disabled={isCreating || isJoining}
          style={{
            padding: '10px',
            fontSize: '16px',
            width: '100%',
            maxWidth: '300px',
            marginBottom: '10px',
            borderRadius: '5px',
            border: '1px solid #ccc',
            opacity: isCreating || isJoining ? 0.6 : 1
          }}
        />
        <br />
        <button
          onClick={handleJoinRoom}
          disabled={isCreating || isJoining}
          style={{
            padding: '15px 30px',
            fontSize: '18px',
            cursor: isCreating || isJoining ? 'not-allowed' : 'pointer',
            backgroundColor: isCreating || isJoining ? '#cccccc' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            width: '100%',
            maxWidth: '300px',
            opacity: isCreating || isJoining ? 0.6 : 1
          }}
        >
          {isJoining ? 'Joining...' : 'Join Room'}
        </button>
      </div>

      {error && (
        <p style={{ color: 'red', marginTop: '20px' }}>{error}</p>
      )}
    </div>
  );
}

export default Home;

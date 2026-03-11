import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const shapeColors = ['var(--ans-red)', 'var(--ans-blue)', 'var(--ans-yellow)', 'var(--ans-green)'];

export default function GamePlayer() {
  const { pin } = useParams();
  const navigate = useNavigate();

  const [socket, setSocket] = useState(null);
  const [name, setName] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [gameState, setGameState] = useState('JOINING'); // JOINING, WAITING, QUESTION, ANSWERED, RESULT, FINISHED

  const [quizTitle, setQuizTitle] = useState('');
  const [players, setPlayers] = useState([]); // New state for lobby players
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answerResult, setAnswerResult] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [finalRank, setFinalRank] = useState(null);
  const [questionStartTime, setQuestionStartTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState('');

  // Timer logic
  useEffect(() => {
    let timer;
    if (timeLeft > 0 && (gameState === 'QUESTION' || gameState === 'PREPARING')) {
      timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [timeLeft, gameState]);

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('joined-game', () => {
      setHasJoined(true);
      setGameState('WAITING');
    });

    // Listen for new players joining the lobby, just like the host does
    newSocket.on('player-joined', (updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

    newSocket.on('player-left', (updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

    newSocket.on('game-info', ({ title }) => {
      setQuizTitle(title);
    });

    newSocket.on('error', (msg) => {
      alert(msg);
      if (msg === 'Game not found' || msg === 'Game has already started') {
        setHasJoined(false);
        setGameState('JOINING');
        navigate('/');
      }
    });

    // ... existing on('new-question'), on('answer-result'), etc.
    newSocket.on('prepare-question', (qData) => {
      setCurrentQuestion(qData);
      setGameState('PREPARING');
      setAnswerResult(null);
      setTimeLeft(5);
    });

    newSocket.on('new-question', (qData) => {
      setCurrentQuestion(qData);
      setGameState('QUESTION');
      setAnswerResult(null);
      setQuestionStartTime(Date.now());
      setTimeLeft(qData.timeLimit);
    });

    newSocket.on('answer-result', (result) => {
      setAnswerResult(result);
      setGameState('RESULT');
    });

    newSocket.on('time-up', () => {
      setGameState(prev => {
        // Only show Time's Up if they did not submit an answer in time
        if (prev === 'QUESTION') {
          return 'TIMES_UP';
        }
        return prev;
      });
    });

    newSocket.on('leaderboard-update', (board) => {
      setLeaderboard(board);
      setGameState('LEADERBOARD');
    });

    newSocket.on('game-finished', (leaderboard) => {
      setGameState('FINISHED');
      const rank = leaderboard.findIndex(p => p.socketId === newSocket.id) + 1;
      setFinalRank(rank || 'unranked');
      newSocket.disconnect();
    });

    newSocket.on('host-disconnected', () => {
      setError('The host disconnected and the game was cancelled.');
      setGameState('JOINING');
      setHasJoined(false);
    });

    newSocket.on('join-error', (msg) => {
      setError(msg);
      setGameState('JOINING');
      setHasJoined(false);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [pin, navigate]);

  // Fetch title when component mounts with a PIN
  useEffect(() => {
    if (socket && pin) {
      socket.emit('get-game-info', { pin });
    }
  }, [socket, pin]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (name.trim() && socket) {
      socket.emit('join-game', { pin, name });
    }
  };

  const submitAnswer = (index) => {
    if (socket && gameState === 'QUESTION') {
      const timeToAnswer = Date.now() - questionStartTime;
      socket.emit('submit-answer', { pin, answerIndex: index, timeToAnswer });
      setGameState('ANSWERED');
    }
  };

  if (!hasJoined || gameState === 'JOINING') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%' }}>
        <div className="glass-card" style={{ maxWidth: '400px', width: '100%' }}>
          <h2 className="title-xl" style={{ fontSize: '1.5rem', opacity: 0.8, marginBottom: '0.5rem' }}>
            Join Game
          </h2>
          <h1 className="title-xl" style={{ marginTop: 0, color: 'var(--color-secondary)' }}>
            {quizTitle || pin}
          </h1>

          {error && (
            <div className="pop-in" style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginTop: '1rem', fontSize: '0.9rem', border: '1px solid #fecaca' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleJoin} style={{ marginTop: error ? '1.5rem' : '2rem' }}>
            <input
              type="text"
              className="input-field text-center"
              placeholder="Nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={15}
              required
              autoFocus
            />
            <button type="submit" className="btn-primary">
              Join
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (gameState === 'WAITING') {
    return (
      <div className="main-content flex-col items-center justify-start min-h-screen slide-up-fade" style={{ width: '100%', paddingTop: '100px' }}>
        <h2 style={{ fontSize: '2.5rem', color: 'white', marginBottom: '0.5rem', textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
          You're in!
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1.2rem', marginBottom: '3rem', fontWeight: 500 }}>
          Waiting for the host to start the game...
        </p>
        
        <div style={{
          width: '100%',
          maxWidth: '800px',
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 'var(--radius-lg)',
          padding: '2rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '1rem' }}>
            <h3 style={{ color: 'white', fontSize: '1.5rem', margin: 0, fontWeight: 700 }}>Players in Lobby</h3>
            <span style={{ background: 'var(--color-secondary)', color: 'white', padding: '0.25rem 1rem', borderRadius: 'var(--radius-full)', fontWeight: 800, fontSize: '1.2rem' }}>
              {players.length}
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '1rem'
          }}>
            {players.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'rgba(255,255,255,0.7)', padding: '2rem 0' }}>
                You are the first one here!
              </div>
            ) : (
              players.map((p, i) => (
                <div key={i} className="pop-in" style={{
                  background: p.socketId === socket.id ? 'var(--color-primary)' : 'rgba(255,255,255,0.2)',
                  color: 'white',
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  boxShadow: p.socketId === socket.id ? '0 0 15px rgba(67, 56, 202, 0.6)' : 'none',
                  border: p.socketId === socket.id ? '2px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  transition: 'all 0.3s'
                }}>
                  {p.name} {p.socketId === socket.id && <span style={{ fontSize: '0.8rem', opacity: 0.8, display: 'block', marginTop: '4px' }}>(You)</span>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'PREPARING') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2rem', color: 'white', marginBottom: '2rem' }}>Get Ready!</h2>
        <div style={{
          width: '120px', height: '120px', borderRadius: '50%', border: '8px solid white',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
          fontSize: '4rem', fontWeight: 800, color: 'white'
        }}>
          {timeLeft}
        </div>
        <p style={{ color: 'white', fontSize: '1.5rem', marginTop: '2rem', fontWeight: 600 }}>
          {currentQuestion?.text}
        </p>
      </div>
    );
  }

  if (gameState === 'QUESTION') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%' }}>
        <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', height: '100%', padding: '2rem' }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: 'var(--radius-md)', marginBottom: '2rem', textAlign: 'center', boxShadow: 'var(--shadow-md)', position: 'relative' }}>
            <div style={{
              position: 'absolute', left: '-20px', top: '-20px', width: '60px', height: '60px',
              borderRadius: '50%', background: 'var(--color-secondary)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800,
              boxShadow: 'var(--shadow-md)'
            }}>
              {timeLeft}
            </div>
            <h2 style={{ color: 'var(--text-main)', fontSize: '1.5rem', margin: 0 }}>
              {currentQuestion?.text}
            </h2>
          </div>

          <div style={{ marginBottom: '1.5rem', background: 'rgba(255,255,255,0.2)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'white', fontWeight: 700, marginBottom: '0.5rem' }}>
              <span>Possible Points:</span>
              <span>{Math.max(0, Math.round((currentQuestion?.points || 1000) * (0.5 + 0.5 * (timeLeft / (currentQuestion?.timeLimit || 20)))))}</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                background: 'var(--ans-green)',
                width: `${Math.max(0, (timeLeft / (currentQuestion?.timeLimit || 20)) * 100)}%`,
                transition: 'width 1s linear'
              }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', flex: 1 }}>
            {currentQuestion?.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => submitAnswer(i)}
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.05))',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  color: 'white',
                  borderRadius: 'var(--radius-lg)',
                  cursor: 'pointer',
                  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                  transition: 'all 0.3s ease',
                  transform: 'translateY(0)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  padding: '1.5rem',
                  wordBreak: 'break-word',
                  textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-5px)';
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.1))';
                  e.currentTarget.style.boxShadow = '0 12px 40px 0 rgba(0, 0, 0, 0.4)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.05))';
                  e.currentTarget.style.boxShadow = '0 8px 32px 0 rgba(0, 0, 0, 0.3)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.18)';
                }}
                onMouseDown={e => {
                  e.currentTarget.style.transform = 'translateY(2px)';
                  e.currentTarget.style.boxShadow = '0 4px 16px 0 rgba(0, 0, 0, 0.2)';
                }}
                onMouseUp={e => {
                  e.currentTarget.style.transform = 'translateY(-5px)';
                  e.currentTarget.style.boxShadow = '0 12px 40px 0 rgba(0, 0, 0, 0.4)';
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'TIMES_UP') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%', textAlign: 'center', background: 'var(--ans-orange)' }}>
        <h1 style={{ fontSize: '4rem', color: 'white', animation: 'pop-in 0.3s' }}>Time's Up!</h1>
      </div>
    );
  }

  if (gameState === 'ANSWERED') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2rem', color: 'white' }}>Waiting for others...</h2>
      </div>
    );
  }

  if (gameState === 'RESULT') {
    const isCorrect = answerResult?.isCorrect;
    return (
      <div style={{
        textAlign: 'center',
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: isCorrect ? 'var(--ans-green)' : 'var(--ans-red)',
        position: 'absolute',
        top: 0,
        left: 0,
        padding: '2rem'
      }}>
        <h1 style={{ fontSize: '4rem', color: 'white', marginBottom: '1rem', animation: 'pop-in 0.3s' }}>
          {isCorrect ? 'Correct!' : 'Incorrect'}
        </h1>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem 2rem', borderRadius: 'var(--radius-full)', marginBottom: '2rem' }}>
          <span style={{ fontSize: '1.5rem', color: 'white', fontWeight: 700 }}>
            Score: {answerResult?.currentScore}
          </span>
        </div>
        {!isCorrect && typeof answerResult?.correctAnswer === 'number' && currentQuestion?.options && (
          <div className="glass-card slide-up-fade" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', padding: '1.5rem', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: 600 }}>The correct answer was:</h3>
            <p style={{ color: 'white', fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
              {currentQuestion.options[answerResult.correctAnswer]}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (gameState === 'LEADERBOARD') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%' }}>
        <div className="glass-card" style={{ maxWidth: '500px', width: '100%', margin: '0 auto', textAlign: 'center' }}>
          <h1 className="title-xl" style={{ marginBottom: '2rem' }}>Top 5 Players</h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {leaderboard.map((p, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '1rem',
                background: p.socketId === socket.id ? 'var(--color-primary)' : 'white', // Highlight the current player if they are in the top 5
                color: p.socketId === socket.id ? 'white' : 'var(--text-main)',
                borderRadius: 'var(--radius-md)',
                fontWeight: 700,
                fontSize: '1.25rem'
              }}>
                <span>{i + 1}. {p.name} {p.socketId === socket.id ? '(You)' : ''}</span>
                <span>{p.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'FINISHED') {
    const rankClass = finalRank === 1 ? 'podium-1' : finalRank === 2 ? 'podium-2' : finalRank === 3 ? 'podium-3' : '';

    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%' }}>
        <div className={`glass-card ${rankClass}`} style={{ maxWidth: '500px', width: '100%', margin: '0 auto', textAlign: 'center', transition: 'all 0.3s' }}>
          <h1 className="title-xl">Game Over</h1>
          <div style={{ margin: '2rem 0', fontSize: '1.5rem', fontWeight: 700 }}>
            Your Rank: <span style={{ fontSize: '3rem', display: 'block', color: rankClass ? 'inherit' : 'var(--color-primary)' }}>{finalRank}</span>
          </div>
          <button onClick={() => navigate('/')} className="btn-primary" style={{ background: rankClass ? 'rgba(0,0,0,0.2)' : '' }}>
            Play Again
          </button>
        </div>
      </div>
    );
  }

  return null;
}

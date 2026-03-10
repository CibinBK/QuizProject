import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import { Copy } from 'lucide-react';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_URL = `${SOCKET_URL}/api`;

export default function GameHost() {
  const { pin: quizId } = useParams();
  const navigate = useNavigate();

  // Use a ref so startGame/showLeaderboard always get the LIVE socket, not a stale closure
  const socketRef = useRef(null);
  const gamePinRef = useRef('');

  const [gameState, setGameState] = useState('INIT');
  const [gamePin, setGamePin] = useState('');
  const [players, setPlayers] = useState([]);
  const [quizDetails, setQuizDetails] = useState(null);

  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answersCount, setAnswersCount] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [copied, setCopied] = useState(false);

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

  // Fetch Quiz & Connect Socket
  useEffect(() => {
    const initGame = async () => {
      try {
        const token = sessionStorage.getItem('token');
        if (!token) {
          return navigate('/dashboard');
        }

        const newSocket = io(SOCKET_URL);
        socketRef.current = newSocket; // Store in ref immediately

        const response = await axios.get(`${API_URL}/quizzes/${quizId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = response.data;
        setQuizDetails(data);

        // Once socket is connected AND quiz is fetched, create game
        const createGameAction = () => {
          newSocket.emit('create-game', {
            quizId: data.id,
            quizTitle: data.title,
            questions: data.questions
          });
        };

        if (newSocket.connected) {
          createGameAction();
        } else {
          newSocket.once('connect', createGameAction);
        }

        newSocket.on('game-created', ({ pin }) => {
          gamePinRef.current = pin; // Store in ref too
          setGamePin(pin);
          setGameState('LOBBY');
        });

        newSocket.on('player-joined', (updatedPlayers) => {
          setPlayers(updatedPlayers);
        });

        newSocket.on('player-left', (updatedPlayers) => {
          setPlayers(updatedPlayers);
        });

        newSocket.on('prepare-question', ({ text, timeLimit }) => {
          setCurrentQuestion({ text, timeLimit });
          setAnswersCount(0);
          setGameState('PREPARING');
          setTimeLeft(5);
        });

        newSocket.on('new-question', (qData) => {
          setCurrentQuestion(qData);
          setGameState('QUESTION');
          setTimeLeft(qData.timeLimit);
        });

        newSocket.on('player-answered', () => {
          setAnswersCount(prev => prev + 1);
        });

        newSocket.on('leaderboard-update', (board) => {
          setLeaderboard(board);
          setGameState('LEADERBOARD');
        });

        newSocket.on('time-up', () => {
          setGameState('LEADERBOARD');
        });

        newSocket.on('game-finished', (finalBoard) => {
          setLeaderboard(finalBoard);
          setGameState('FINISHED');
          newSocket.disconnect();
        });

      } catch (err) {
        console.error('Failed to init game', err);
        alert('Could not start game. Check console.');
        navigate('/dashboard');
      }
    };

    initGame();
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
    // eslint-disable-next-line
  }, [quizId]);

  // These use refs so they always have the live socket & pin
  const startGame = () => {
    const s = socketRef.current;
    const pin = gamePinRef.current;
    if (s && pin) {
      s.emit('next-question', { pin });
    }
  };

  const showLeaderboard = () => {
    const s = socketRef.current;
    const pin = gamePinRef.current;
    if (s && pin) {
      s.emit('show-leaderboard', { pin });
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(gamePinRef.current);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (gameState === 'INIT') return (
    <div className="main-content flex-col items-center justify-center min-h-screen">
      <div style={{ color: 'var(--text-muted)', fontSize: '1.5rem', fontWeight: 600 }}>Loading Game...</div>
    </div>
  );

  if (gameState === 'LOBBY') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen text-center slide-up-fade" style={{ width: '100%', padding: '2rem' }}>
        <div className="glass-card" style={{ maxWidth: '800px', margin: '0 auto', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>Join at</h2>
          <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '2rem' }}>QuizZz!</h1>

          <div style={{ background: '#f8fafc', padding: '2rem', borderRadius: 'var(--radius-lg)', marginBottom: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Game PIN:</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative' }}>
              <h1 style={{ fontSize: '5rem', letterSpacing: '4px', margin: 0 }}>{gamePin}</h1>
              <button
                onClick={handleCopy}
                style={{ background: 'white', border: '2px solid #e2e8f0', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}
                title="Copy PIN"
              >
                <Copy size={24} />
              </button>
              {copied && (
                <div className="pop-in" style={{
                  position: 'absolute',
                  right: '-100px',
                  background: 'var(--ans-green)',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  boxShadow: '0 4px 10px rgba(22, 101, 52, 0.2)'
                }}>
                  Copied!
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, background: 'var(--color-primary)', color: 'white', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)' }}>
              {players.length} Players
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => navigate('/dashboard')}
                className="btn-primary"
                style={{ width: 'auto', padding: '1rem 2rem', fontSize: '1.25rem', background: 'white', color: 'var(--ans-red)', border: '2px solid var(--ans-red)', boxShadow: 'none' }}
              >
                Cancel
              </button>
              <button
                onClick={startGame}
                className="btn-primary"
                style={{ width: 'auto', padding: '1rem 3rem', fontSize: '1.5rem', background: players.length > 0 ? 'var(--ans-green)' : 'var(--text-muted)', boxShadow: players.length > 0 ? '0 6px 0 #166534' : 'none' }}
                disabled={players.length === 0}
              >
                Start Quiz
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center', maxWidth: '800px', margin: '0 auto' }}>
          {players.map((p, i) => (
            <div key={i} style={{
              background: 'rgba(255, 255, 255, 0.9)',
              padding: '0.75rem 1.5rem',
              borderRadius: 'var(--radius-full)',
              fontWeight: 700,
              fontSize: '1.25rem',
              boxShadow: 'var(--shadow-sm)',
              animation: 'floatIn 0.3s ease-out'
            }}>
              {p.name}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (gameState === 'PREPARING') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%' }}>
        <div className="glass-card" style={{ maxWidth: '800px', width: '100%', textAlign: 'center' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '2rem', color: 'var(--text-muted)' }}>Get Ready!</h2>
          <h1 style={{ fontSize: '3rem', marginBottom: '2rem' }}>{currentQuestion?.text}</h1>
          <div style={{
            width: '100px',
            height: '100px',
            borderRadius: '50%',
            border: '8px solid var(--color-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
            fontSize: '3rem',
            fontWeight: 800,
            color: 'var(--color-secondary)'
          }}>
            {timeLeft}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%' }}>
        <div style={{ width: '100%', maxWidth: '1000px', textAlign: 'center' }}>
          <div className="glass-card" style={{ marginBottom: '2rem', position: 'relative', background: 'white', padding: '3rem', maxWidth: '100%' }}>
            <div style={{
              position: 'absolute',
              left: '30px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '90px', height: '90px', borderRadius: '50%', background: 'var(--color-secondary)',
              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 900,
              boxShadow: 'var(--shadow-md)'
            }}>
              {timeLeft}
            </div>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0 80px', lineHeight: 1.2, color: 'var(--text-main)' }}>
              {currentQuestion?.text}
            </h2>
            <button onClick={showLeaderboard} className="btn-primary" style={{ width: 'auto', position: 'absolute', right: '30px', top: '50%', transform: 'translateY(-50%)', padding: '0.75rem 1.5rem', background: 'var(--color-primary)', fontSize: '1.1rem' }}>
              Next
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
            {currentQuestion?.options?.map((opt, i) => (
              <div key={i} className="glass-card" style={{
                background: 'var(--color-primary)',
                color: 'white',
                textAlign: 'left',
                padding: '1.5rem',
                fontSize: '1.5rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '1rem'
              }}>
                <span style={{ opacity: 0.7 }}>{String.fromCharCode(65 + i)}:</span>
                {opt}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '2.5rem', fontWeight: 800, boxShadow: 'var(--shadow-md)' }}>
                {answersCount}
              </div>
              <p style={{ marginTop: '0.5rem', fontSize: '1.2rem', fontWeight: 700, color: 'white' }}>Answers Received</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'LEADERBOARD' || gameState === 'FINISHED') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%' }}>
        <div className="glass-card" style={{ maxWidth: '600px', width: '100%', margin: '0 auto', textAlign: 'center' }}>
          <h1 className="title-xl" style={{ marginBottom: '2rem' }}>
            {gameState === 'FINISHED' ? 'Final Podium' : 'Leaderboard'}
          </h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
            {leaderboard.map((p, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '1rem 1.5rem',
                background: i === 0 ? '#FEF08A' : 'white', // Gold for 1st
                borderRadius: 'var(--radius-md)',
                fontWeight: 700,
                fontSize: '1.25rem'
              }}>
                <span>{i + 1}. {p.name}</span>
                <span>{p.score}</span>
              </div>
            ))}
          </div>

          {gameState === 'LEADERBOARD' ? (
            <button onClick={startGame} className="btn-primary">
              Next Question
            </button>
          ) : (
            <button onClick={() => navigate('/dashboard')} className="btn-primary">
              Back to Dashboard
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

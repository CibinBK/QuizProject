import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Rocket, Zap, Trophy } from 'lucide-react';
import io from 'socket.io-client';
import Confetti from 'react-confetti';

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
  const [streak, setStreak] = useState(0);
  const [isJoining, setIsJoining] = useState(false);
  const [modal, setModal] = useState(null); // { title, message, type, onClose }
  const [buzzerWinner, setBuzzerWinner] = useState(null); // { name, isCorrect }
  const [buzzerStatus, setBuzzerStatus] = useState('IDLE'); // IDLE, PRESSED, LOCKED
  const [hasBuzzerRound, setHasBuzzerRound] = useState(false);
  const [lastCorrectAnswer, setLastCorrectAnswer] = useState(null);
  const [reopenToast, setReopenToast] = useState(false);
  const [buzzerResult, setBuzzerResult] = useState(null);
  const [nextSectionName, setNextSectionName] = useState('');
  const [showSectionLeaderboard, setShowSectionLeaderboard] = useState(false);
  const [isFirstSectionIntermission, setIsFirstSectionIntermission] = useState(false);
  const [timerKey, setTimerKey] = useState(0); // increment to force timer restart
  
  const [burstedBubbles, setBurstedBubbles] = useState(new Set());
  const [bubbleResets, setBubbleResets] = useState({});

  const handleBurst = (id) => {
    if (burstedBubbles.has(id)) return;
    setBurstedBubbles(prev => new Set(prev).add(id));
    setTimeout(() => {
      setBurstedBubbles(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      setBubbleResets(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    }, 400); // Match animation duration exactly
  };

  // Timer logic
  useEffect(() => {
    let timer;
    if ((gameState === 'QUESTION' || gameState === 'PREPARING') && !buzzerWinner) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 0) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState, buzzerWinner, timerKey]);

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('joined-game', ({ name: joinedName }) => {
      setHasJoined(true);
      setGameState('WAITING');
      setIsJoining(false);
      if (joinedName) setName(joinedName);
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
      setModal({
        title: 'Error',
        message: msg,
        type: 'error',
        onClose: () => {
          if (msg === 'Game not found' || msg === 'Game has already started') {
            setHasJoined(false);
            setGameState('ERROR'); // Dedicated error state
          }
        }
      });
    });

    newSocket.on('host-disconnected', () => {
      setGameState('ERROR');
      setModal({
        title: 'Game Over',
        message: 'The host has disconnected. Returning to home...',
        type: 'error'
      });
    });

    // ... existing on('new-question'), on('answer-result'), etc.
    newSocket.on('show-rules', ({ hasBuzzerRound } = {}) => {
      setHasBuzzerRound(!!hasBuzzerRound);
      setGameState('RULES');
    });

    newSocket.on('prepare-question', (qData) => {
      setCurrentQuestion(qData);
      setGameState('PREPARING');
      setAnswerResult(null);
      setBuzzerWinner(null); // Reset buzzer winner for the next question
      setTimerKey(k => k + 1); // force timer restart
      setTimeLeft(qData.readTime || 5);
    });

    newSocket.on('new-question', (qData) => {
      setCurrentQuestion(qData);
      setGameState('QUESTION');
      setAnswerResult(null);
      setQuestionStartTime(Date.now());
      setBuzzerWinner(null);
      setBuzzerStatus('IDLE');
      setBuzzerResult(null);
      setTimerKey(k => k + 1); // force timer restart
      setTimeLeft(qData.timeLimit);
    });

    newSocket.on('buzzer-winner', ({ name: playerWhoBuzzed, avatar }) => {
      setBuzzerWinner({ name: playerWhoBuzzed, isCorrect: null, avatar });
    });

    newSocket.on('buzzer-submission-result', ({ playerName, isCorrect }) => {
      setBuzzerWinner({ name: playerName, isCorrect });
      setBuzzerResult({ playerName, isCorrect }); // For non-winner players to see
    });

    newSocket.on('buzzer-reset', ({ wasWrong } = {}) => {
      setBuzzerWinner(null);
      setBuzzerStatus('IDLE');
      if (wasWrong) {
        setReopenToast(true);
        setTimeout(() => setReopenToast(false), 3000);
      }
    });

    newSocket.on('section-intermission', ({ sectionName, topPlayers, showLeaderboard, isFirstSection }) => {
      setNextSectionName(sectionName || 'Next Round');
      setLeaderboard(topPlayers || []);
      setShowSectionLeaderboard(!!showLeaderboard);
      setIsFirstSectionIntermission(!!isFirstSection);
      setGameState('SECTION_INTERMISSION');
    });

    newSocket.on('answer-result', (result) => {
      setAnswerResult(result);
      setStreak(result.streak || 0); // Upate the streak directly from the backend
      setGameState('RESULT');
    });

    newSocket.on('time-up', ({ correctAnswer } = {}) => {
      setLastCorrectAnswer(correctAnswer || null);
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
      setIsJoining(false);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [pin, navigate]);

  // Handle buzzer-pressed notification specifically to update local player status
  useEffect(() => {
    if (!socket || !buzzerWinner) return;
    if (buzzerWinner.name === name) {
      setBuzzerStatus('PRESSED');
    } else {
      setBuzzerStatus('LOCKED');
    }
  }, [buzzerWinner, name, socket]);

  // Fetch title when component mounts with a PIN
  useEffect(() => {
    if (socket && pin) {
      socket.emit('get-game-info', { pin });
    }
  }, [socket, pin]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (name.trim() && socket && !isJoining) {
      setError('');
      setIsJoining(true);
      socket.emit('join-game', { pin, name });
    }
  };

  const pressBuzzer = () => {
    if (socket && gameState === 'QUESTION' && buzzerStatus === 'IDLE') {
      socket.emit('buzzer-pressed', { pin });
    }
  };

  const [typedAnswer, setTypedAnswer] = useState('');

  const submitAnswer = (index, text = null) => {
    if (socket && gameState === 'QUESTION') {
      const timeToAnswer = Date.now() - questionStartTime;
      socket.emit('submit-answer', { pin, answerIndex: index, submittedText: text, timeToAnswer });
      setGameState('ANSWERED');
      setTypedAnswer('');
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
            <button type="submit" className="btn-primary" disabled={isJoining} style={{ opacity: isJoining ? 0.7 : 1, cursor: isJoining ? 'not-allowed' : 'pointer' }}>
              {isJoining ? 'Joining...' : 'Join'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (gameState === 'WAITING') {
    return (
      <div className="main-content flex-col items-center justify-start min-h-screen slide-up-fade" style={{ width: '100%', paddingTop: '80px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}>
          <h2 style={{ fontSize: '2.5rem', color: 'white', marginBottom: '0.5rem', textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
            You're in!
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1.2rem', marginBottom: '1rem', fontWeight: 500 }}>
            See your avatar below. Try popping it! Wait for the host to start.
          </p>
          <span style={{ display: 'inline-block', background: 'var(--color-secondary)', color: 'white', padding: '0.5rem 1.5rem', borderRadius: 'var(--radius-full)', fontWeight: 800, fontSize: '1.2rem', boxShadow: 'var(--shadow-md)' }}>
            {players.length} Player{players.length !== 1 ? 's' : ''} here
          </span>
        </div>

        {/* Floating Interactive Bubbles Container */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, overflow: 'hidden' }}>
          {players.map((p, i) => {
            const isBurst = burstedBubbles.has(p.socketId);
            
            // Generate a random seed based on their socketId once so it stays consistent but unique
            const avatarSeed = p.socketId; 

            // Calculate staggered, randomized bottom-to-top floating paths
            const delay = (i * 0.7) % 5;
            const duration = 8 + (i % 6);
            const leftPos = 10 + ((i * 37) % 80); // spread across 10% to 90%
            
            return (
              <div 
                key={`${p.socketId}-${bubbleResets[p.socketId] || 0}`}
                onClick={() => handleBurst(p.socketId)}
                style={{
                  position: 'absolute',
                  left: `${leftPos}%`,
                  bottom: `-150px`, 
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  animation: `floatBottomUp ${duration}s linear ${delay}s infinite`,
                  zIndex: p.socketId === socket.id ? 10 : 1
                }}
              >
                <div className={isBurst ? 'bubble-pop' : ''} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <div style={{
                    width: p.socketId === socket.id ? '100px' : '80px',
                    height: p.socketId === socket.id ? '100px' : '80px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.2)',
                    backdropFilter: 'blur(5px)',
                    border: p.socketId === socket.id ? '4px solid var(--ans-green)' : '2px solid rgba(255,255,255,0.4)',
                    boxShadow: p.socketId === socket.id ? '0 0 20px rgba(34, 197, 94, 0.6)' : '0 8px 16px rgba(0,0,0,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    padding: '10px'
                  }}>
                    <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${avatarSeed}`} alt="avatar" style={{ width: '100%', height: '100%' }} />
                  </div>
                  <div style={{
                    marginTop: '0.5rem',
                    background: p.socketId === socket.id ? 'var(--color-primary)' : 'rgba(0,0,0,0.5)',
                    color: 'white',
                    padding: '0.25rem 0.75rem',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    whiteSpace: 'nowrap',
                    boxShadow: 'var(--shadow-sm)'
                  }}>
                    {p.name} {p.socketId === socket.id ? '(You)' : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (gameState === 'RULES') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%', textAlign: 'center' }}>
        <div className="glass-card" style={{ maxWidth: '800px', width: '100%', padding: '3rem' }}>
          <h1 className="title-xl" style={{ marginBottom: '2rem', fontSize: '2.5rem' }}>How to Play <span style={{ color: 'var(--ans-yellow)' }}>&</span> Win</h1>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '3rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', background: 'rgba(255,255,255,0.6)', padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ background: '#e0f2fe', pading: '1rem', borderRadius: '50%', color: 'var(--ans-blue)' }}>
                <Rocket size={32} style={{ margin: '1rem' }} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 800 }}>Speed is Key</h3>
                <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  You get more points the faster you answer correctly. Don't hesitate!
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', background: 'rgba(255,255,255,0.6)', padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ background: '#ffedd5', pading: '1rem', borderRadius: '50%', color: 'var(--ans-yellow)' }}>
                <Zap size={32} style={{ margin: '1rem' }} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 800 }}>Build Your Streak</h3>
                <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  Answer multiple questions correctly in a row to build a Streak. A high Streak multiplies your score!
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', background: 'rgba(255,255,255,0.6)', padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ background: '#fce7f3', pading: '1rem', borderRadius: '50%', color: 'var(--ans-red)' }}>
                <Trophy size={32} style={{ margin: '1rem' }} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 800 }}>Podium Finish</h3>
                <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  The top 3 players at the end of the game will take their place on the podium. Good luck!
                </p>
              </div>
            </div>

            {hasBuzzerRound && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', background: 'rgba(236, 72, 153, 0.12)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '2px solid rgba(236, 72, 153, 0.3)' }}>
                <div style={{ background: '#fce7f3', borderRadius: '50%', color: '#be185d', flexShrink: 0 }}>
                  <Zap size={32} style={{ margin: '1rem' }} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 800, color: '#be185d' }}>Buzzer Round!</h3>
                  <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                    This quiz has a Buzzer round! Be the <strong>fastest finger</strong> — slam the buzzer before anyone else, then type your answer. One player answers at a time, and the host decides if it's correct!
                  </p>
                </div>
              </div>
            )}
          </div>

          <div style={{ background: 'var(--color-primary)', color: 'white', padding: '1rem 2rem', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ margin: 0, fontSize: '1.5rem', animation: 'pulse-glow 2s infinite' }}>Waiting for Host to start...</h3>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'PREPARING') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%', textAlign: 'center', padding: '2rem' }}>
        <h2 style={{ fontSize: '2rem', color: 'white', marginBottom: '2rem' }}>Get Ready!</h2>
        <div style={{
          width: '100px', height: '100px', borderRadius: '50%', border: '6px solid white',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
          fontSize: '3rem', fontWeight: 800, color: 'white'
        }}>
          {timeLeft}
        </div>
        <p style={{ color: 'white', fontSize: '1.5rem', marginTop: '2rem', fontWeight: 600 }}>
          {currentQuestion?.text}
        </p>
        {currentQuestion?.imageUrl && (
          <div style={{ marginTop: '2rem', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', background: 'white', padding: '0.5rem', maxWidth: '100%' }}>
            <img src={currentQuestion.imageUrl} alt="Question" style={{ maxWidth: '100%', maxHeight: '250px', objectFit: 'contain', borderRadius: '8px' }} />
          </div>
        )}
      </div>
    );
  }

  if (gameState === 'SECTION_INTERMISSION') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen" style={{ width: '100%', background: 'linear-gradient(135deg, #1e1b4b, #312e81, #4c1d95)', textAlign: 'center', padding: '2rem', position: 'relative', overflow: 'hidden' }}>
        {/* Animated background blobs */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(99,102,241,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(139,92,246,0.3) 0%, transparent 50%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)', padding: '0.5rem 1.5rem', borderRadius: 'var(--radius-full)', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1.5rem', animation: 'pop-in 0.4s ease-out' }}>
            {isFirstSectionIntermission ? 'Round Begins 🎯' : 'Round Complete ✓'}
          </div>

          <div style={{ animation: 'pop-in 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.15s both' }}>
            <h1 style={{ fontSize: 'clamp(2rem, 8vw, 4rem)', fontWeight: 900, color: 'white', margin: '0 0 0.5rem', lineHeight: 1.1 }}>
              Get Ready for
            </h1>
            <h2 style={{ fontSize: 'clamp(2.5rem, 9vw, 5rem)', fontWeight: 900, color: '#a5b4fc', margin: '0 0 2.5rem', textShadow: '0 0 40px rgba(165,180,252,0.5)' }}>
              {nextSectionName}
            </h2>
          </div>

          {/* Top 3 current scores - only shown for middle sections */}
          {showSectionLeaderboard && leaderboard?.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '20px', padding: '1.25rem', animation: 'slideUpFade 0.5s ease-out 0.35s both' }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Leaderboard</div>
              {leaderboard.slice(0, 3).map((p, i) => (
                <div key={p.socketId || i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: '10px', background: i === 0 ? 'rgba(250,204,21,0.15)' : 'rgba(255,255,255,0.04)', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>{['🥇','🥈','🥉'][i]}</span>
                  <span style={{ flex: 1, textAlign: 'left', color: 'white', fontWeight: 700, fontSize: '1rem' }}>{p.name}</span>
                  <span style={{ color: i === 0 ? '#facc15' : 'rgba(255,255,255,0.75)', fontWeight: 900, fontSize: '1.1rem' }}>{p.score?.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pulse" style={{ marginTop: '2rem', color: 'rgba(255,255,255,0.6)', fontSize: '1rem', fontWeight: 600, animation: 'pulse-glow 1.5s infinite' }}>
            Waiting for host to start next round...
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'QUESTION') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%', position: 'relative' }}>
        
        {/* Streak Indicator */}
        {streak > 1 && (
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'linear-gradient(135deg, #facc15, #ca8a04)',
            color: 'white',
            padding: '0.5rem 1rem',
            borderRadius: 'var(--radius-full)',
            fontWeight: 800,
            fontSize: '1.2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: '0 0 15px rgba(250, 204, 21, 0.5)',
            animation: 'pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }}>
            <Zap size={20} fill="currentColor" color="white" />
            Streak {streak}x
          </div>
        )}

        <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', height: '100%', padding: '2rem' }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', textAlign: 'center', boxShadow: 'var(--shadow-md)', position: 'relative' }}>
            <div style={{
              position: 'absolute', left: '-15px', top: '-15px', width: '50px', height: '50px',
              borderRadius: '50%', background: 'var(--color-secondary)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 800,
              boxShadow: 'var(--shadow-md)'
            }}>
              {timeLeft}
            </div>
            <h2 style={{ color: 'var(--text-main)', fontSize: '1.25rem', margin: 0 }}>
              {currentQuestion?.text}
            </h2>
            {currentQuestion?.imageUrl && (
              <div style={{ marginTop: '1rem', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                <img src={currentQuestion.imageUrl} alt="Question" style={{ maxWidth: '100%', maxHeight: '150px', objectFit: 'contain' }} />
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1rem', background: 'rgba(255,255,255,0.2)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'white', fontWeight: 700, marginBottom: '0.5rem', fontSize: '0.9rem' }}>
              <span>Points:</span>
              <span>{Math.max(0, Math.round((currentQuestion?.points ?? 1000) * (0.5 + 0.5 * (timeLeft / (currentQuestion?.timeLimit ?? 20)))))}</span>
            </div>
            <div style={{ width: '100%', height: '6px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                background: 'var(--ans-green)',
                width: `${Math.max(0, (timeLeft / (currentQuestion?.timeLimit || 20)) * 100)}%`,
                transition: 'width 1s linear'
              }} />
            </div>
          </div>

          {currentQuestion?.type === 'BUZZER' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              {buzzerStatus === 'IDLE' && (
                <button
                  onClick={pressBuzzer}
                  className="pulse"
                  style={{
                    width: '250px',
                    height: '250px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 30% 30%, #ec4899, #be185d)',
                    border: '10px solid rgba(255,255,255,0.2)',
                    color: 'white',
                    fontSize: '2.5rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow: '0 20px 40px rgba(190, 24, 93, 0.4), inset 0 2px 10px rgba(255,255,255,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textTransform: 'uppercase',
                    letterSpacing: '2px',
                    transition: 'transform 0.1s, box-shadow 0.1s'
                  }}
                  onMouseDown={e => e.currentTarget.style.transform = 'scale(0.9) translateY(10px)'}
                  onMouseUp={e => e.currentTarget.style.transform = 'scale(1) translateY(0)'}
                >
                  Buzzer!
                </button>
              )}

              {buzzerStatus === 'PRESSED' && (
                <div className="glass-card slide-up-fade" style={{ background: 'white', padding: '2rem', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
                  <Zap size={48} color="var(--ans-yellow)" fill="var(--ans-yellow)" style={{ marginBottom: '1rem' }} />
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '1.5rem' }}>QUICK! TYPE ANSWER</h3>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Answer..."
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    style={{ fontSize: '1.5rem', textAlign: 'center', border: '2px solid var(--ans-blue)' }}
                    autoFocus
                  />
                  <button
                    onClick={() => submitAnswer(-1, typedAnswer)}
                    className="btn-primary"
                    style={{ background: 'var(--ans-green)', marginTop: '1rem' }}
                  >
                    Submit
                  </button>
                </div>
              )}

              {buzzerStatus === 'LOCKED' && (
                <div className="glass-card slide-up-fade" style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.2)', width: '100%', maxWidth: '400px' }}>
                  {!buzzerResult ? (
                    <>
                      <div style={{ fontSize: '1.25rem', color: 'white', fontWeight: 600, opacity: 0.8, marginBottom: '0.5rem' }}>Buzzer Locked!</div>
                      <div style={{ fontSize: '2rem', color: 'white', fontWeight: 900 }}>{buzzerWinner?.name} is answering...</div>
                      <div style={{ marginTop: '1.5rem', color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' }}>Stand by...</div>
                    </>
                  ) : (
                    <div style={{ animation: 'pop-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                      <div style={{
                        width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto 1rem',
                        background: buzzerResult.isCorrect ? 'var(--ans-green)' : 'var(--ans-red)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '2.5rem', boxShadow: buzzerResult.isCorrect ? '0 0 30px rgba(34, 197, 94, 0.5)' : '0 0 30px rgba(239, 68, 68, 0.5)'
                      }}>
                        {buzzerResult.isCorrect ? '✓' : '✕'}
                      </div>
                      <div style={{ fontSize: '1.5rem', color: 'white', fontWeight: 800, marginBottom: '0.5rem' }}>
                        {buzzerResult.playerName}
                      </div>
                      <div style={{
                        fontSize: '1.25rem', fontWeight: 700,
                        color: buzzerResult.isCorrect ? '#86efac' : '#fca5a5'
                      }}>
                        {buzzerResult.isCorrect ? 'Got it correct! 🎉' : 'Got it wrong!'}
                      </div>
                      {buzzerResult.isCorrect && (
                        <div style={{ marginTop: '0.75rem', color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
                          Moving to leaderboard...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : currentQuestion?.type === 'TYPE_ANSWER' ? (
            <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                type="text"
                className="input-field text-center"
                placeholder="Type your answer here..."
                value={typedAnswer}
                onChange={(e) => setTypedAnswer(e.target.value)}
                style={{ fontSize: '1.5rem', padding: '1rem' }}
                autoFocus
              />
              <button
                onClick={() => submitAnswer(-1, typedAnswer)}
                className="btn-primary"
                style={{ background: 'var(--ans-green)' }}
              >
                Submit Answer
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: currentQuestion?.type === 'TRUE_FALSE' ? '1fr' : '1fr 1fr', gap: '1rem', flex: 1 }}>
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
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    padding: '1rem',
                    wordBreak: 'break-word',
                    textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.1))';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.05))';
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reopen Toast Notification */}
        {reopenToast && (
          <div style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--ans-red)',
            color: 'white',
            padding: '1rem 2rem',
            borderRadius: 'var(--radius-full)',
            fontWeight: 800,
            fontSize: '1.1rem',
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
            zIndex: 1000,
            animation: 'pop-in 0.3s ease-out',
            whiteSpace: 'nowrap',
          }}>
            ❌ Wrong answer! Buzzer is open again — go!
          </div>
        )}
      </div>
    );
  }

  if (gameState === 'TIMES_UP') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%', textAlign: 'center', background: 'var(--ans-orange)', padding: '2rem' }}>
        <h1 style={{ fontSize: '4rem', color: 'white', animation: 'pop-in 0.3s', marginBottom: '1.5rem' }}>Time's Up!</h1>
        {lastCorrectAnswer && (
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem 2.5rem', borderRadius: 'var(--radius-lg)', animation: 'slideUpFade 0.5s ease-out 0.3s both' }}>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>The correct answer was:</div>
            <div style={{ color: 'white', fontSize: '2.5rem', fontWeight: 900 }}>{lastCorrectAnswer}</div>
          </div>
        )}
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
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem 2rem', borderRadius: 'var(--radius-full)', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.25rem', color: 'white', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Total Score</span>
            <span style={{ fontSize: '2rem', color: 'white', fontWeight: 800 }}>{answerResult?.currentScore}</span>
          </div>
          <div style={{ background: isCorrect ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)', border: '2px solid rgba(255,255,255,0.5)', padding: '1rem 2rem', borderRadius: 'var(--radius-full)', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.25rem', color: 'white', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Points Earned</span>
            <span style={{ fontSize: '2rem', color: 'white', fontWeight: 800 }}>+{answerResult?.pointsEarned || 0}</span>
          </div>
        </div>

        {answerResult?.sarcasticComment && (
          <div className="pop-in" style={{
            background: 'white',
            color: 'var(--text-main)',
            padding: '1rem 2rem',
            borderRadius: 'var(--radius-full)',
            fontSize: '1.25rem',
            fontWeight: 800,
            marginBottom: '2rem',
            boxShadow: 'var(--shadow-lg)'
          }}>
            {answerResult.sarcasticComment}
          </div>
        )}
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

  if (gameState === 'ERROR') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%', background: 'linear-gradient(135deg, var(--ans-red), var(--color-primary))' }}>
        <div className="glass-card" style={{ maxWidth: '500px', width: '100%', margin: '0 auto', textAlign: 'center', padding: '3rem' }}>
          <Zap size={64} color="white" style={{ marginBottom: '1.5rem', background: 'var(--ans-red)', padding: '15px', borderRadius: '50%' }} />
          <h1 style={{ fontSize: '2rem', color: 'var(--text-main)', marginBottom: '1rem' }}>Game Closed</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '1.1rem' }}>
            {error || "The game has either already started, doesn't exist, or the host disconnected."}
          </p>
          <button
            onClick={() => navigate('/')}
            className="btn-primary"
            style={{ background: 'var(--ans-blue)' }}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'SECTION_INTERMISSION') {
    return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%', background: 'linear-gradient(135deg, var(--color-primary), var(--ans-blue))' }}>
        <div className="glass-card" style={{ maxWidth: '500px', width: '100%', margin: '0 auto', textAlign: 'center', padding: '3rem' }}>
          <Trophy size={64} color="var(--ans-yellow)" style={{ marginBottom: '1.5rem' }} />
          <h1 style={{ fontSize: '2rem', color: 'var(--text-main)', marginBottom: '1rem' }}>Round Standings</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Wait for the host to start the next round!</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {leaderboard.slice(0, 5).map((p, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '1rem 1.5rem',
                background: p.socketId === socket.id ? 'var(--color-primary)' : 'white',
                color: p.socketId === socket.id ? 'white' : 'var(--text-main)',
                borderRadius: 'var(--radius-md)',
                fontWeight: 800,
                fontSize: '1.25rem',
                border: '1px solid #e2e8f0'
              }}>
                <span>{i + 1}. {p.name}</span>
                <span>{p.score}</span>
              </div>
            ))}
          </div>
        </div>
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
        {finalRank <= 3 && <Confetti recycle={false} numberOfPieces={300} />}
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

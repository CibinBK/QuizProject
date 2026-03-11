import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import { Copy, Rocket, Zap, Trophy, Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Confetti from 'react-confetti';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_URL = `${SOCKET_URL}/api`;

export default function GameHost() {
  const { pin: quizId } = useParams();
  const navigate = useNavigate();

  // Use a ref so startGame/showLeaderboard always get the LIVE socket, not a stale closure
  const socketRef = useRef(null);
  const gamePinRef = useRef('');

  const [gameState, setGameState] = useState('INIT'); // INIT, LOBBY, PREPARING, QUESTION, LEADERBOARD, RESULT, FINISHED, SECTION_INTERMISSION
  const [gamePin, setGamePin] = useState('');
  const [players, setPlayers] = useState([]);
  const [quizDetails, setQuizDetails] = useState(null);
  const [modal, setModal] = useState(null); // { title, message, type, onClose }

  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1);
  const [answersCount, setAnswersCount] = useState(0);
  const [liveStats, setLiveStats] = useState({}); // { 0: 50, 1: 25, ... } (percentages)
  const [leaderboard, setLeaderboard] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const [buzzerWinner, setBuzzerWinner] = useState(null); // { name, isCorrect }
  const [currentSection, setCurrentSection] = useState(null);
  const [showSectionLeaderboard, setShowSectionLeaderboard] = useState(false);
  const [isFirstSectionIntermission, setIsFirstSectionIntermission] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [hostReconnecting, setHostReconnecting] = useState(false);

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

        newSocket.on('connect', () => {
          console.log('Socket connected');
          setHostReconnecting(false);
          // If we had a game PIN, try to rejoin
          if (gamePinRef.current) {
            newSocket.emit('rejoin-host', { pin: gamePinRef.current, quizId });
          }
        });

        newSocket.on('disconnect', () => {
          console.log('Socket disconnected');
          setHostReconnecting(true);
        });

        newSocket.on('host-rejoined', (data) => {
          console.log('Host session recovered:', data);
          setHostReconnecting(false);
          setGameState(data.state);
          setCurrentQuestionIndex(data.currentQuestionIndex);
          setPlayers(data.players);
          setQuizDetails({
            id: data.quizId,
            title: data.quizTitle,
            questions: data.questions
          });
        });

        newSocket.on('rejoin-error', (msg) => {
          console.error('Rejoin failed:', msg);
          setHostReconnecting(false);
          // Only show error if we were actually expecting to rejoin
          if (gamePinRef.current) {
            setModal({
              title: 'Session Lost',
              message: 'Your hosting session expired or could not be recovered.',
              onClose: () => navigate('/dashboard')
            });
          }
        });

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

        newSocket.on('show-rules', () => {
          setGameState('RULES');
        });

        newSocket.on('prepare-question', ({ text, readTime, imageUrl }) => {
          setCurrentQuestion({ text, readTime, imageUrl });
          setAnswersCount(0);
          setGameState('PREPARING');
          setBuzzerWinner(null); // Reset buzzer winner for the next question
          setTimerKey(k => k + 1);
          setTimeLeft(readTime || 5);
        });

        newSocket.on('new-question', (qData) => {
          setCurrentQuestion(qData);
          setCurrentQuestionIndex(qData.questionIndex ?? -1);
          setLiveStats({});
          setBuzzerWinner(null);
          setGameState('QUESTION');
          setTimerKey(k => k + 1);
          setTimeLeft(qData.timeLimit);
        });

        newSocket.on('buzzer-winner', ({ name: playerWhoBuzzed, avatar }) => {
          setBuzzerWinner({ name: playerWhoBuzzed, isCorrect: null, avatar });
        });

        newSocket.on('buzzer-answer-submitted', ({ playerName, submittedText }) => {
          setBuzzerWinner(prev => prev ? { ...prev, submittedText } : { name: playerName, isCorrect: null, submittedText });
        });

        newSocket.on('buzzer-submission-result', ({ playerName, isCorrect }) => {
          setBuzzerWinner(prev => prev ? { ...prev, isCorrect } : { name: playerName, isCorrect });
        });

        newSocket.on('section-intermission', ({ sectionName, topPlayers, showLeaderboard, isFirstSection }) => {
          setCurrentSection(sectionName);
          setLeaderboard(topPlayers || []);
          setShowSectionLeaderboard(!!showLeaderboard);
          setIsFirstSectionIntermission(!!isFirstSection);
          setGameState('SECTION_INTERMISSION');
        });

        newSocket.on('player-answered', () => {
          setAnswersCount(prev => prev + 1);
        });

        newSocket.on('live-stats-update', (stats) => {
          setLiveStats(stats);
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
        setModal({
          title: 'Initialization Error',
          message: 'Could not connect to the game server or fetch quiz details. Please try again.',
          type: 'error',
          onClose: () => navigate('/dashboard')
        });
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
      if (gameState === 'LOBBY') {
        s.emit('start-rules', { pin });
      } else {
        s.emit('next-question', { pin });
      }
    }
  };

  const showLeaderboard = () => {
    const s = socketRef.current;
    const pin = gamePinRef.current;
    if (s && pin) {
      s.emit('show-leaderboard', { pin });
    }
  };

  const reopenBuzzer = () => {
    const s = socketRef.current;
    const pin = gamePinRef.current;
    if (s && pin) {
      s.emit('reopen-buzzer', { pin });
      setBuzzerWinner(null);
    }
  };

  const validateAnswer = (isCorrect) => {
    const s = socketRef.current;
    const pin = gamePinRef.current;
    if (s && pin) {
      s.emit('host-validate-answer', { pin, isCorrect });
    }
  };

  const downloadCSV = () => {
    if (leaderboard.length === 0) return;
    
    // Create CSV content
    const headers = ['Rank', 'Player Name', 'Score'];
    const rows = leaderboard.map((p, i) => [i + 1, p.name, p.score]);
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    // Create Blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Quiz-${quizDetails?.title || 'Results'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(gamePinRef.current);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render helpers
  if (gameState === 'INIT') return (
    <div className="main-content flex-col items-center justify-center min-h-screen">
      <div style={{ color: 'var(--text-muted)', fontSize: '1.5rem', fontWeight: 600 }}>Loading Game...</div>
    </div>
  );

  const renderContent = () => {
    if (gameState === 'LOBBY') {
      return (
      <div className="main-content flex-col items-center justify-center min-h-screen text-center slide-up-fade" style={{ width: '100%', padding: '2rem' }}>
        <div className="glass-card" style={{ maxWidth: '800px', margin: '0 auto', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>Join at</h2>
          <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '2rem' }}>QuizZz!</h1>

          <div style={{ background: '#f8fafc', padding: '2rem', borderRadius: 'var(--radius-lg)', marginBottom: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Game PIN:</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <div style={{ background: 'white', padding: '1rem', borderRadius: '12px', boxShadow: 'var(--shadow-sm)' }}>
                <QRCodeSVG value={`${window.location.origin}/join?pin=${gamePin}`} size={120} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative' }}>
                <h1 style={{ fontSize: 'clamp(3rem, 10vw, 5rem)', letterSpacing: '4px', margin: 0, wordBreak: 'break-all', textAlign: 'center' }}>{gamePin}</h1>
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
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, background: 'var(--color-primary)', color: 'white', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)' }}>
              {players.length} Players
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
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

    if (gameState === 'RULES') {
      return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%' }}>
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
          </div>

          <button onClick={startGame} className="btn-primary" style={{ width: '100%', padding: '1.5rem', fontSize: '1.5rem', background: 'var(--ans-green)', boxShadow: '0 6px 0 #166534' }}>
            Start First Question
          </button>
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
          {currentQuestion?.imageUrl && (
            <div style={{ marginBottom: '2rem', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', background: 'white', padding: '1rem' }}>
              <img src={currentQuestion.imageUrl} alt="Question" style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '8px' }} />
            </div>
          )}
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
          <div className="glass-card" style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem', background: 'white', padding: 'clamp(1.5rem, 4vw, 3rem)', maxWidth: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{
                width: '70px', height: '70px', borderRadius: '50%', background: 'var(--color-secondary)',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 900,
                boxShadow: 'var(--shadow-md)'
              }}>
                {timeLeft}
              </div>
              <button onClick={showLeaderboard} className="btn-primary" style={{ width: 'auto', padding: '0.75rem 1.5rem', background: 'var(--color-primary)', fontSize: '1.1rem' }}>
                {currentQuestionIndex >= (quizDetails?.questions?.length ?? Infinity) - 1 ? 'Show Leaderboard' : 'Next'}
              </button>
            </div>
            <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 800, margin: 0, lineHeight: 1.3, color: 'var(--text-main)', wordBreak: 'break-word' }}>
              {currentQuestion?.text}
            </h2>
            {currentQuestion?.imageUrl && (
              <div style={{ marginTop: '1rem', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', background: '#f8fafc', padding: '0.5rem' }}>
                <img src={currentQuestion.imageUrl} alt="Question" style={{ maxWidth: '100%', maxHeight: '250px', objectFit: 'contain', borderRadius: '8px' }} />
              </div>
            )}
          </div>

          {currentQuestion.type === 'TYPE_ANSWER' && (
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Correct Answer</h3>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'white', textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                {currentQuestion.options[0]}
              </div>
            </div>
          )}

          {currentQuestion.type === 'BUZZER' ? (
            <div style={{ margin: '2rem 0', padding: '3rem', background: 'rgba(255,255,255,0.1)', borderRadius: '24px', border: '2px dashed rgba(255,255,255,0.3)', backdropFilter: 'blur(10px)', position: 'relative' }}>
              {!buzzerWinner ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                  <div className="pulse" style={{ width: '120px', height: '120px', borderRadius: '50%', background: 'var(--ans-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(239, 68, 68, 0.5)' }}>
                    <Zap size={60} color="white" fill="white" />
                  </div>
                  <h3 style={{ fontSize: '2rem', color: 'white', fontWeight: 800 }}>Waiting for Buzzer...</h3>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', animation: 'popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                  <div style={{ fontSize: '1.5rem', color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>FASTEST FINGER:</div>
                  <div style={{ fontSize: '4rem', color: 'white', fontWeight: 900, textShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>{buzzerWinner.name}</div>
                  
                  {buzzerWinner.isCorrect === true && (
                    <div style={{ background: 'var(--ans-green)', color: 'white', padding: '0.75rem 2rem', borderRadius: 'var(--radius-full)', fontWeight: 800, fontSize: '1.5rem', boxShadow: '0 10px 20px rgba(22, 101, 52, 0.3)' }}>
                      ✓ CORRECT ANSWER!
                    </div>
                  )}

                  {buzzerWinner.isCorrect === false && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ background: 'var(--ans-red)', color: 'white', padding: '0.75rem 2rem', borderRadius: 'var(--radius-full)', fontWeight: 800, fontSize: '1.5rem', boxShadow: '0 10px 20px rgba(239, 68, 68, 0.3)' }}>
                        ✕ WRONG ANSWER
                      </div>
                      <button onClick={reopenBuzzer} className="btn-primary" style={{ background: 'white', color: 'var(--ans-red)', border: 'none', padding: '0.75rem 1.5rem' }}>
                        Reopen Buzzer
                      </button>
                    </div>
                  )}

                  {buzzerWinner.isCorrect === null && !buzzerWinner.submittedText && (
                    <div style={{ color: 'var(--ans-yellow)', fontSize: '1.25rem', fontWeight: 700, animation: 'pulse 1.5s infinite' }}>
                      TYPING ANSWER...
                    </div>
                  )}

                  {buzzerWinner.isCorrect === null && buzzerWinner.submittedText && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '600px', gap: '1.5rem', marginTop: '1rem', animation: 'slideUpFade 0.4s ease-out' }}>
                      <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: '1.5rem', width: '100%', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>They Answered:</div>
                        <div style={{ fontSize: '2rem', color: 'var(--text-main)', fontWeight: 800, wordBreak: 'break-word', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '2px dashed #e2e8f0' }}>
                          {buzzerWinner.submittedText}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--ans-green)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Correct Answer is:</div>
                        <div style={{ fontSize: '1.5rem', color: 'var(--ans-green)', fontWeight: 800 }}>
                          {currentQuestion?.options?.[0]}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', width: '100%' }}>
                        <button onClick={() => validateAnswer(true)} className="btn-primary" style={{ background: 'var(--ans-green)', border: 'none', padding: '1.25rem', fontSize: '1.25rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', boxShadow: '0 6px 0 #166534' }}>
                          Mark Correct
                        </button>
                        <button onClick={() => validateAnswer(false)} className="btn-primary" style={{ background: 'var(--ans-red)', border: 'none', padding: '1.25rem', fontSize: '1.25rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', boxShadow: '0 6px 0 #991b1b' }}>
                          Mark Incorrect
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', width: '100%', maxWidth: '1000px', marginBottom: '2rem' }}>
              {currentQuestion?.options?.map((opt, i) => {
                const bgColors = ['var(--ans-red)', 'var(--ans-blue)', 'var(--ans-yellow)', 'var(--ans-green)'];
                const baseColor = bgColors[i % 4];
                const percent = liveStats[i] || 0; // percentage chosen
                
                return (
                  <div key={i} className="glass-card" style={{
                    position: 'relative',
                    overflow: 'hidden',
                    background: 'rgba(255,255,255,0.1)',
                    color: 'white',
                    textAlign: 'left',
                    padding: '1.5rem',
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: `2px solid ${baseColor}`,
                    boxShadow: 'var(--shadow-sm)'
                  }}>
                    {/* Live Percentage Fill Background */}
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0, bottom: 0,
                      width: `${percent}%`,
                      background: baseColor,
                      opacity: 0.8,
                      transition: 'width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      zIndex: 0
                    }} />

                    {/* Option Text */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 1, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                      <span style={{ display: 'inline-block', background: 'rgba(0,0,0,0.3)', width: '30px', height: '30px', borderRadius: '50%', textAlign: 'center', lineHeight: '30px', fontSize: '1.2rem' }}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      {opt}
                    </div>

                    {/* Percentage Number Display */}
                    <div style={{ position: 'relative', zIndex: 1, fontSize: '1.5rem', fontWeight: 800, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                      {percent > 0 ? `${percent}%` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

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

    if (gameState === 'SECTION_INTERMISSION') {
      const podiumColors = ['#FEF08A', '#E2E8F0', '#FDE68A']; // Gold, Silver, Bronze
      return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%', background: 'linear-gradient(135deg, var(--color-primary), var(--ans-blue))' }}>
        <div className="glass-card" style={{ maxWidth: '800px', width: '100%', textAlign: 'center', padding: '3rem', background: 'rgba(255, 255, 255, 0.95)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '1.2rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.5rem' }}>{isFirstSectionIntermission ? 'Round Begins 🎯' : 'Round Complete ✓'}</div>
          <h1 style={{ fontSize: '4rem', fontWeight: 900, color: 'var(--color-primary)', marginBottom: '2.5rem', textShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>{currentSection}</h1>
          
          <h2 style={{ fontSize: '1.5rem', color: 'var(--text-main)', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontWeight: 800 }}>
            <Trophy size={28} color="var(--ans-yellow)" fill="var(--ans-yellow)" /> Round Standings
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '3rem' }}>
            {leaderboard.slice(0, 3).map((p, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '1.5rem 2rem',
                background: 'white',
                borderRadius: 'var(--radius-md)',
                fontWeight: 800,
                fontSize: '1.5rem',
                boxShadow: `0 8px 0 ${podiumColors[i]}`,
                transform: `scale(${1 - i * 0.05})`,
                border: `2px solid ${podiumColors[i]}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '2rem' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                  <span>{p.name}</span>
                </div>
                <span style={{ color: 'var(--color-primary)' }}>{p.score}</span>
              </div>
            ))}
          </div>

          <button onClick={startGame} className="btn-primary" style={{ width: '100%', padding: '1.5rem', fontSize: '1.5rem', background: 'var(--ans-green)', boxShadow: '0 6px 0 #166534' }}>
            Next Round
          </button>
        </div>
      </div>
    );
    }

    if (gameState === 'LEADERBOARD' || gameState === 'FINISHED') {
      return (
      <div className="main-content flex-col items-center justify-center min-h-screen slide-up-fade" style={{ width: '100%' }}>
        {gameState === 'FINISHED' && <Confetti recycle={false} numberOfPieces={500} />}
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
              {currentQuestionIndex === (quizDetails?.questions?.length - 1) ? 'Show Results' : 'Next Question'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button onClick={() => navigate('/dashboard')} className="btn-primary" style={{ background: 'white', color: 'var(--color-primary)', border: '2px solid var(--color-primary)' }}>
                Back to Dashboard
              </button>
              <button 
                onClick={downloadCSV}
                className="btn-primary" 
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--ans-green)' }}
              >
                <Download size={20} />
                Download Results
              </button>
            </div>
          )}
        </div>
      </div>
    );
    }

    return null;
  };

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh' }}>
      {hostReconnecting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(3, 7, 18, 0.9)', backdropFilter: 'blur(12px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card" style={{ textAlign: 'center', padding: '4rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', maxWidth: '500px' }}>
            <div style={{ position: 'relative', width: '80px', height: '80px', margin: '0 auto 2rem' }}>
              <Zap className="animate-pulse" size={80} color="var(--ans-yellow)" fill="var(--ans-yellow)" />
              <div style={{ position: 'absolute', inset: 0, border: '4px solid var(--ans-yellow)', borderRadius: '50%', animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite', opacity: 0.5 }}></div>
            </div>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '1rem', color: 'white' }}>Reconnecting...</h2>
            <p style={{ opacity: 0.8, fontSize: '1.2rem', color: '#cbd5e1', lineHeight: 1.6 }}>Your network connection was lost. Hang tight while we recover your session!</p>
          </div>
        </div>
      )}

      {renderContent()}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '1rem' }}>
          <div className="glass-card" style={{ maxWidth: '400px', textAlign: 'center', padding: '2.5rem' }}>
            <h3 className="title-md">{modal.title}</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>{modal.message}</p>
            <button
              onClick={() => {
                modal.onClose?.();
                setModal(null);
              }}
              className="btn-primary"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// In-memory store for active games
const activeGames = new Map();
// Structure:
//{
//  gameId: { // Usually the PIN or unique ID
//    hostSocketId: string,
//    quizId: string,
//    questions: Array,
//    players: [{ socketId, name, score, streak }],
//    currentQuestionIndex: number,
//    state: 'LOBBY' | 'QUESTION' | 'LEADERBOARD' | 'FINISHED'
//  }
//}

const generatePin = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export default function setupSockets(io) {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Host creates a game instance
    socket.on('create-game', ({ quizId, quizTitle, questions }) => {
      const pin = generatePin();
      activeGames.set(pin, {
        hostSocketId: socket.id,
        quizId,
        quizTitle,
        questions,
        players: [],
        currentQuestionIndex: -1,
        state: 'LOBBY',
      });
      // Host joins a room for this game
      socket.join(`game-${pin}`);
      socket.emit('game-created', { pin });
    });

    // Player joins a game
    socket.on('join-game', ({ pin, name }) => {
      const game = activeGames.get(pin);
      if (!game) {
        return socket.emit('join-error', 'Game not found. Please check your PIN.');
      }
      if (game.state !== 'LOBBY') {
        return socket.emit('join-error', 'Game has already started. You cannot join now.');
      }

      const playerExists = game.players.some((p) => p.name === name);
      if (playerExists) {
        return socket.emit('join-error', 'That nickname is already taken in this lobby.');
      }

      const newPlayer = { socketId: socket.id, name, score: 0, streak: 0 };
      game.players.push(newPlayer);
      socket.join(`game-${pin}`);
      
      // Notify player they joined successfully
      socket.emit('joined-game', { pin, name });
      
      // Notify host that a player joined
      io.to(game.hostSocketId).emit('player-joined', game.players);
    });

    // Provide game info (like title) before player joins
    socket.on('get-game-info', ({ pin }) => {
      const game = activeGames.get(pin);
      if (game) {
        // We'll need to store the title in activeGames during creation
        socket.emit('game-info', { title: game.quizTitle });
      } else {
        socket.emit('join-error', 'Game not found. Please check your PIN.');
      }
    });

    // Start game / Next question
    socket.on('next-question', ({ pin }) => {
      const game = activeGames.get(pin);
      if (!game || game.hostSocketId !== socket.id) return;

      game.currentQuestionIndex++;
      
      if (game.currentQuestionIndex >= game.questions.length) {
        game.state = 'FINISHED';
        const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score);
        io.to(`game-${pin}`).emit('game-finished', sortedPlayers);
        activeGames.delete(pin);
      } else {
        game.state = 'PREPARING'; // 5s reading buffer
        const currentQ = game.questions[game.currentQuestionIndex];
        
        // Notify everyone to prepare
        io.to(`game-${pin}`).emit('prepare-question', {
          questionIndex: game.currentQuestionIndex,
          text: currentQ.text,
          timeLimit: currentQ.timeLimit
        });

        // After 5 seconds, start the actual question
        setTimeout(() => {
          // Re-check if game still exists and is in preparing state (in case of disconnect)
          const updatedGame = activeGames.get(pin);
          if (!updatedGame || updatedGame.state !== 'PREPARING') return;

          updatedGame.state = 'QUESTION';
          updatedGame.questionStartTime = Date.now(); // Server-side start time for fair scoring
          updatedGame.answersReceived = new Set();
          
          io.to(`game-${pin}`).emit('new-question', {
            questionIndex: updatedGame.currentQuestionIndex,
            text: currentQ.text,
            options: currentQ.options,
            timeLimit: currentQ.timeLimit,
          });

          // Set timer for auto-transition when time runs out
          updatedGame.questionTimer = setTimeout(() => {
            const stateCheckGame = activeGames.get(pin);
            // Only force transition if still in QUESTION state
            if (stateCheckGame && stateCheckGame.state === 'QUESTION' && stateCheckGame.currentQuestionIndex === game.currentQuestionIndex) {
              stateCheckGame.state = 'LEADERBOARD';
              const sortedPlayers = [...stateCheckGame.players].sort((a, b) => b.score - a.score).slice(0, 5);
              io.to(`game-${pin}`).emit('time-up');
              // Briefly delay leaderboard to show "Time's Up"
              setTimeout(() => {
                io.to(`game-${pin}`).emit('leaderboard-update', sortedPlayers);
              }, 2000);
            }
          }, currentQ.timeLimit * 1000);

        }, 5000);
      }
    });

    // Player submits answer
    socket.on('submit-answer', ({ pin, answerIndex }) => {
      const game = activeGames.get(pin);
      if (!game || game.state !== 'QUESTION') return;

      const player = game.players.find(p => p.socketId === socket.id);
      if (!player) return;

      const currentQ = game.questions[game.currentQuestionIndex];
      const isCorrect = answerIndex === currentQ.correctAnswer;
      
      // Server-side timing for fairness
      const now = Date.now();
      const timeToAnswer = now - (game.questionStartTime || now);

      if (isCorrect) {
        const timeLimit = currentQ.timeLimit * 1000;
        // Players get more points for faster answers
        // 50% base points + 50% speed bonus
        const timeRatio = Math.max(0, (timeLimit - timeToAnswer) / timeLimit);
        const pointsEarned = Math.round((currentQ.points * 0.5) + (currentQ.points * 0.5 * timeRatio));
        
        player.score += pointsEarned;
        player.streak++;
      } else {
        player.streak = 0;
      }

      // Notify host that a player answered
      io.to(game.hostSocketId).emit('player-answered', { 
        name: player.name, 
        isCorrect 
      });
      
      // Send result back to player
      socket.emit('answer-result', { isCorrect, currentScore: player.score });

      // Track answers for auto-transition
      game.answersReceived = game.answersReceived || new Set();
      game.answersReceived.add(socket.id);

      if (game.answersReceived.size >= game.players.length && game.players.length > 0) {
        if (game.questionTimer) clearTimeout(game.questionTimer);
        
        setTimeout(() => {
          const stateCheckGame = activeGames.get(pin);
          if (stateCheckGame && stateCheckGame.state === 'QUESTION' && stateCheckGame.currentQuestionIndex === game.currentQuestionIndex) {
            stateCheckGame.state = 'LEADERBOARD';
            const sortedPlayers = [...stateCheckGame.players].sort((a, b) => b.score - a.score).slice(0, 5);
            io.to(`game-${pin}`).emit('time-up');
            setTimeout(() => {
              io.to(`game-${pin}`).emit('leaderboard-update', sortedPlayers);
            }, 2000);
          }
        }, 1000);
      }
    });

    socket.on('show-leaderboard', ({ pin }) => {
      const game = activeGames.get(pin);
      if (!game || game.hostSocketId !== socket.id) return;

      if (game.questionTimer) {
        clearTimeout(game.questionTimer);
      }

      game.state = 'LEADERBOARD';
      const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score).slice(0, 5); // Top 5
      
      io.to(`game-${pin}`).emit('leaderboard-update', sortedPlayers);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      // Clean up if a host disconnects, or remove player
      activeGames.forEach((game, pin) => {
        if (game.hostSocketId === socket.id) {
          io.to(`game-${pin}`).emit('host-disconnected');
          activeGames.delete(pin);
        } else {
          const initialLength = game.players.length;
          game.players = game.players.filter(p => p.socketId !== socket.id);
          if (game.players.length < initialLength) {
             io.to(game.hostSocketId).emit('player-left', game.players);
          }
        }
      });
    });
  });
}

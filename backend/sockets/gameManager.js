// In-memory store for active games
const activeGames = new Map();

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
        optionStats: {},
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
      const playerEntry = game.players.find((p) => p.name === name);
      
      // Handle Reconnection during Active Game
      if (game.state !== 'LOBBY') {
        if (playerEntry) {
          // Update socket ID and join room
          playerEntry.socketId = socket.id;
          socket.join(`game-${pin}`);
          
          socket.emit('joined-game', { pin, name, recovered: true, score: playerEntry.score, streak: playerEntry.streak });
          io.to(`game-${pin}`).emit('player-reconnected', { name, players: game.players });
          console.log(`Player ${name} reconnected to game ${pin}`);
          return;
        } else {
          return socket.emit('join-error', 'Game has already started. You cannot join as a new player.');
        }
      }

      // Standard Lobby Join
      if (playerEntry) {
        return socket.emit('join-error', 'That nickname is already taken in this lobby.');
      }

      const newPlayer = {
        socketId: socket.id,
        name,
        score: 0,
        streak: 0,
        hasAnswered: false,
        isCorrect: false,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name + Math.random()}`
      };
      game.players.push(newPlayer);
      socket.join(`game-${pin}`);

      io.to(`game-${pin}`).emit('player-joined', game.players);
      socket.emit('joined-game', { pin, name });
    });

    // Host rejoins an active game after disconnect
    socket.on('rejoin-host', ({ pin, quizId }) => {
      const game = activeGames.get(pin);
      if (game && game.quizId === quizId) {
        if (game.deletionTimer) {
          clearTimeout(game.deletionTimer);
          delete game.deletionTimer;
        }
        game.hostSocketId = socket.id;
        socket.join(`game-${pin}`);
        
        // Send current game state so host can resume UI
        socket.emit('host-rejoined', { 
          pin,
          state: game.state,
          currentQuestionIndex: game.currentQuestionIndex,
          players: game.players,
          quizId: game.quizId,
          quizTitle: game.quizTitle,
          questions: game.questions
        });
        
        io.to(`game-${pin}`).emit('host-reconnected');
        console.log(`Host rejoined game ${pin}`);
      } else {
        socket.emit('rejoin-error', 'Game session could not be recovered.');
      }
    });

    // Provide game info (title, etc.) before joining or as a sync
    socket.on('get-game-info', ({ pin }) => {
      const game = activeGames.get(pin);
      if (game) {
        socket.emit('game-info', { title: game.quizTitle });
      }
    });

    // Sync rules page
    socket.on('start-rules', ({ pin }) => {
      const game = activeGames.get(pin);
      if (!game || game.hostSocketId !== socket.id) return;
      game.state = 'RULES';
      const hasBuzzerRound = game.questions.some(q => q.type === 'BUZZER');
      io.to(`game-${pin}`).emit('show-rules', { hasBuzzerRound });
    });

    // Start game / Next question
    socket.on('next-question', ({ pin }) => {
      const game = activeGames.get(pin);
      if (!game || game.hostSocketId !== socket.id) return;

      const nextIdx = game.currentQuestionIndex + 1;
      
      if (nextIdx >= game.questions.length) {
        game.state = 'FINISHED';
        const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score);
        io.to(`game-${pin}`).emit('game-finished', sortedPlayers);
        activeGames.delete(pin);
        return;
      }

      const currentSec = game.currentQuestionIndex >= 0 ? game.questions[game.currentQuestionIndex].section : null;
      const nextSec = game.questions[nextIdx].section;

      // Section Intermission Logic
      // skipIntermission is set after we've already shown the intermission for this transition
      if (!game.skipIntermission && currentSec !== nextSec && nextSec) {
        game.state = 'SECTION_INTERMISSION';
        game.skipIntermission = true; // Next call will proceed straight to the question
        const top3 = [...game.players].sort((a, b) => b.score - a.score).slice(0, 3);
        const totalSections = [...new Set(game.questions.map(q => q.section))].filter(Boolean);
        const isLastSection = totalSections.indexOf(nextSec) === totalSections.length - 1;
        const isFirstSection = totalSections.indexOf(nextSec) === 0;
        io.to(`game-${pin}`).emit('section-intermission', {
          sectionName: nextSec,
          topPlayers: top3,
          showLeaderboard: !isFirstSection,
          isFirstSection
        });
        return;
      }

      // Clear the flag so future section changes still get their intermission
      game.skipIntermission = false;

      game.currentQuestionIndex++;
      game.state = 'PREPARING'; // Reading buffer
      const currentQ = game.questions[game.currentQuestionIndex];
      game.buzzerWinner = null; 
      
      io.to(`game-${pin}`).emit('prepare-question', {
        questionIndex: game.currentQuestionIndex,
        text: currentQ.text,
        readTime: currentQ.readTime,
        imageUrl: currentQ.imageUrl,
        timeLimit: currentQ.timeLimit,
        section: currentQ.section
      });

      setTimeout(() => {
        const updatedGame = activeGames.get(pin);
        if (!updatedGame || updatedGame.state !== 'PREPARING') return;

        updatedGame.state = 'QUESTION';
        updatedGame.questionStartTime = Date.now();
        updatedGame.answersReceived = new Set();
        updatedGame.optionStats = {}; 
        
        // Reset players for new question
        updatedGame.players.forEach(p => {
          p.hasAnswered = false;
          p.isCorrect = false;
        });

        io.to(`game-${pin}`).emit('new-question', {
          questionIndex: updatedGame.currentQuestionIndex,
          text: currentQ.text,
          options: currentQ.options,
          timeLimit: currentQ.timeLimit,
          points: currentQ.points,
          imageUrl: currentQ.imageUrl,
          type: currentQ.type
        });

        updatedGame.questionTimer = setTimeout(() => {
          const stateCheckGame = activeGames.get(pin);
          if (stateCheckGame && stateCheckGame.state === 'QUESTION' && stateCheckGame.currentQuestionIndex === game.currentQuestionIndex) {
            stateCheckGame.state = 'LEADERBOARD';
            // Reset streaks for anyone who didn't answer
            stateCheckGame.players.forEach(p => { if (!p.hasAnswered) p.streak = 0; });
            const sortedPlayers = [...stateCheckGame.players].sort((a, b) => b.score - a.score).slice(0, 5);
            const correctAns = currentQ.type === 'MULTIPLE_CHOICE' || currentQ.type === 'TRUE_FALSE'
              ? currentQ.options[currentQ.correctAnswer]
              : currentQ.options?.[0] || '';
            io.to(`game-${pin}`).emit('time-up', { correctAnswer: correctAns });
            setTimeout(() => {
              io.to(`game-${pin}`).emit('leaderboard-update', sortedPlayers);
            }, 2000);
          }
        }, currentQ.timeLimit * 1000);

      }, (currentQ.readTime || 5) * 1000);
    });

    // --- Phase 4: Buzzer Logic ---
    socket.on('buzzer-pressed', ({ pin }) => {
      const game = activeGames.get(pin);
      if (!game || game.state !== 'QUESTION') return;
      const currentQ = game.questions[game.currentQuestionIndex];
      if (currentQ.type !== 'BUZZER') return;
      
      if (game.buzzerWinner) return; 

      const player = game.players.find(p => p.socketId === socket.id);
      if (!player || player.hasAnswered) return;

      game.buzzerWinner = {
        socketId: socket.id,
        name: player.name,
        avatar: player.avatar
      };
      
      game.buzzerStartTime = Date.now();
      
      // Pause the backend question timer
      if (game.questionTimer) {
        clearTimeout(game.questionTimer);
        game.questionTimer = null;
        const elapsedMs = Date.now() - game.questionStartTime;
        const timeLimitMs = currentQ.timeLimit * 1000;
        game.buzzerPausedTimeLeft = Math.max(0, timeLimitMs - elapsedMs);
      }

      io.to(`game-${pin}`).emit('buzzer-winner', {
        name: player.name,
        avatar: player.avatar,
        socketId: socket.id
      });
    });

    socket.on('reopen-buzzer', ({ pin }) => {
      const game = activeGames.get(pin);
      if (!game || (game.state !== 'QUESTION' && game.state !== 'RESULT')) return;
      
      game.buzzerWinner = null;
      
      // Resume the backend timer
      if (game.buzzerPausedTimeLeft !== undefined && game.buzzerPausedTimeLeft > 0) {
        const currentQ = game.questions[game.currentQuestionIndex];
        const prevElapsed = (currentQ.timeLimit * 1000) - game.buzzerPausedTimeLeft;
        game.questionStartTime = Date.now() - prevElapsed;
        
        game.questionTimer = setTimeout(() => {
          const stateCheckGame = activeGames.get(pin);
          if (stateCheckGame && stateCheckGame.state === 'QUESTION' && stateCheckGame.currentQuestionIndex === game.currentQuestionIndex) {
            stateCheckGame.state = 'LEADERBOARD';
            stateCheckGame.players.forEach(p => { if (!p.hasAnswered) p.streak = 0; });
            const sortedPlayers = [...stateCheckGame.players].sort((a, b) => b.score - a.score).slice(0, 5);
            const correctAns = currentQ.type === 'MULTIPLE_CHOICE' || currentQ.type === 'TRUE_FALSE'
              ? currentQ.options[currentQ.correctAnswer]
              : currentQ.options?.[0] || '';
            io.to(`game-${pin}`).emit('time-up', { correctAnswer: correctAns });
            setTimeout(() => {
              io.to(`game-${pin}`).emit('leaderboard-update', sortedPlayers);
            }, 2000);
          }
        }, game.buzzerPausedTimeLeft);
        game.buzzerPausedTimeLeft = 0;
      }
      
      io.to(`game-${pin}`).emit('buzzer-reset', { wasWrong: true });
    });

    // Player submits answer
    socket.on('submit-answer', ({ pin, answerIndex, submittedText, timeToAnswer }) => {
      const game = activeGames.get(pin);
      if (!game || game.state !== 'QUESTION') return;

      const player = game.players.find(p => p.socketId === socket.id);
      if (!player || player.hasAnswered) return;

      const currentQ = game.questions[game.currentQuestionIndex];
      
      if (currentQ.type === 'BUZZER' && game.buzzerWinner?.socketId !== socket.id) {
        return; 
      }

      let isCorrect = false;
      const numMap = {
        'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
        'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
        'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
        'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17',
        'eighteen': '18', 'nineteen': '19', 'twenty': '20'
      };

      const normalize = (str) => {
        let s = str?.trim().toLowerCase() || '';
        Object.keys(numMap).forEach(word => {
          if (s === word) s = numMap[word];
        });
        return s;
      };

      if (currentQ.type === 'TYPE_ANSWER' || currentQ.type === 'BUZZER') {
        const correctText = (currentQ.options && currentQ.options[0]) || '';
        isCorrect = normalize(submittedText) === normalize(correctText);
        
        if (currentQ.type === 'BUZZER') {
          // DO NOT process points here for BUZZER. Store answer and wait for Host.
          player.hasAnswered = true;
          player.buzzerAnswer = submittedText;
          io.to(`game-${pin}`).emit('buzzer-answer-submitted', { 
            playerName: player.name, 
            submittedText 
          });
          return; // Stop here, wait for host-validate-answer
        }

      } else {
        isCorrect = answerIndex === currentQ.correctAnswer;
      }

      const now = Date.now();
      const serverTimeToAnswer = now - (game.questionStartTime || now);
      
      let pointsEarned = 0;
      let sarcasticComment = '';

      if (isCorrect) {
        const timeLimit = currentQ.timeLimit * 1000;
        const timeRatio = Math.max(0, (timeLimit - timeToAnswer) / timeLimit);
        
        const baseEarned = Math.round((currentQ.points * 0.5) + (currentQ.points * 0.5 * timeRatio));
        const streakMultiplier = Math.min(2.0, 1 + (player.streak * 0.1));
        pointsEarned = Math.round(baseEarned * streakMultiplier);

        player.score += pointsEarned;
        player.streak++;

        const successComments = [
          "Wow, Einstein is here!", "Did you hack the mainframe?", "Okay genius, calm down.", "Luck, or skill? We both know.",
          "Someone's been studying...", "Are you a wizard?", "Wait, let me double check that...", "Speed demon!",
          "Calculating... Result: Genius.", "Brain power 100%.", "Slaying the quiz!", "Okay, no need to flex.",
          "Too easy for you?", "Main character energy.", "Gold star for you!", "A legend in the making.",
          "The chosen one.", "Flawless victory.", "Big brain moves.", "Simply built different.",
          "The GOAT of quizzes.", "You're making this look easy.", "Outstanding move!", "Apex predator vibes.",
          "Photographic memory or just lucky?", "The algorithm of genius.", "Suspiciously fast.",
          "Professor called, wants their job back.", "Have you considered joining Mensa?",
          "Okay smartypants.", "The quiz fears you.", "Average players fear you.",
          "You absolute nerd. We love it.", "Show off.", "That was embarrassingly easy for you, huh?",
          "Google couldn't have done it faster.", "Not even sweating a little?", "Peak performance.",
          "Is that a brain or a supercomputer?", "The crowd goes wild!", "You're doing great, sweetie.",
          "Quiz speedrun any%", "No mistakes were made today.", "Textbook answer. Literally."
        ];
        sarcasticComment = player.streak > 2 
          ? `STREAK x${player.streak}! You're on fire!` 
          : successComments[Math.floor(Math.random() * successComments.length)];
      } else {
        player.streak = 0;
        const failComments = [
          "Did you even read the question?", "Better luck next time... maybe.", "Oops, slipped on a banana peel.", "That was certainly... an answer.",
          "The other button next time.", "Oof, that's gotta hurt.", "Is the screen on?", "Maybe try a different button?",
          "Instructions were unclear?", "F is for respect.", "It's okay, not everyone can be first.", "A for effort, F for result.",
          "Google is your friend.", "Keyboard must be broken.", "Are you playing with your eyes closed?", "Rough day?",
          "Error: Skill not found.", "Confidence: 100, Accuracy: 0.", "The math isn't mathing.", "The correct answer was... not that.",
          "Wrong. Very wrong.", "Mission failed, we'll get 'em next time.", "You'll get there... eventually.", "Technically, that's incorrect.",
          "Bold choice. Incredibly bold.", "That answer aged poorly.", "Even a random click has a 25% shot.",
          "Your future self is embarrassed for you.", "Noted. Wrong, but noted.", "The question was not that hard.",
          "Are you okay? Genuinely asking.", "Perhaps a career change is in order.",
          "We don't talk about this one.", "You tried. Bravely.", "Was that a typo, or a lifestyle?",
          "Study mode: activate.", "Maybe skip the next question too?", "At least you're consistent.",
          "In another universe, you were right.", "Wrong answer, incredible confidence.", "Sir/Ma'am... what?",
          "If wrong answers were points, you'd be winning.", "The audacity of that answer."
        ];
        sarcasticComment = failComments[Math.floor(Math.random() * failComments.length)];
      }

      player.hasAnswered = true;
      player.isCorrect = isCorrect;

      // Update Live Stats
      if (currentQ.type !== 'TYPE_ANSWER') {
        game.optionStats[answerIndex] = (game.optionStats[answerIndex] || 0) + 1;
        const totalAnswers = Object.values(game.optionStats).reduce((a, b) => a + b, 0);
        const percentageStats = {};
        Object.keys(game.optionStats).forEach(key => {
          percentageStats[key] = Math.round((game.optionStats[key] / totalAnswers) * 100);
        });
        io.to(game.hostSocketId).emit('live-stats-update', percentageStats);
      }
      
      io.to(game.hostSocketId).emit('player-answered', { name: player.name, isCorrect });
      io.to(player.socketId).emit('answer-result', { 
        isCorrect, 
        pointsEarned,
        currentScore: player.score,
        timeToAnswer: serverTimeToAnswer, 
        correctIndex: currentQ.correctAnswer, 
        streak: player.streak, 
        sarcasticComment 
      });

      const allAnswered = game.players.every(p => p.hasAnswered);
      if (allAnswered) {
        game.state = 'RESULT';
        if (game.questionTimer) clearTimeout(game.questionTimer);
        // Give players 3.5s to read their sarcastic comment before moving on
        setTimeout(() => {
          const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score);
          io.to(`game-${pin}`).emit('leaderboard-update', sortedPlayers);
        }, 3500);
      }
    });


    socket.on('host-validate-answer', ({ pin, isCorrect }) => {
      const game = activeGames.get(pin);
      if (!game || game.state !== 'QUESTION' || !game.buzzerWinner) return;

      const player = game.players.find(p => p.socketId === game.buzzerWinner.socketId);
      if (!player) return;

      const currentQ = game.questions[game.currentQuestionIndex];
      let pointsEarned = 0;
      let sarcasticComment = '';

      if (isCorrect) {
        const now = Date.now();
        const timeLimit = currentQ.timeLimit * 1000;
        const actualTime = now - game.buzzerStartTime;
        const timeRatio = Math.max(0, (timeLimit - actualTime) / timeLimit);
        
        const baseEarned = Math.round((currentQ.points * 0.5) + (currentQ.points * 0.5 * timeRatio));
        const streakMultiplier = Math.min(2.0, 1 + (player.streak * 0.1));
        pointsEarned = Math.round(baseEarned * streakMultiplier);

        player.score += pointsEarned;
        player.streak++;

        const buzzerSuccessComments = [
          "Fastest brain in the room!", "Called it before anyone else!", "That buzzer hand is built different.",
          "Reflexes of a legend.", "Speed AND accuracy? Too OP.", "Host approved. Crowd goes wild!",
          "Lightning fast and correct. Scary.", "Were you waiting with your finger ready?",
          "Buzzer supremacy achieved.", "Certified quiz hawk.", "First AND right. Disgusting (in a good way)."
        ];
        sarcasticComment = player.streak > 2
          ? `STREAK x${player.streak}! Buzzer AND brains — unstoppable!`
          : buzzerSuccessComments[Math.floor(Math.random() * buzzerSuccessComments.length)];
      } else {
        player.streak = 0;
        const buzzerFailComments = [
          "Buzzed in fast, thought slow.", "The buzzer was a bold move. The answer? Less so.",
          "Speed without knowledge is just noise.", "Host says: NOPE. Sit down.", 
          "You rang first and said THAT?", "Confidence level: 100. Accuracy: 0.",
          "Buzzing in early doesn't make you right.", "That was a swing and a miss.",
          "Someone else gets a shot now!", "First to buzz, first to flop."
        ];
        sarcasticComment = buzzerFailComments[Math.floor(Math.random() * buzzerFailComments.length)];
      }

      // Emit the result back to the player so they see the RESULT screen
      io.to(player.socketId).emit('answer-result', { 
        isCorrect, 
        pointsEarned,
        currentScore: player.score, // score is now updated above
        timeToAnswer: Date.now() - game.buzzerStartTime, 
        correctIndex: 0, 
        streak: player.streak, 
        sarcasticComment 
      });

      io.to(`game-${pin}`).emit('buzzer-submission-result', {
        playerName: player.name,
        isCorrect
      });

      const allAnswered = game.players.every(p => p.hasAnswered);
      if (allAnswered || isCorrect) {
        game.state = 'RESULT';
        if (game.questionTimer) clearTimeout(game.questionTimer);
        // Wait 3.5s so players can see the correct/wrong result before moving on
        setTimeout(() => {
          const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score);
          io.to(`game-${pin}`).emit('leaderboard-update', sortedPlayers);
        }, 3500);
      }
    });

    socket.on('show-leaderboard', ({ pin }) => {
      const game = activeGames.get(pin);
      if (!game || game.hostSocketId !== socket.id) return;
      if (game.questionTimer) clearTimeout(game.questionTimer);
      game.state = 'LEADERBOARD';
      const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score).slice(0, 5);
      io.to(`game-${pin}`).emit('leaderboard-update', sortedPlayers);
    });

    socket.on('disconnect', () => {
      activeGames.forEach((game, pin) => {
        if (game.hostSocketId === socket.id) {
          console.log(`Host disconnected from game ${pin}. Waiting for reconnection...`);
          io.to(`game-${pin}`).emit('host-reconnecting');
          
          // Grace period: wait 30s before destroying the game
          game.deletionTimer = setTimeout(() => {
            const finalCheck = activeGames.get(pin);
            if (finalCheck && finalCheck.deletionTimer === game.deletionTimer) {
              console.log(`Grace period expired for game ${pin}. Deleting.`);
              io.to(`game-${pin}`).emit('host-disconnected');
              activeGames.delete(pin);
            }
          }, 30000);
        } else {
          // If in lobby, remove player immediately so they don't block the name
          // If in active game, keep the entry so they can reconnect later
          if (game.state === 'LOBBY') {
            const initialLength = game.players.length;
            game.players = game.players.filter(p => p.socketId !== socket.id);
            if (game.players.length < initialLength) {
               io.to(`game-${pin}`).emit('player-left', game.players);
            }
          }
        }
      });
    });
  });
}

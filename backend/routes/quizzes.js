import express from 'express';
import { PrismaClient } from '@prisma/client';
import authMiddleware from '../middlewares/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all quizzes for the logged-in user (Host Dashboard)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const quizzes = await prisma.quiz.findMany({
      where: { hostId: req.userId },
      include: {
        _count: {
          select: { questions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(quizzes);
  } catch (error) {
    console.error('Fetch quizzes error:', error);
    res.status(500).json({ error: 'Failed to fetch quizzes' });
  }
});

// Get a single quiz by ID (with questions)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const quiz = await prisma.quiz.findUnique({
      where: {
        id: req.params.id,
        hostId: req.userId,
      },
      include: {
        questions: true,
      },
    });

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Parse options string to JSON for the frontend
    const formattedQuiz = {
      ...quiz,
      questions: quiz.questions.map(q => ({
        ...q,
        options: JSON.parse(q.options),
      })),
    };

    res.json(formattedQuiz);
  } catch (error) {
    console.error('Fetch single quiz error:', error);
    res.status(500).json({ error: 'Failed to fetch quiz' });
  }
});

// Create a new quiz with questions
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, questions } = req.body;

    if (!title || !questions || questions.length === 0) {
      return res.status(400).json({ error: 'Title and at least one question are required' });
    }

    const quiz = await prisma.quiz.create({
      data: {
        title,
        description,
        hostId: req.userId,
        questions: {
          create: questions.map((q) => ({
            text: q.text,
            options: JSON.stringify(q.options), // Store as string
            correctAnswer: q.correctAnswer,
            timeLimit: q.timeLimit || 20,
            points: q.points || 1000,
          })),
        },
      },
      include: { questions: true },
    });

    res.status(201).json(quiz);
  } catch (error) {
    console.error('Create quiz error:', error);
    res.status(500).json({ error: 'Failed to create quiz' });
  }
});

// Update a quiz
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, description, questions } = req.body;
    const quizId = req.params.id;

    // Verify ownership first
    const existing = await prisma.quiz.findUnique({ where: { id: quizId } });
    if (!existing || existing.hostId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Delete old questions, then re-create them
    await prisma.question.deleteMany({ where: { quizId } });

    const quiz = await prisma.quiz.update({
      where: { id: quizId },
      data: {
        title,
        description,
        questions: {
          create: questions.map((q) => ({
            text: q.text,
            options: JSON.stringify(q.options),
            correctAnswer: q.correctAnswer,
            timeLimit: q.timeLimit || 20,
            points: q.points || 1000,
          })),
        },
      },
      include: { questions: true },
    });

    res.json(quiz);
  } catch (error) {
    console.error('Update quiz error:', error);
    res.status(500).json({ error: 'Failed to update quiz' });
  }
});

// Delete a quiz
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const quizId = req.params.id;

    // Verify ownership first
    const existing = await prisma.quiz.findUnique({ where: { id: quizId } });
    if (!existing || existing.hostId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Delete questions then the quiz
    await prisma.question.deleteMany({ where: { quizId } });
    await prisma.quiz.delete({ where: { id: quizId } });

    res.json({ message: 'Quiz deleted successfully' });
  } catch (error) {
    console.error('Delete quiz error:', error);
    res.status(500).json({ error: 'Failed to delete quiz' });
  }
});

export default router;

import express from 'express';
import { PrismaClient } from '@prisma/client';
import adminAuthMiddleware from '../middlewares/adminAuth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all users (hosts)
router.get('/users', adminAuthMiddleware, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        isAdmin: true,
        createdAt: true,
        _count: {
          select: { quizzes: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Delete a user (and gracefully cascade their quizzes)
router.delete('/users/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Don't let admins delete themselves via this route as a safety precaution
    if (userId === req.userId) {
      return res.status(400).json({ error: 'Cannot delete your own admin account' });
    }

    // Prisma relation onDelete: Cascade allows deleting parent without manual child deletes
    // But we need to delete questions of the quizzes first since our schema might not have full cascading on all layers.
    // Let's do it manually just to be safe.
    
    // get user quizzes
    const quizzes = await prisma.quiz.findMany({ where: { hostId: userId } });
    const quizIds = quizzes.map(q => q.id);
    
    // delete questions inside these quizzes
    await prisma.question.deleteMany({
      where: { quizId: { in: quizIds } }
    });
    
    // delete quizzes
    await prisma.quiz.deleteMany({
      where: { hostId: userId }
    });
    
    // Finally, delete the user
    await prisma.user.delete({
      where: { id: userId }
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Update a user's details (username, role)
router.put('/users/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, isAdmin } = req.body;
    
    // Prevent admins from stripping their own admin status
    if (userId === req.userId && isAdmin === false) {
      return res.status(400).json({ error: 'Cannot remove your own admin privileges' });
    }

    const data = {};
    if (username !== undefined) data.username = username;
    if (isAdmin !== undefined) data.isAdmin = isAdmin;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        isAdmin: true,
        createdAt: true,
        _count: { select: { quizzes: true } }
      }
    });

    res.json(updatedUser);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Username already taken' });
    }
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Get ALL quizzes globally
router.get('/quizzes', adminAuthMiddleware, async (req, res) => {
  try {
    const quizzes = await prisma.quiz.findMany({
      include: {
        host: { select: { username: true } },
        _count: { select: { questions: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(quizzes);
  } catch (error) {
    console.error('Fetch global quizzes error:', error);
    res.status(500).json({ error: 'Failed to fetch quizzes' });
  }
});

// Delete ANY quiz globally
router.delete('/quizzes/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const quizId = req.params.id;

    // Delete questions then the quiz
    await prisma.question.deleteMany({ where: { quizId } });
    await prisma.quiz.delete({ where: { id: quizId } });

    res.json({ message: 'Quiz deleted successfully by Admin' });
  } catch (error) {
    console.error('Admin delete quiz error:', error);
    res.status(500).json({ error: 'Failed to delete quiz' });
  }
});

export default router;

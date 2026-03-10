import jwt from 'jwt-simple';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkahootclonekey';

const adminAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.decode(token, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if user exists and is actually an admin
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.isAdmin !== true) {
      return res.status(403).json({ error: 'Forbidden: Requires Admin Role' });
    }

    req.userId = decoded.userId;
    req.user = user;
    next();
  } catch (error) {
    console.error('Admin Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

export default adminAuthMiddleware;

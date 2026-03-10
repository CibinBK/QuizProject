import jwt from 'jwt-simple';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkahootclonekey';

const authMiddleware = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.decode(token, JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      return res.status(401).json({ error: 'User does not exist anymore. Please login again.' });
    }

    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token is not valid' });
  }
};

export default authMiddleware;

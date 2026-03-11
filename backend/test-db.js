import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Connecting to Prisma...');
  try {
    const users = await prisma.user.findMany();
    console.log('Success! Users found:', users.length);
  } catch (e) {
    console.error('Prisma connection failed:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();

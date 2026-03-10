import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const username = 'admin';
  const password = 'password';
  
  const existingAdmin = await prisma.user.findUnique({
    where: { username }
  });

  if (existingAdmin) {
    console.log('Admin account already exists.');
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const adminUser = await prisma.user.create({
    data: {
      username,
      password: hashedPassword,
      isAdmin: true,
    }
  });

  console.log(`Successfully created master admin account! Username: ${adminUser.username}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const username = 'Admin';
    const password = 'P@$$word';

    try {
        // Check if the admin user already exists
        const existingAdmin = await prisma.user.findUnique({
            where: { username },
        });

        if (existingAdmin) {
            console.log('Admin user already exists!');
            return;
        }

        // Hash password and create admin
        const hashedPassword = await bcrypt.hash(password, 10);
        const adminUser = await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                isAdmin: true,
            },
        });

        console.log(`Successfully created admin user: ${adminUser.username}`);

    } catch (error) {
        console.error('Error seeding admin user:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();

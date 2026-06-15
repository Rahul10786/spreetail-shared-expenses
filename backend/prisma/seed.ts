import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing database...');
  await prisma.importAnomaly.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.expenseSplit.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();

  console.log('Seeding users...');
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const aisha = await prisma.user.create({
    data: { name: 'Aisha', email: 'aisha@example.com', password: hashedPassword },
  });

  const rohan = await prisma.user.create({
    data: { name: 'Rohan', email: 'rohan@example.com', password: hashedPassword },
  });

  const priya = await prisma.user.create({
    data: { name: 'Priya', email: 'priya@example.com', password: hashedPassword },
  });

  const meera = await prisma.user.create({
    data: { name: 'Meera', email: 'meera@example.com', password: hashedPassword },
  });

  const dev = await prisma.user.create({
    data: { name: 'Dev', email: 'dev@example.com', password: hashedPassword },
  });

  const sam = await prisma.user.create({
    data: { name: 'Sam', email: 'sam@example.com', password: hashedPassword },
  });

  console.log('Seeding shared apartment group...');
  const group = await prisma.group.create({
    data: {
      name: 'Shared Apartment',
      description: 'Shared house expenses for Aisha, Rohan, Priya, Meera, Dev, and Sam',
      createdById: aisha.id,
    },
  });

  console.log('Seeding memberships (matching CSV join/leave bounds)...');
  const jan1 = new Date('2026-01-01T00:00:00Z');
  const feb1 = new Date('2026-02-01T00:00:00Z');
  const mar31 = new Date('2026-03-31T23:59:59Z');
  const apr1 = new Date('2026-04-01T00:00:00Z');

  // Aisha, Rohan, Priya are long-term members
  await prisma.groupMember.create({
    data: { groupId: group.id, userId: aisha.id, joinDate: jan1, isActive: true }
  });
  await prisma.groupMember.create({
    data: { groupId: group.id, userId: rohan.id, joinDate: jan1, isActive: true }
  });
  await prisma.groupMember.create({
    data: { groupId: group.id, userId: priya.id, joinDate: jan1, isActive: true }
  });

  // Meera left at the end of March
  await prisma.groupMember.create({
    data: { groupId: group.id, userId: meera.id, joinDate: jan1, leaveDate: mar31, isActive: false }
  });

  // Dev joined in February
  await prisma.groupMember.create({
    data: { groupId: group.id, userId: dev.id, joinDate: feb1, isActive: true }
  });

  // Sam joined in April
  await prisma.groupMember.create({
    data: { groupId: group.id, userId: sam.id, joinDate: apr1, isActive: true }
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

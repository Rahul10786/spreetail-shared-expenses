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
  
  const alice = await prisma.user.create({
    data: { name: 'Alice Smith', email: 'alice@example.com', password: hashedPassword },
  });

  const bob = await prisma.user.create({
    data: { name: 'Bob Jones', email: 'bob@example.com', password: hashedPassword },
  });

  const charlie = await prisma.user.create({
    data: { name: 'Charlie Brown', email: 'charlie@example.com', password: hashedPassword },
  });

  const dave = await prisma.user.create({
    data: { name: 'Dave Miller', email: 'dave@example.com', password: hashedPassword },
  });

  console.log('Seeding group...');
  const group = await prisma.group.create({
    data: {
      name: 'Apartment 4B',
      description: 'Shared expenses for the apartment roommates',
      createdById: alice.id,
    },
  });

  console.log('Seeding memberships (with dynamic dates)...');
  // Alice, Bob, Charlie join on Jan 1st, 2026
  const jan1 = new Date('2026-01-01T00:00:00Z');
  // Dave joins on Mar 1st, 2026
  const mar1 = new Date('2026-03-01T00:00:00Z');

  await prisma.groupMember.createMany({
    data: [
      { groupId: group.id, userId: alice.id, joinDate: jan1, isActive: true },
      { groupId: group.id, userId: bob.id, joinDate: jan1, isActive: true },
      { groupId: group.id, userId: charlie.id, joinDate: jan1, isActive: true },
      { groupId: group.id, userId: dave.id, joinDate: mar1, isActive: true },
    ],
  });

  console.log('Seeding expenses...');
  // Expense 1: Rent for January - Paid by Alice, split equally between Alice, Bob, Charlie (Dave not joined yet)
  const rentJan = await prisma.expense.create({
    data: {
      description: 'January Rent',
      amount: 1500,
      date: new Date('2026-01-05T00:00:00Z'),
      groupId: group.id,
      paidById: alice.id,
      splitType: 'EQUAL',
    },
  });

  await prisma.expenseSplit.createMany({
    data: [
      { expenseId: rentJan.id, userId: alice.id, amount: 500 },
      { expenseId: rentJan.id, userId: bob.id, amount: 500 },
      { expenseId: rentJan.id, userId: charlie.id, amount: 500 },
    ],
  });

  // Expense 2: Grocery split by exact amounts - Paid by Bob, split between Alice, Bob, Charlie
  const groceries = await prisma.expense.create({
    data: {
      description: 'Roommate Groceries',
      amount: 120,
      date: new Date('2026-02-10T00:00:00Z'),
      groupId: group.id,
      paidById: bob.id,
      splitType: 'EXACT',
    },
  });

  await prisma.expenseSplit.createMany({
    data: [
      { expenseId: groceries.id, userId: alice.id, amount: 50 },
      { expenseId: groceries.id, userId: bob.id, amount: 30 },
      { expenseId: groceries.id, userId: charlie.id, amount: 40 },
    ],
  });

  // Expense 3: Electricity bill in March split by percentages - Paid by Charlie, split between all 4 (since Dave is joined)
  const electricity = await prisma.expense.create({
    data: {
      description: 'March Electricity Bill',
      amount: 200,
      date: new Date('2026-03-15T00:00:00Z'),
      groupId: group.id,
      paidById: charlie.id,
      splitType: 'PERCENTAGE',
    },
  });

  await prisma.expenseSplit.createMany({
    data: [
      { expenseId: electricity.id, userId: alice.id, amount: 50, percentage: 25 },
      { expenseId: electricity.id, userId: bob.id, amount: 50, percentage: 25 },
      { expenseId: electricity.id, userId: charlie.id, amount: 50, percentage: 25 },
      { expenseId: electricity.id, userId: dave.id, amount: 50, percentage: 25 },
    ],
  });

  console.log('Seeding settlements...');
  // Bob pays Alice $200 on Feb 1st
  await prisma.settlement.create({
    data: {
      groupId: group.id,
      payFromId: bob.id,
      payToId: alice.id,
      amount: 200,
      date: new Date('2026-02-01T00:00:00Z'),
    },
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

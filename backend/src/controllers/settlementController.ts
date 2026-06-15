import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../prisma';

// Calculate group balances and suggested simplified settlements
export async function getGroupBalances(req: AuthRequest, res: Response) {
  const { groupId } = req.params;
  const userId = req.userId;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // 1. Verify user is in group
    const membership = await prisma.groupMember.findFirst({
      where: { groupId, userId },
    });

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this group.' });
    }

    // 2. Fetch all active members, expenses (with splits), and settlements
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: { splits: true },
    });

    const settlements = await prisma.settlement.findMany({
      where: { groupId },
    });

    // 3. Initialize balance ledger: balance > 0 means they are owed; balance < 0 means they owe
    const ledger: Record<string, number> = {};
    members.forEach((m) => {
      ledger[m.userId] = 0;
    });

    // Apply expenses to ledger
    expenses.forEach((expense) => {
      // Payer lent the total amount
      if (ledger[expense.paidById] !== undefined) {
        ledger[expense.paidById] += expense.amount;
      }
      
      // Each participant owes their split amount
      expense.splits.forEach((split) => {
        if (ledger[split.userId] !== undefined) {
          ledger[split.userId] -= split.amount;
        }
      });
    });

    // Apply settlements to ledger
    settlements.forEach((settlement) => {
      // Payer reduced their debt
      if (ledger[settlement.payFromId] !== undefined) {
        ledger[settlement.payFromId] += settlement.amount;
      }
      // Receiver reduced what they are owed
      if (ledger[settlement.payToId] !== undefined) {
        ledger[settlement.payToId] -= settlement.amount;
      }
    });

    // Format final balances for user convenience
    const balances = members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      balance: Number(ledger[m.userId].toFixed(2)),
      isActive: m.isActive,
    }));

    // 4. Net Mutual Debt Minimization (Simplification Algorithm)
    // Separate into creditors (> 0) and debtors (< 0)
    const creditors = balances
      .filter((b) => b.balance > 0)
      .map((b) => ({ ...b }));
    const debtors = balances
      .filter((b) => b.balance < 0)
      .map((b) => ({ ...b, balance: Math.abs(b.balance) })); // Use absolute values for matching

    const suggestedSettlements: Array<{
      fromUserId: string;
      fromName: string;
      toUserId: string;
      toName: string;
      amount: number;
    }> = [];

    // Sort to prioritize large balances (greedy matching)
    creditors.sort((a, b) => b.balance - a.balance);
    debtors.sort((a, b) => b.balance - a.balance);

    let cIdx = 0;
    let dIdx = 0;

    while (cIdx < creditors.length && dIdx < debtors.length) {
      const creditor = creditors[cIdx];
      const debtor = debtors[dIdx];

      // Settle the minimum of the two balances
      const settleAmount = Number(Math.min(creditor.balance, debtor.balance).toFixed(2));

      if (settleAmount > 0) {
        suggestedSettlements.push({
          fromUserId: debtor.userId,
          fromName: debtor.name,
          toUserId: creditor.userId,
          toName: creditor.name,
          amount: settleAmount,
        });

        // Deduct settled amount
        creditor.balance = Number((creditor.balance - settleAmount).toFixed(2));
        debtor.balance = Number((debtor.balance - settleAmount).toFixed(2));
      }

      // Move indices if balance is fully cleared
      if (creditor.balance <= 0.01) cIdx++;
      if (debtor.balance <= 0.01) dIdx++;
    }

    return res.status(200).json({
      balances,
      suggestedSettlements,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error calculating balances.' });
  }
}

// Record a Settlement
export async function createSettlement(req: AuthRequest, res: Response) {
  const { groupId } = req.params;
  const { payFromId, payToId, amount, date } = req.body;
  const userId = req.userId;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!payFromId || !payToId || !amount) {
    return res.status(400).json({ error: 'From member, to member, and amount are required.' });
  }

  const settleAmount = parseFloat(amount);
  if (isNaN(settleAmount) || settleAmount <= 0) {
    return res.status(400).json({ error: 'Settlement amount must be positive.' });
  }

  try {
    // Verify payFrom is in group
    const fromMember = await prisma.groupMember.findFirst({
      where: { groupId, userId: payFromId },
    });
    // Verify payTo is in group
    const toMember = await prisma.groupMember.findFirst({
      where: { groupId, userId: payToId },
    });

    if (!fromMember || !toMember) {
      return res.status(400).json({ error: 'Both participants must be members of the group.' });
    }

    const settlement = await prisma.settlement.create({
      data: {
        groupId,
        payFromId,
        payToId,
        amount: settleAmount,
        date: date ? new Date(date) : new Date(),
      },
      include: {
        payFrom: { select: { id: true, name: true, email: true } },
        payTo: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(201).json({ message: 'Settlement recorded successfully.', settlement });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error recording settlement.' });
  }
}

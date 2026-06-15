import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../prisma';

// Helper to check if a user is an active member of a group on a specific date
async function isMemberActiveOnDate(groupId: string, userId: string, date: Date): Promise<boolean> {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });

  if (!membership) return false;

  const expenseTime = new Date(date).getTime();
  const joinTime = new Date(membership.joinDate).getTime();
  
  if (joinTime > expenseTime) return false; // Not joined yet

  if (membership.leaveDate) {
    const leaveTime = new Date(membership.leaveDate).getTime();
    if (leaveTime < expenseTime) return false; // Already left
  }

  // Note: if the member is currently marked inactive (isActive = false) but the expense date
  // is within their historical joinDate and leaveDate, they are considered active *at that date*.
  if (!membership.isActive && !membership.leaveDate) {
    return false; // Inactive with no leave date (safeguard)
  }

  return true;
}

// Create Expense
export async function createExpense(req: AuthRequest, res: Response) {
  const { groupId } = req.params;
  const { description, amount, date, paidById, splitType, splits } = req.body;
  const userId = req.userId;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!description || !amount || !date || !paidById || !splitType || !splits || !Array.isArray(splits)) {
    return res.status(400).json({ error: 'Missing required fields or invalid splits format.' });
  }

  const expenseDate = new Date(date);
  const expenseAmount = parseFloat(amount);

  if (isNaN(expenseAmount) || expenseAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number.' });
  }

  try {
    // 1. Verify payer is active on the expense date
    const payerActive = await isMemberActiveOnDate(groupId, paidById, expenseDate);
    if (!payerActive) {
      return res.status(400).json({ error: 'Payer was not an active member of the group on the expense date.' });
    }

    // 2. Validate participants and calculate splits
    const calculatedSplits: Array<{ userId: string; amount: number; percentage?: number }> = [];
    let sumOfShares = 0;

    for (const split of splits) {
      const participantActive = await isMemberActiveOnDate(groupId, split.userId, expenseDate);
      if (!participantActive) {
        return res.status(400).json({
          error: `Participant ${split.userId} was not an active member of the group on the expense date.`,
        });
      }

      if (splitType === 'EQUAL') {
        // Equal split: we calculate the share value as amount / count
        const shareVal = Number((expenseAmount / splits.length).toFixed(2));
        calculatedSplits.push({ userId: split.userId, amount: shareVal });
      } else if (splitType === 'EXACT') {
        const shareVal = parseFloat(split.value);
        if (isNaN(shareVal) || shareVal <= 0) {
          return res.status(400).json({ error: 'Exact split values must be positive numbers.' });
        }
        calculatedSplits.push({ userId: split.userId, amount: shareVal });
        sumOfShares += shareVal;
      } else if (splitType === 'PERCENTAGE') {
        const percentageVal = parseFloat(split.value);
        if (isNaN(percentageVal) || percentageVal <= 0) {
          return res.status(400).json({ error: 'Percentage split values must be positive numbers.' });
        }
        const shareVal = Number(((percentageVal / 100) * expenseAmount).toFixed(2));
        calculatedSplits.push({ userId: split.userId, amount: shareVal, percentage: percentageVal });
        sumOfShares += percentageVal;
      }
    }

    // 3. Mathematical validation of totals
    if (splitType === 'EXACT') {
      // Allow minor floating point difference of <= 0.02 due to rounding cents
      if (Math.abs(sumOfShares - expenseAmount) > 0.02) {
        return res.status(400).json({
          error: `Sum of exact splits ($${sumOfShares.toFixed(2)}) must match the total expense amount ($${expenseAmount.toFixed(2)}).`,
        });
      }
    } else if (splitType === 'PERCENTAGE') {
      if (Math.abs(sumOfShares - 100) > 0.01) {
        return res.status(400).json({
          error: `Sum of percentages (${sumOfShares}%) must equal 100%.`,
        });
      }
    } else if (splitType === 'EQUAL') {
      // Adjust the last participant's split slightly to prevent fractional cent loss
      const calculatedSum = calculatedSplits.reduce((acc, s) => acc + s.amount, 0);
      const diff = Number((expenseAmount - calculatedSum).toFixed(2));
      if (diff !== 0 && calculatedSplits.length > 0) {
        calculatedSplits[calculatedSplits.length - 1].amount = Number(
          (calculatedSplits[calculatedSplits.length - 1].amount + diff).toFixed(2)
        );
      }
    }

    // 4. Save Expense and Splits in transaction
    const expense = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          description,
          amount: expenseAmount,
          date: expenseDate,
          groupId,
          paidById,
          splitType,
        },
      });

      // Write splits
      const splitPromises = calculatedSplits.map((s) =>
        tx.expenseSplit.create({
          data: {
            expenseId: exp.id,
            userId: s.userId,
            amount: s.amount,
            percentage: s.percentage,
          },
        })
      );
      await Promise.all(splitPromises);

      return exp;
    });

    return res.status(201).json({ message: 'Expense created successfully', expense });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error creating expense.' });
  }
}

// Update Expense
export async function updateExpense(req: AuthRequest, res: Response) {
  const { groupId, expenseId } = req.params;
  const { description, amount, date, paidById, splitType, splits } = req.body;
  const userId = req.userId;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const existingExpense = await prisma.expense.findFirst({
      where: { id: expenseId, groupId },
    });

    if (!existingExpense) {
      return res.status(404).json({ error: 'Expense not found in this group.' });
    }

    // Apply new values or fallback to existing
    const finalDescription = description || existingExpense.description;
    const finalAmount = amount !== undefined ? parseFloat(amount) : existingExpense.amount;
    const finalDate = date ? new Date(date) : existingExpense.date;
    const finalPaidById = paidById || existingExpense.paidById;
    const finalSplitType = splitType || existingExpense.splitType;

    if (isNaN(finalAmount) || finalAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number.' });
    }

    // 1. Verify payer is active on the expense date
    const payerActive = await isMemberActiveOnDate(groupId, finalPaidById, finalDate);
    if (!payerActive) {
      return res.status(400).json({ error: 'Payer was not an active member on the expense date.' });
    }

    // 2. Resolve splits. If splits body is omitted, we fetch old splits to re-calculate or re-validate
    let finalSplitsInput = splits;
    if (!finalSplitsInput) {
      const oldSplits = await prisma.expenseSplit.findMany({ where: { expenseId } });
      finalSplitsInput = oldSplits.map((s) => ({
        userId: s.userId,
        value: finalSplitType === 'PERCENTAGE' ? s.percentage : finalSplitType === 'EXACT' ? s.amount : undefined,
      }));
    }

    const calculatedSplits: Array<{ userId: string; amount: number; percentage?: number }> = [];
    let sumOfShares = 0;

    for (const split of finalSplitsInput) {
      const participantActive = await isMemberActiveOnDate(groupId, split.userId, finalDate);
      if (!participantActive) {
        return res.status(400).json({
          error: `Participant ${split.userId} was not active on the expense date.`,
        });
      }

      if (finalSplitType === 'EQUAL') {
        const shareVal = Number((finalAmount / finalSplitsInput.length).toFixed(2));
        calculatedSplits.push({ userId: split.userId, amount: shareVal });
      } else if (finalSplitType === 'EXACT') {
        const shareVal = parseFloat(split.value);
        if (isNaN(shareVal) || shareVal <= 0) {
          return res.status(400).json({ error: 'Exact split values must be positive numbers.' });
        }
        calculatedSplits.push({ userId: split.userId, amount: shareVal });
        sumOfShares += shareVal;
      } else if (finalSplitType === 'PERCENTAGE') {
        const percentageVal = parseFloat(split.value);
        if (isNaN(percentageVal) || percentageVal <= 0) {
          return res.status(400).json({ error: 'Percentage split values must be positive numbers.' });
        }
        const shareVal = Number(((percentageVal / 100) * finalAmount).toFixed(2));
        calculatedSplits.push({ userId: split.userId, amount: shareVal, percentage: percentageVal });
        sumOfShares += percentageVal;
      }
    }

    // Mathematical validation
    if (finalSplitType === 'EXACT') {
      if (Math.abs(sumOfShares - finalAmount) > 0.02) {
        return res.status(400).json({
          error: `Sum of exact splits ($${sumOfShares.toFixed(2)}) must match amount ($${finalAmount.toFixed(2)}).`,
        });
      }
    } else if (finalSplitType === 'PERCENTAGE') {
      if (Math.abs(sumOfShares - 100) > 0.01) {
        return res.status(400).json({ error: `Sum of percentages (${sumOfShares}%) must equal 100%.` });
      }
    } else if (finalSplitType === 'EQUAL') {
      const calculatedSum = calculatedSplits.reduce((acc, s) => acc + s.amount, 0);
      const diff = Number((finalAmount - calculatedSum).toFixed(2));
      if (diff !== 0 && calculatedSplits.length > 0) {
        calculatedSplits[calculatedSplits.length - 1].amount = Number(
          (calculatedSplits[calculatedSplits.length - 1].amount + diff).toFixed(2)
        );
      }
    }

    // Save changes
    const updatedExpense = await prisma.$transaction(async (tx) => {
      // 1. Delete old splits
      await tx.expenseSplit.deleteMany({ where: { expenseId } });

      // 2. Update core expense details
      const exp = await tx.expense.update({
        where: { id: expenseId },
        data: {
          description: finalDescription,
          amount: finalAmount,
          date: finalDate,
          paidById: finalPaidById,
          splitType: finalSplitType,
        },
      });

      // 3. Write new splits
      const splitPromises = calculatedSplits.map((s) =>
        tx.expenseSplit.create({
          data: {
            expenseId: exp.id,
            userId: s.userId,
            amount: s.amount,
            percentage: s.percentage,
          },
        })
      );
      await Promise.all(splitPromises);

      return exp;
    });

    return res.status(200).json({ message: 'Expense updated successfully.', expense: updatedExpense });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error updating expense.' });
  }
}

// Delete Expense
export async function deleteExpense(req: AuthRequest, res: Response) {
  const { groupId, expenseId } = req.params;
  const userId = req.userId;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, groupId },
    });

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found in this group.' });
    }

    // Allow deleting by either the payer or the group creator
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    if (expense.paidById !== userId && group.createdById !== userId) {
      return res.status(403).json({ error: 'You are not authorized to delete this expense.' });
    }

    await prisma.expense.delete({ where: { id: expenseId } });
    return res.status(200).json({ message: 'Expense deleted successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error deleting expense.' });
  }
}

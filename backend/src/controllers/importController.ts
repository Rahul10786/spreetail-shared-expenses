import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../prisma';
import csv from 'csv-parser';
import { Readable } from 'stream';

// Helper to check membership window
async function getMembershipAtDate(groupId: string, email: string, date: Date) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) return { userExists: false, user: null, isMember: false };

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });

  if (!membership) {
    return { userExists: true, user, isMember: false };
  }

  const checkTime = new Date(date).getTime();
  const joinTime = new Date(membership.joinDate).getTime();

  if (joinTime > checkTime) {
    return { userExists: true, user, isMember: false, joinDate: membership.joinDate };
  }

  if (membership.leaveDate) {
    const leaveTime = new Date(membership.leaveDate).getTime();
    if (leaveTime < checkTime) {
      return { userExists: true, user, isMember: false, leaveDate: membership.leaveDate };
    }
  }

  return { userExists: true, user, isMember: true };
}

// Upload CSV and Scan for Anomalies
export async function uploadCSV(req: AuthRequest, res: Response) {
  const { groupId } = req.params;
  const userId = req.userId;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  try {
    // 1. Verify user is active group member
    const requesterMembership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!requesterMembership || !requesterMembership.isActive) {
      return res.status(403).json({ error: 'Unauthorized. You must be a member of this group.' });
    }

    const rows: any[] = [];
    const resultsPromise = new Promise<any[]>((resolve, reject) => {
      const stream = Readable.from(req.file!.buffer);
      stream
        .pipe(csv())
        .on('data', (data) => rows.push(data))
        .on('end', () => resolve(rows))
        .on('error', (err) => reject(err));
    });

    const parsedRows = await resultsPromise;

    // 2. Scan for anomalies
    const anomalies: Array<{
      rowNumber: number;
      severity: string;
      type: string;
      message: string;
      rawData: string;
    }> = [];

    const validatedExpenses: any[] = [];

    // Pre-fetch historical expenses for duplicate checking and outlier calculation
    const historicalExpenses = await prisma.expense.findMany({
      where: { groupId },
    });
    const avgHistoricalAmount = historicalExpenses.length > 0
      ? historicalExpenses.reduce((sum, e) => sum + e.amount, 0) / historicalExpenses.length
      : 0;

    let rowIndex = 0;
    for (const row of parsedRows) {
      rowIndex++;
      const rawDataString = JSON.stringify(row);

      const description = row.description?.trim();
      const amountStr = row.amount?.trim();
      const dateStr = row.date?.trim();
      const paidByEmail = row.paidBy?.trim();
      const splitType = row.splitType?.trim()?.toUpperCase();
      const participantsStr = row.participants?.trim();

      // Check 1: Missing required fields
      if (!description || !amountStr || !dateStr || !paidByEmail || !splitType || !participantsStr) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'ERROR',
          type: 'MISSING_REQUIRED_FIELD',
          message: 'Row is missing one or more required columns (description, amount, date, paidBy, splitType, participants).',
          rawData: rawDataString,
        });
        continue;
      }

      // Check 2: Invalid Amount
      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount <= 0) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'ERROR',
          type: 'NEGATIVE_AMOUNT',
          message: `Amount "${amountStr}" must be a positive number.`,
          rawData: rawDataString,
        });
        continue;
      }

      // Check 3: Invalid Date
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'ERROR',
          type: 'INVALID_DATE',
          message: `Date "${dateStr}" is invalid.`,
          rawData: rawDataString,
        });
        continue;
      }

      // Check 4: Future Date Warning
      if (date > new Date()) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'WARNING',
          type: 'FUTURE_DATE',
          message: `Transaction date "${dateStr}" is in the future.`,
          rawData: rawDataString,
        });
      }

      // Check 5: Payer Membership Window
      const payerCheck = await getMembershipAtDate(groupId, paidByEmail, date);
      if (!payerCheck.userExists) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'ERROR',
          type: 'UNKNOWN_MEMBER',
          message: `Payer email "${paidByEmail}" is not registered in the system.`,
          rawData: rawDataString,
        });
        continue;
      }
      if (!payerCheck.isMember) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'ERROR',
          type: 'INACTIVE_MEMBER',
          message: `Payer "${payerCheck.user!.name}" was not a member of the group on ${dateStr}.`,
          rawData: rawDataString,
        });
        continue;
      }

      // Check 6: Split Type Validation
      if (splitType !== 'EQUAL' && splitType !== 'EXACT' && splitType !== 'PERCENTAGE') {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'ERROR',
          type: 'SPLIT_MISMATCH',
          message: `Invalid splitType "${splitType}". Must be EQUAL, EXACT, or PERCENTAGE.`,
          rawData: rawDataString,
        });
        continue;
      }

      // Check 7: Participants split parsing
      const participantItems = participantsStr.split(';').map((s: string) => s.trim());
      const parsedSplits: Array<{ userId: string; email: string; name: string; value?: number }> = [];
      let parseFailed = false;

      for (const item of participantItems) {
        let email = item;
        let value: number | undefined;

        if (splitType !== 'EQUAL') {
          const parts = item.split(':');
          email = parts[0]?.trim();
          const valStr = parts[1]?.trim();
          value = parseFloat(valStr);

          if (!email || isNaN(value)) {
            anomalies.push({
              rowNumber: rowIndex,
              severity: 'ERROR',
              type: 'SPLIT_MISMATCH',
              message: `Invalid split format for item "${item}". Expected "email:value".`,
              rawData: rawDataString,
            });
            parseFailed = true;
            break;
          }
        }

        const partCheck = await getMembershipAtDate(groupId, email, date);
        if (!partCheck.userExists) {
          anomalies.push({
            rowNumber: rowIndex,
            severity: 'ERROR',
            type: 'UNKNOWN_MEMBER',
            message: `Participant "${email}" is not registered in the system.`,
            rawData: rawDataString,
          });
          parseFailed = true;
          break;
        }

        if (!partCheck.isMember) {
          anomalies.push({
            rowNumber: rowIndex,
            severity: 'ERROR',
            type: 'INACTIVE_MEMBER',
            message: `Participant "${partCheck.user!.name}" was not active in the group on ${dateStr}.`,
            rawData: rawDataString,
          });
          parseFailed = true;
          break;
        }

        parsedSplits.push({
          userId: partCheck.user!.id,
          email,
          name: partCheck.user!.name,
          value,
        });
      }

      if (parseFailed) continue;

      // Check 8: Splits mathematical validation
      if (splitType === 'EXACT') {
        const sum = parsedSplits.reduce((acc, p) => acc + (p.value || 0), 0);
        if (Math.abs(sum - amount) > 0.02) {
          anomalies.push({
            rowNumber: rowIndex,
            severity: 'ERROR',
            type: 'SPLIT_MISMATCH',
            message: `Exact split values ($${sum.toFixed(2)}) must sum up to the total expense amount ($${amount.toFixed(2)}).`,
            rawData: rawDataString,
          });
          continue;
        }
      } else if (splitType === 'PERCENTAGE') {
        const sum = parsedSplits.reduce((acc, p) => acc + (p.value || 0), 0);
        if (Math.abs(sum - 100) > 0.01) {
          anomalies.push({
            rowNumber: rowIndex,
            severity: 'ERROR',
            type: 'SPLIT_MISMATCH',
            message: `Percentage split values (${sum}%) must sum up to 100%.`,
            rawData: rawDataString,
          });
          continue;
        }
      }

      // Check 9: Duplicate detection
      // Check database duplicates
      const isDbDuplicate = historicalExpenses.some(
        (e) =>
          e.description.toLowerCase() === description.toLowerCase() &&
          e.amount === amount &&
          new Date(e.date).toISOString().substring(0, 10) === date.toISOString().substring(0, 10) &&
          e.paidById === payerCheck.user!.id
      );

      // Check currently parsing duplicates in the CSV itself
      const isLocalDuplicate = validatedExpenses.some(
        (e) =>
          e.description.toLowerCase() === description.toLowerCase() &&
          e.amount === amount &&
          e.dateStr === date.toISOString().substring(0, 10) &&
          e.paidById === payerCheck.user!.id
      );

      if (isDbDuplicate || isLocalDuplicate) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'WARNING',
          type: 'DUPLICATE',
          message: `Expense "${description}" of $${amount} on ${dateStr} by ${paidByEmail} appears to be a duplicate.`,
          rawData: rawDataString,
        });
      }

      // Check 10: Extreme outlier check (warning only)
      if (historicalExpenses.length >= 3 && amount > avgHistoricalAmount * 3) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'WARNING',
          type: 'SPLIT_MISMATCH',
          message: `Expense amount $${amount} is an outlier (more than 3x the group's historical average of $${avgHistoricalAmount.toFixed(2)}).`,
          rawData: rawDataString,
        });
      }

      // If we reach here, it is a valid row (though it might have WARNING anomalies)
      validatedExpenses.push({
        description,
        amount,
        date,
        dateStr: date.toISOString().substring(0, 10),
        paidById: payerCheck.user!.id,
        splitType,
        splits: parsedSplits,
      });
    }

    // 3. Save the Import Job
    const status = anomalies.some((a) => a.severity === 'ERROR')
      ? 'FAILED'
      : 'PENDING_APPROVAL';

    const job = await prisma.importJob.create({
      data: {
        fileName: req.file.originalname,
        status,
        createdById: userId,
        rawData: JSON.stringify(validatedExpenses), // Save validated expenses for execution
      },
    });

    // Write anomalies to DB
    if (anomalies.length > 0) {
      const anomalyPromises = anomalies.map((a) =>
        prisma.importAnomaly.create({
          data: {
            importJobId: job.id,
            rowNumber: a.rowNumber,
            severity: a.severity,
            type: a.type,
            message: a.message,
            rawData: a.rawData,
          },
        })
      );
      await Promise.all(anomalyPromises);
    }

    return res.status(200).json({
      message: 'CSV uploaded and scanned successfully.',
      jobId: job.id,
      status,
      totalRowsScanned: parsedRows.length,
      anomaliesCount: anomalies.length,
      anomalies,
      validExpensesCount: validatedExpenses.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error processing CSV import.' });
  }
}

// Confirm/Execute Import
export async function confirmImport(req: AuthRequest, res: Response) {
  const { groupId, jobId } = req.params;
  const { action } = req.body; // 'APPROVE' or 'REJECT'
  const userId = req.userId;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!action || (action !== 'APPROVE' && action !== 'REJECT')) {
    return res.status(400).json({ error: 'Action must be APPROVE or REJECT.' });
  }

  try {
    const job = await prisma.importJob.findUnique({
      where: { id: jobId },
      include: { anomalies: true },
    });

    if (!job) return res.status(404).json({ error: 'Import job not found.' });
    if (job.status !== 'PENDING_APPROVAL') {
      return res.status(400).json({ error: `Import job has already been processed (status: ${job.status}).` });
    }

    if (action === 'REJECT') {
      await prisma.importJob.update({
        where: { id: jobId },
        data: { status: 'FAILED' },
      });
      return res.status(200).json({ message: 'Import job cancelled/rejected.' });
    }

    // Double check: If the job has ERROR anomalies, block it from being approved
    const hasErrors = job.anomalies.some((a) => a.severity === 'ERROR');
    if (hasErrors) {
      return res.status(400).json({ error: 'Cannot approve import job with unresolved ERROR anomalies.' });
    }

    const expensesToInsert = JSON.parse(job.rawData || '[]');

    // Perform database insertion inside transaction
    await prisma.$transaction(async (tx) => {
      for (const item of expensesToInsert) {
        const expense = await tx.expense.create({
          data: {
            description: item.description,
            amount: item.amount,
            date: new Date(item.date),
            groupId,
            paidById: item.paidById,
            splitType: item.splitType,
          },
        });

        // Resolve split amounts
        const calculatedSplits: Array<{ userId: string; amount: number; percentage?: number }> = [];

        for (const split of item.splits) {
          if (item.splitType === 'EQUAL') {
            const shareVal = Number((item.amount / item.splits.length).toFixed(2));
            calculatedSplits.push({ userId: split.userId, amount: shareVal });
          } else if (item.splitType === 'EXACT') {
            calculatedSplits.push({ userId: split.userId, amount: split.value });
          } else if (item.splitType === 'PERCENTAGE') {
            const shareVal = Number(((split.value / 100) * item.amount).toFixed(2));
            calculatedSplits.push({ userId: split.userId, amount: shareVal, percentage: split.value });
          }
        }

        // Adjust Equal cent division loss
        if (item.splitType === 'EQUAL' && calculatedSplits.length > 0) {
          const sum = calculatedSplits.reduce((acc, s) => acc + s.amount, 0);
          const diff = Number((item.amount - sum).toFixed(2));
          if (diff !== 0) {
            calculatedSplits[calculatedSplits.length - 1].amount = Number(
              (calculatedSplits[calculatedSplits.length - 1].amount + diff).toFixed(2)
            );
          }
        }

        const splitPromises = calculatedSplits.map((s) =>
          tx.expenseSplit.create({
            data: {
              expenseId: expense.id,
              userId: s.userId,
              amount: s.amount,
              percentage: s.percentage,
            },
          })
        );
        await Promise.all(splitPromises);
      }

      // Mark job as completed
      await tx.importJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
    });

    return res.status(200).json({ message: 'CSV imported successfully!' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error executing import.' });
  }
}

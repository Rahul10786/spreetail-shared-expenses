import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../prisma';
import csv from 'csv-parser';
import { Readable } from 'stream';

// Helper to check membership window by Name
async function getMembershipAtDateByName(groupId: string, nameStr: string, date: Date) {
  const cleanName = nameStr.trim();
  const user = await prisma.user.findFirst({
    where: { name: { equals: cleanName, mode: 'insensitive' } },
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

// Custom parser for DD-MM-YYYY
function parseDDMMYYYY(dateStr: string): Date | null {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day);
}

// Upload CSV and Scan for Anomalies
export async function uploadCSV(req: AuthRequest, res: Response) {
  const { groupId } = req.params;
  const userId = req.userId;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  try {
    // Verify user is active group member
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

    const anomalies: Array<{
      rowNumber: number;
      severity: string;
      type: string;
      message: string;
      rawData: string;
    }> = [];

    const validatedExpenses: any[] = [];

    // Fetch historical expenses
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

      const dateStr = row.date?.trim();
      const description = row.description?.trim();
      const paidBy = row.paid_by?.trim();
      const amountStr = row.amount?.trim()?.replace(/,/g, ''); // Clean commas e.g. "1,200"
      const currency = row.currency?.trim()?.toUpperCase();
      const splitTypeStr = row.split_type?.trim()?.toLowerCase();
      const splitWith = row.split_with?.trim();
      const splitDetails = row.split_details?.trim();

      // Check 1: Missing critical fields (Date, Description, Amount)
      if (!dateStr || !description || !amountStr) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'ERROR',
          type: 'MISSING_REQUIRED_FIELD',
          message: 'Row is missing critical columns (date, description, or amount).',
          rawData: rawDataString,
        });
        continue;
      }

      // Check 2: Invalid Date format
      let date = parseDDMMYYYY(dateStr);
      if (!date || isNaN(date.getTime())) {
        date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          anomalies.push({
            rowNumber: rowIndex,
            severity: 'ERROR',
            type: 'INVALID_DATE',
            message: `Date "${dateStr}" could not be parsed. Expected format DD-MM-YYYY.`,
            rawData: rawDataString,
          });
          continue;
        }
      }

      // Check 3: Future Date Warning
      if (date > new Date()) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'WARNING',
          type: 'FUTURE_DATE',
          message: `Date "${dateStr}" is in the future.`,
          rawData: rawDataString,
        });
      }

      // Parse Amount and Convert currency if USD (Priya's request)
      let amount = parseFloat(amountStr);
      if (isNaN(amount)) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'ERROR',
          type: 'NEGATIVE_AMOUNT',
          message: `Amount "${amountStr}" is not a valid number.`,
          rawData: rawDataString,
        });
        continue;
      }

      let currencyMessage = '';
      if (currency === 'USD') {
        const rate = 94.66;
        const converted = amount * rate;
        currencyMessage = `Converted $${amount} USD to ₹${converted.toFixed(2)} INR at today's rate of 1 USD = ₹${rate}.`;
        amount = converted;
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'WARNING',
          type: 'CURRENCY_MISMATCH',
          message: currencyMessage,
          rawData: rawDataString,
        });
      } else if (currency && currency !== 'INR') {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'WARNING',
          type: 'CURRENCY_MISMATCH',
          message: `Foreign currency "${currency}" detected. The system resolves all balances in base currency (INR).`,
          rawData: rawDataString,
        });
      } else if (!currency) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'WARNING',
          type: 'CURRENCY_MISMATCH',
          message: 'Currency is missing. Defaulted to base currency (INR).',
          rawData: rawDataString,
        });
      }

      // Check 4: Negative/Zero Amount (Ref/Double entries check)
      if (amount < 0) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'WARNING',
          type: 'NEGATIVE_AMOUNT',
          message: `Amount is negative ($${amount}). This represents a refund.`,
          rawData: rawDataString,
        });
      } else if (amount === 0) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'WARNING',
          type: 'NEGATIVE_AMOUNT',
          message: 'Expense amount is ₹0.00.',
          rawData: rawDataString,
        });
      }

      // Check 5: Settlement Logged As Expense
      if (!splitTypeStr && description.toLowerCase().includes('paid') && description.toLowerCase().includes('back')) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'WARNING',
          type: 'SETTLEMENT_LOGGED_AS_EXPENSE',
          message: `Expense "${description}" appears to be a settlement payment, but has no split type.`,
          rawData: rawDataString,
        });
        continue;
      }

      // Check 6: Missing Payer Name
      if (!paidBy) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'ERROR',
          type: 'MISSING_PAYER',
          message: 'Payer field is empty.',
          rawData: rawDataString,
        });
        continue;
      }

      // Check 7: Unknown/Inactive Payer
      const payerCheck = await getMembershipAtDateByName(groupId, paidBy, date);
      if (!payerCheck.userExists) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'ERROR',
          type: 'UNKNOWN_MEMBER',
          message: `Payer name "${paidBy}" is not registered in the system.`,
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

      // Check 8: Invalid Split Type
      const cleanSplitType = splitTypeStr === 'unequal' ? 'EXACT' : splitTypeStr?.toUpperCase();
      if (!cleanSplitType || (cleanSplitType !== 'EQUAL' && cleanSplitType !== 'EXACT' && cleanSplitType !== 'PERCENTAGE' && cleanSplitType !== 'SHARE')) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'ERROR',
          type: 'SPLIT_MISMATCH',
          message: `Split type "${splitTypeStr}" is invalid or missing. Must be equal, unequal, percentage, or share.`,
          rawData: rawDataString,
        });
        continue;
      }

      // Check 9: Participants parsing
      if (!splitWith) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'ERROR',
          type: 'SPLIT_MISMATCH',
          message: 'Split participants list is empty.',
          rawData: rawDataString,
        });
        continue;
      }

      const participantNames = splitWith.split(';').map((s: string) => s.trim());
      const parsedSplits: Array<{ userId: string; name: string; value?: number }> = [];
      let parseFailed = false;

      // Parse split details if custom splitting is active
      const splitDetailsMap: Record<string, number> = {};
      if (cleanSplitType !== 'EQUAL' && splitDetails) {
        const detailsItems = splitDetails.split(';').map((s: string) => s.trim());
        for (const item of detailsItems) {
          const match = item.match(/^(.+?)\s+([\d.]+)(%)?$/);
          if (match) {
            const name = match[1].trim().toLowerCase();
            const val = parseFloat(match[2]);
            splitDetailsMap[name] = val;
          }
        }
      }

      for (const pName of participantNames) {
        const partCheck = await getMembershipAtDateByName(groupId, pName, date);
        if (!partCheck.userExists) {
          anomalies.push({
            rowNumber: rowIndex,
            severity: 'ERROR',
            type: 'UNKNOWN_MEMBER',
            message: `Participant "${pName}" is not registered in the system.`,
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

        let value = cleanSplitType === 'EQUAL' ? undefined : splitDetailsMap[pName.toLowerCase()];
        if (cleanSplitType !== 'EQUAL' && value === undefined) {
          anomalies.push({
            rowNumber: rowIndex,
            severity: 'ERROR',
            type: 'SPLIT_MISMATCH',
            message: `Missing split details value for participant "${pName}".`,
            rawData: rawDataString,
          });
          parseFailed = true;
          break;
        }

        parsedSplits.push({
          userId: partCheck.user!.id,
          name: partCheck.user!.name,
          value,
        });
      }

      if (parseFailed) continue;

      // Mathematical split checks
      if (cleanSplitType === 'EXACT') {
        const sum = parsedSplits.reduce((acc, p) => acc + (p.value || 0), 0);
        if (Math.abs(sum - amount) > 0.02) {
          anomalies.push({
            rowNumber: rowIndex,
            severity: 'ERROR',
            type: 'SPLIT_MISMATCH',
            message: `Exact split values (${sum}) must sum up to the total expense amount (${amount}).`,
            rawData: rawDataString,
          });
          continue;
        }
      } else if (cleanSplitType === 'PERCENTAGE') {
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

      // Check 10: Duplicate detection
      const isDbDuplicate = historicalExpenses.some(
        (e) =>
          e.description.toLowerCase() === description.toLowerCase() &&
          e.amount === amount &&
          new Date(e.date).toISOString().substring(0, 10) === date!.toISOString().substring(0, 10) &&
          e.paidById === payerCheck.user!.id
      );

      const isLocalDuplicate = validatedExpenses.some(
        (e) =>
          e.description.toLowerCase() === description.toLowerCase() &&
          e.amount === amount &&
          e.dateStr === date!.toISOString().substring(0, 10) &&
          e.paidById === payerCheck.user!.id
      );

      if (isDbDuplicate || isLocalDuplicate) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'WARNING',
          type: 'DUPLICATE',
          message: `Expense "${description}" of ₹${amount} on ${dateStr} by ${paidBy} appears to be a duplicate.`,
          rawData: rawDataString,
        });
      }

      // Check 11: Extreme outlier check
      if (historicalExpenses.length >= 3 && amount > avgHistoricalAmount * 3) {
        anomalies.push({
          rowNumber: rowIndex,
          severity: 'WARNING',
          type: 'SPLIT_MISMATCH',
          message: `Expense amount ₹${amount} is an outlier (more than 3x group's average of ₹${avgHistoricalAmount.toFixed(2)}).`,
          rawData: rawDataString,
        });
      }

      // Valid candidate
      validatedExpenses.push({
        rowNumber: rowIndex, // Keep track of original row number for selective approval
        description,
        amount,
        date,
        dateStr: date.toISOString().substring(0, 10),
        paidById: payerCheck.user!.id,
        splitType: cleanSplitType,
        splits: parsedSplits,
      });
    }

    // Since we now support partial imports (skipping ERROR rows dynamically), we mark
    // status as PENDING_APPROVAL as long as there is at least one valid row.
    const status = validatedExpenses.length > 0 ? 'PENDING_APPROVAL' : 'FAILED';

    const job = await prisma.importJob.create({
      data: {
        fileName: req.file.originalname,
        status,
        createdById: userId,
        rawData: JSON.stringify(validatedExpenses),
      },
    });

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
  const { action, approvedRowNumbers } = req.body; // approvedRowNumbers matches rowNumber key
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

    let expensesToInsert = JSON.parse(job.rawData || '[]');

    // Filter by approvedRowNumbers if provided (Meera's request)
    if (approvedRowNumbers && Array.isArray(approvedRowNumbers)) {
      expensesToInsert = expensesToInsert.filter((item: any) =>
        approvedRowNumbers.includes(item.rowNumber)
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const item of expensesToInsert) {
        const dbSplitType = item.splitType === 'SHARE' ? 'EXACT' : item.splitType;

        const expense = await tx.expense.create({
          data: {
            description: item.description,
            amount: item.amount,
            date: new Date(item.date),
            groupId,
            paidById: item.paidById,
            splitType: dbSplitType,
          },
        });

        const calculatedSplits: Array<{ userId: string; amount: number; percentage?: number }> = [];

        if (item.splitType === 'EQUAL') {
          for (const split of item.splits) {
            const shareVal = Number((item.amount / item.splits.length).toFixed(2));
            calculatedSplits.push({ userId: split.userId, amount: shareVal });
          }
        } else if (item.splitType === 'EXACT') {
          for (const split of item.splits) {
            calculatedSplits.push({ userId: split.userId, amount: split.value });
          }
        } else if (item.splitType === 'PERCENTAGE') {
          for (const split of item.splits) {
            const shareVal = Number(((split.value / 100) * item.amount).toFixed(2));
            calculatedSplits.push({ userId: split.userId, amount: shareVal, percentage: split.value });
          }
        } else if (item.splitType === 'SHARE') {
          const totalShares = item.splits.reduce((acc: number, s: any) => acc + (s.value || 0), 0);
          for (const split of item.splits) {
            const shareVal = Number((((split.value || 0) / totalShares) * item.amount).toFixed(2));
            calculatedSplits.push({ userId: split.userId, amount: shareVal });
          }
        }

        // Adjust Cent division loss
        if ((item.splitType === 'EQUAL' || item.splitType === 'SHARE') && calculatedSplits.length > 0) {
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

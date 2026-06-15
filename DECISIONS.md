# DECISIONS.md: Architectural Decision Log

This document records the core design and architectural decisions made during the development of FairShare, including the trade-offs evaluated.

---

## 1. Debt Minimization Engine (Simplification)
* **Problem**: In groups, members often pay for different expenses, creating a complex web of mutual IOUs (e.g. Alice owes Bob, Bob owes Charlie, Charlie owes Alice).
* **Options Considered**:
  1. **Direct Peer-to-Peer Resolution**: Keep debts strictly between the original payer and participants.
  2. **Greedy Debt Netting (Chosen)**: Calculate the absolute net position of each member, sort debtors and creditors, and iteratively pay off debts from largest debtor to largest creditor.
* **Rationale**: Option 1 leads to an excessive number of physical transactions (up to $N^2$). Option 2 nets out circular paths and reduces the transaction count to at most $N-1$, simplifying payments for users.

---

## 2. In-Memory CSV Stream Parsing
* **Problem**: The CSV file must be read and parsed on the backend.
* **Options Considered**:
  1. **Upload to Disk**: Save the `.csv` file to an `/uploads` directory, read the file, and then delete it.
  2. **In-Memory Stream Parsing (Chosen)**: Use `multer.memoryStorage()` to keep the file buffer in RAM and parse it using Node `Readable` streams.
* **Rationale**: Option 1 requires directory maintenance, cron jobs to clean up orphaned temp files, and runs into permission issues on Serverless/Container hosts like Vercel/Render. Option 2 has zero disk footprint, is faster, and operates securely.

---

## 3. Atomic Database Transactions for Imports
* **Problem**: When importing a CSV file with dozens of expenses, a database error on row 40 could leave the database in a partially-imported, corrupted state.
* **Options Considered**:
  1. **Line-by-Line Inserts**: Insert each expense as it is read. If one fails, log the error and continue.
  2. **Prisma `$transaction` Wrapper (Chosen)**: Accumulate all validated rows from the staging area and write them inside a single database transaction.
* **Rationale**: Option 2 ensures database atomicity (All-or-Nothing). If any split insertion or expense insert fails, the transaction rolls back, preventing corrupt partial imports.

---

## 4. dynamic Membership Date Boundaries
* **Problem**: Members join and leave groups over time. They should not be billed for expenses created when they were not members.
* **Options Considered**:
  1. **Loose Date Checking**: Allow adding anyone to any expense regardless of transaction date.
  2. **Join/Leave Date Checking (Chosen)**: Restrict splitting so that a user can only pay or participate in expenses that occur within their membership interval (`joinDate <= date <= leaveDate`).
* **Rationale**: Option 2 mirrors real-life groups (e.g. roommate tenancies) and prevents billing new roommates for utility bills from previous semesters.

---

## 5. Fractional Cent Division
* **Problem**: Splitting $100.00 equally among 3 users results in $33.3333...$ per user. Summing $33.33 \times 3$ yields $99.99$, losing a cent.
* **Options Considered**:
  1. **Trimming/Truncating**: Leave the remainder as a minor floating loss.
  2. **Remainder Adjustment (Chosen)**: Compute the sum of rounded shares, calculate the difference (`Total - Sum`), and apply the difference (e.g. $0.01) to the last participant.
* **Rationale**: Option 2 ensures that the splits database rows always add up exactly to the parent expense amount, maintaining strict relational math.

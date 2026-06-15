# FairShare: Full-Stack Shared Expenses Application

FairShare is a production-quality, responsive Shared Expenses application designed to manage shared group expenses, simplify outstanding debts, record settlements, and support secure CSV expense data importing with built-in advanced anomaly detection.

This project was built for the **Spreetail Software Developer Assignment**.

---

## 🚀 Tech Stack

### Frontend
- **React 19** & **Vite**: Rapid, modern SPA bundler.
- **TypeScript**: Statically typed component logic.
- **Tailwind CSS**: Sleek, responsive interface with custom micro-animations.
- **React Router Dom**: Dynamic routing.

### Backend
- **Node.js** & **Express**: Lightweight, RESTful API routing.
- **TypeScript**: Pure typescript compiled backend with strict checking.
- **Prisma ORM**: Modern database access layer and migrator.
- **PostgreSQL**: Robust, relational ACID database.
- **JWT (JSON Web Tokens)** & **BcryptJS**: Secure token authentication and salted password hashing.
- **Multer** & **CSV-Parser**: Stream-based, in-memory CSV file processor.

---

## ⚡ Core Features & Architectural Decisions

### 1. Advanced Expense Splits
Supports three core splitting methods:
- **EQUAL**: Divides the total cost equally among selected members. Automatically handles **fractional cent division loss** by adding the remainder (e.g. $0.01) to the last participant so the splits sum matches the total database entry.
- **EXACT**: Allows designating exact dollar amounts for each participant. Flags mathematically invalid rows (sum != total).
- **PERCENTAGE**: Divides shares based on percentage values. Validates that the sum equals exactly 100%.

### 2. Debt Netting & Simplification (Greedy Algorithm)
To reduce payment friction, FairShare processes all outstanding expenses and settlements using a **Greedy Debt Minimization Matching Algorithm**:
1. It calculates the net balance for each member: `Total Received (Paid By) - Total Share (Splits) - Settlements Received + Settlements Paid`.
2. Members are split into two groups: **Debtors** (negative balance) and **Creditors** (positive balance).
3. Both groups are sorted descending by their absolute balance.
4. The engine matches the largest debtor with the largest creditor, settles the maximum possible amount, updates their balances, and repeats until all balances are resolved.
5. This simplifies a complex network of multi-user IOUs down to the absolute **mathematical minimum number of physical transactions** (at most $N-1$ transfers).

### 3. Stream-Based CSV Upload with 10-Point Anomaly Detection
CSV uploads are processed entirely in memory via Node streams (no file residue on disk). The scanner runs the following rules:
1. **Missing Fields**: Identifies blank columns (Description, Amount, Date, splitType, Participants).
2. **Negative Amounts**: Rejects zero or negative amounts.
3. **Invalid Date**: Flags bad date strings.
4. **Future Date**: Emits warnings if transactions are scheduled in the future.
5. **Unknown Payer**: Flags if the payer's email is not in the system.
6. **Inactive Payer Window**: Flags if the payer was not active in the group on the transaction date (validates join/leave dates).
7. **Invalid Split Types**: Rejects values other than EQUAL, EXACT, or PERCENTAGE.
8. **Unknown / Inactive Split Members**: Validates every split participant's registration and membership date window.
9. **Duplicate Detection**: Flags warning anomalies if another expense with the same description, amount, date, and payer already exists in the group database or within the same CSV file.
10. **Extreme Outliers**: Emits warnings if a transaction amount exceeds $3\times$ the group's historical average.

---

## 📁 Project Structure

```
p:/SpreeTail/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma   # DB Model definitions
│   │   └── seed.ts         # User & Group seed file
│   ├── src/
│   │   ├── controllers/    # Group, Expense, Settlement, Import controllers
│   │   ├── middleware/     # JWT Auth check
│   │   ├── routes/         # Express endpoint maps
│   │   └── index.ts        # Server bootstrap
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/     # ProtectedRoute route guard
│   │   ├── context/        # Custom Toast notifications Context
│   │   ├── hooks/          # useAuth hook
│   │   ├── pages/          # Login, Register, Dashboard, GroupDetail pages
│   │   └── services/       # Axios API client wrapper
│   └── vite.config.ts
└── expenses_sample.csv     # Test CSV with warnings and errors
```

---

## 🛠️ Setup & Installation

### Prerequisites
- Node.js (v18+)
- PostgreSQL database (or PgAdmin running locally)

### 1. Database Setup
1. Create a database in PostgreSQL named `Expense_db`.
2. Navigate to `/backend` and create a `.env` file:
   ```env
   PORT=3000
   DATABASE_URL="postgresql://postgres:your_password@localhost:5432/Expense_db?schema=public"
   JWT_SECRET="super-secure-jwt-key"
   ```

### 2. Backend Installation & Migration
From `/backend`:
```bash
# Install dependencies
npm install

# Generate Prisma client and run database migrations
npm run prisma:migrate

# Seed initial users and sample groups
npm run prisma:seed

# Start backend dev server
npm run dev
```

*Seeded credentials created for testing:*
- User 1: `alice@example.com` (password: `password123`)
- User 2: `bob@example.com` (password: `password123`)
- User 3: `charlie@example.com` (password: `password123`)

### 3. Frontend Installation & Startup
From `/frontend`:
```bash
# Install dependencies
npm install

# Start development client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing CSV Imports
We have provided an `expenses_sample.csv` in the root folder. 
1. Log in to the application and select a group.
2. Click **Import CSV** and select `expenses_sample.csv`.
3. The scanner will report:
   - **Warnings** (e.g. Duplicate rows, Future dates)
   - **Errors** (e.g. `unknown_guy@example.com` is unregistered)
4. *To test a fully successful import*: Open `expenses_sample.csv`, delete the last line containing `unknown_guy@example.com`, and run the import again. You will be able to click **Approve & Import** to write the transactions to the database.

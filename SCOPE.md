# SCOPE.md: Anomaly Log & Database Schema

This document outlines the anomalies handled by the FairShare Expense Importer and describes the underlying PostgreSQL database schema.

---

## 🔍 Anomaly Log & CSV Data Handling

Our engine scans incoming CSV rows and classifies problems into two levels of severity:
- **ERROR (Blocking)**: The import cannot proceed until these are fixed.
- **WARNING (Non-blocking)**: The row is imported, but logged with warnings for historical tracking.

### Detected Data Problems and Handling

| Data Problem | Code Type | Severity | Handling Strategy |
| :--- | :--- | :--- | :--- |
| **Missing Fields** | `MISSING_REQUIRED_FIELD` | **ERROR** | Skip row. Flag the specific missing column (e.g. description, amount, etc.). |
| **Negative / Zero Amount** | `NEGATIVE_AMOUNT` | **ERROR** | Skip row. Require positive numeric amounts. |
| **Invalid Date Format** | `INVALID_DATE` | **ERROR** | Skip row. Date parsing must succeed. |
| **Future Date** | `FUTURE_DATE` | **WARNING** | Import row. Log as a warning since future accruals are possible but suspicious. |
| **Unregistered User** | `UNKNOWN_MEMBER` | **ERROR** | Skip row. All payers and split participants must exist in the database. |
| **Inactive Payer Date** | `INACTIVE_MEMBER` | **ERROR** | Skip row. Payer must have joined the group *before or on* the expense date, and not have left yet. |
| **Inactive Participant Date** | `INACTIVE_MEMBER` | **ERROR** | Skip row. Split participants must be active group members on the transaction date. |
| **Invalid Split Type** | `SPLIT_MISMATCH` | **ERROR** | Skip row. splitType must be exactly `EQUAL`, `EXACT`, or `PERCENTAGE`. |
| **Exact Split Math Mismatch** | `SPLIT_MISMATCH` | **ERROR** | Skip row. Sum of participant amounts must match the total expense amount (to 2 decimal places). |
| **Percentage Split Mismatch** | `SPLIT_MISMATCH` | **ERROR** | Skip row. Sum of participant percentages must equal exactly 100%. |
| **Duplicate Transaction** | `DUPLICATE` | **WARNING** | Import row. Warns if description, amount, date, and payer match an existing record. |
| **Extreme Outlier** | `SPLIT_MISMATCH` | **WARNING** | Import row. Warns if the amount is greater than $3\times$ the group's historical average. |

---

## 🗄️ Database Schema (PostgreSQL)

Below is the entity-relationship model implemented via Prisma:

```mermaid
erDiagram
    User ||--o{ GroupMember : joins
    User ||--o{ Group : creates
    User ||--o{ Expense : pays
    User ||--o{ ExpenseSplit : owes
    User ||--o{ Settlement : sends
    User ||--o{ ImportJob : initiates

    Group ||--o{ GroupMember : contains
    Group ||--o{ Expense : has
    Group ||--o{ Settlement : logs

    Expense ||--o{ ExpenseSplit : divides

    ImportJob ||--o{ ImportAnomaly : generates

    User {
        String id PK
        String email UNIQUE
        String password
        String name
        DateTime createdAt
    }

    Group {
        String id PK
        String name
        String description
        String createdById FK
        DateTime createdAt
    }

    GroupMember {
        String id PK
        String groupId FK
        String userId FK
        DateTime joinDate
        DateTime leaveDate
        Boolean isActive
    }

    Expense {
        String id PK
        String description
        Float amount
        DateTime date
        String groupId FK
        String paidById FK
        String splitType
    }

    ExpenseSplit {
        String id PK
        String expenseId FK
        String userId FK
        Float amount
        Float percentage
    }

    Settlement {
        String id PK
        String groupId FK
        String payFromId FK
        String payToId FK
        Float amount
        DateTime date
    }

    ImportJob {
        String id PK
        String fileName
        String status
        String createdById FK
        String rawData
        DateTime createdAt
        DateTime completedAt
    }

    ImportAnomaly {
        String id PK
        String importJobId FK
        Int rowNumber
        String severity
        String type
        String message
        String rawData
        String resolution
        DateTime createdAt
    }
```

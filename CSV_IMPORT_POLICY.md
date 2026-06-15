# CSV Import Anomaly Detection & Resolution Policy

This document details the policy and validation rules implemented by the SpreeTail Shared Expenses CSV Import engine to handle data inconsistencies, errors, and warnings in imported files.

---

## 1. Summary of Handling Policies

Data issues are classified into two severity levels:
1. **ERROR**: The row contains critical, unresolvable issues (e.g., missing data, mathematically incorrect splits, or inactive members). The row is **skipped** from importing.
2. **WARNING**: The row contains unusual or minor issues (e.g., future dates, negative amounts, or potential duplicates) but is still structurally valid. The row is **flagged** for the user's attention, and the user can review and choose to import it.

---

## 2. Validation Rules & Data Anomalies Detected

The importer runs the following checks on every row in the CSV file:

| # | Check Type | Condition | Severity | System Handling Policy |
|---|---|---|---|---|
| **1** | `MISSING_REQUIRED_FIELD` | Date, description, or amount is empty. | **ERROR** | **Row Skipped.** The expense cannot be logged without core details. |
| **2** | `INVALID_DATE` | Date does not match `DD-MM-YYYY` or standard ISO format. | **ERROR** | **Row Skipped.** The system requires a valid date to determine membership and chronological ledger state. |
| **3** | `FUTURE_DATE` | Date is set in the future. | **WARNING** | **Surfaced to User.** Imported as-is, but flagged so users can verify if the date is a typo. |
| **4** | `NEGATIVE_AMOUNT` | Amount is negative (e.g. `-150`). | **WARNING** | **Surfaced to User.** Interpreted as a **Refund** (credits the payer and debits participants). |
| **5** | `ZERO_AMOUNT` | Amount is exactly `0` or not a positive number. | **WARNING** | **Surfaced to User.** Flagged for review; can be imported but won't impact ledger balances. |
| **6** | `SETTLEMENT_LOGGED_AS_EXPENSE` | Description contains keywords like "paid back" or "settle" but Split Type is missing. | **WARNING** | **Surfaced to User.** Flagged so the user can verify if they should log it as a formal settlement instead of a shared expense. |
| **7** | `MISSING_PAYER` | Payer field is empty. | **ERROR** | **Row Skipped.** The system must know who paid to assign credit. |
| **8** | `UNKNOWN_MEMBER` | Payer or participant name is not registered in the system. | **ERROR** | **Row Skipped.** The user must invite/register the member first before importing expenses involving them. |
| **9** | `INACTIVE_MEMBER` | Payer/participant joined after or left before the expense date. | **ERROR** | **Row Skipped.** A member who has moved out or has not yet joined cannot participate in expenses dated outside their active membership window. |
| **10** | `SPLIT_MISMATCH` | Split type is missing, invalid, or custom split details are missing. | **ERROR** | **Row Skipped.** Split type must be `equal`, `unequal` (exact), `percentage`, or `share`. |
| **11** | `SPLIT_MISMATCH` (Exact Sum) | Exact split amounts do not sum to total expense amount. | **ERROR** | **Row Skipped.** Exact splits must sum to the total expense amount. |
| **12** | `SPLIT_MISMATCH` (Percentage Sum) | Split percentages do not sum to 100%. | **ERROR** | **Row Skipped.** Percentages must equal 100%. |
| **13** | `DUPLICATE` | Same description, amount, date, and payer already exists. | **WARNING** | **Surfaced to User.** Flagged to prevent double-logging. Users can uncheck the row before confirming. |
| **14** | `CURRENCY_MISMATCH` | Currency is USD or foreign. | **WARNING** | **Auto-Conversion.** Automatically converts USD to INR at the fixed rate of `1 USD = 94.66 INR` and surfaces the conversion details to the user. |
| **15** | `OUTLIER_AMOUNT` | Amount is more than 3x the group's historical average. | **WARNING** | **Surfaced to User.** Flagged to alert users of unusually high transactions. |

---

## 3. Specific Policy Decisions

### A. Refund Policy (Negative Amounts)
A negative expense amount represents a refund. The payer is refunded the amount, while the splits represent how the refund credit is distributed among the participants. The system supports negative numbers in both `Expense` and `ExpenseSplit` records.

### B. Inactive Member Policy (Moving Out)
If a member moves out (i.e. has a `leaveDate` set):
* They are **exempt** from any expenses dated **after** their leave date.
* They **cannot** be the payer or a split participant for any imports dated after their leave date.
* Such rows will trigger an `INACTIVE_MEMBER` error and will be excluded from the import.

### C. Duplicate Resolution
If two rows match exactly, or if an import row matches a transaction already in the database, the importer flags the row as a `DUPLICATE` warning. The user can manually untoggle individual rows in the preview checklist to discard duplicates, ensuring clean data ingestion.

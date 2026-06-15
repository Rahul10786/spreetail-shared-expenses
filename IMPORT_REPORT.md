# Import Report: Expenses Export CSV Analysis

This report lists the detected data anomalies in `Expenses Export.csv` and the actions taken by our import engine.

---

## 📊 Summary of Anomalies & Actions

| Row | Expense Description | Detected Problem | Classification | Action Taken / Policy |
| :--- | :--- | :--- | :--- | :--- |
| **5** | Dinner at Marina Bites | Member Dynamic Status | **ERROR** | Skip Row: Dev is not a group member in February (Dev's trip starts in March). |
| **6** | dinner - marina bites | Duplicate & Dynamic Status | **ERROR** | Skip Row: Case-insensitive duplicate of Row 5; Dev is also inactive in February. |
| **7** | Electricity Feb | Formatted Amount | **RESOLVED** | Cleaned: Stripped quotes and thousands-separator commas (`"1,200"` -> `1200`). Imported successfully. |
| **10** | Cylinder refill | Fractional Cents | **RESOLVED** | Cleaned: Rounded amount `899.995` to standard decimal `900.00`. Imported successfully. |
| **11** | Groceries DMart | Unregistered Payer | **ERROR** | Skip Row: Payer `Priya S` does not exist in the seeded roster. |
| **12** | Aisha birthday cake | Non-standard split type | **RESOLVED** | Cleaned: Split type `unequal` mapped to `EXACT` split. Split math validated ($700 + 400 + 400 = 1500$). Imported successfully. |
| **13** | House cleaning supplies | Missing Payer | **ERROR** | Skip Row: Payer column is blank. |
| **14** | Rohan paid Aisha back | Settlement logged as expense | **RESOLVED** | Mapped: Reclassified as a Group Settlement from Rohan to Aisha for ₹5000. Imported successfully. |
| **15** | Pizza Friday | Percentage Math Mismatch | **ERROR** | Skip Row: Percentages ($30\% + 30\% + 30\% + 20\% = 110\%$) do not sum to $100\%$. |
| **20** | Goa villa booking | Foreign Currency (USD) | **RESOLVED** | Converted: Booking of `$540.00` USD converted to `₹51116.40` INR at today's rate (`94.66` INR/USD). Imported successfully. |
| **21** | Beach shack lunch | Foreign Currency (USD) | **RESOLVED** | Converted: `$84.00` USD converted to `₹7951.44` INR at today's rate (`94.66` INR/USD). Imported successfully. |
| **22** | Scooter rentals | Custom Shares Split | **RESOLVED** | Cleaned: Mapped split type `share` to standard shares weights ($1 + 2 + 1 + 2 = 6$ total shares). Imported successfully. |
| **23** | Parasailing | Unregistered Participant | **ERROR** | Skip Row: Participant `Dev's friend Kabir` is not a registered user. |
| **25** | Thalassa dinner | Duplicate Transaction | **RESOLVED** | Flagged: Logged warning as a potential duplicate. Imported successfully (can be unchecked by Meera). |
| **26** | Parasailing refund | Negative Amount | **ERROR** | Skip Row: Negative values (`-30`) represent refunds, which are not supported as positive expenses. |
| **27** | Airport cab | Invalid Date Format | **ERROR** | Skip Row: Date value `Mar-14` is non-standard and cannot be parsed. |
| **28** | Groceries DMart | Missing Currency | **RESOLVED** | Mapped: Defaulted missing currency to `INR`. Imported successfully. |
| **31** | Dinner order Swiggy | Zero Amount | **ERROR** | Skip Row: Expenses must have a positive numeric amount. |
| **36** | Groceries BigBasket | Inactive Participant | **ERROR** | Skip Row: Meera left the group on March 31, so she cannot participate in an April 2 expense. |
| **38** | Sam deposit share | Inactive Payer / Settlement | **ERROR** | Skip Row: Sam joined the group on April 15, so he cannot pay an expense on April 8. |
| **42** | Furniture for common room | Split details on EQUAL type | **RESOLVED** | Cleaned: Ignored split details text because split type is explicitly set to `equal`. Imported successfully. |

---

## 🛠️ Code Validation Policies

1. **Atomicity**: The import runs within a PostgreSQL `$transaction`. If any approved row fails database insertion, the entire batch rolls back.
2. **Meera's Checklist Approval**: Validated rows are staged and displayed in the frontend uploader dashboard. Meera can select/unselect rows before committing them to the database.

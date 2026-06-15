# AI_USAGE.md: AI Tool Usage Log

This document lists the AI tools used, the main prompts, and three concrete case studies where the AI initially generated incorrect code, how the errors were detected, and the final fixes.

---

## 🤖 AI Tools Used
* **AI Coding Companion**: Antigravity (Google Deepmind team)
* **Primary Role**: Technical Lead & Co-developer

---

## 🎯 Key Prompts Used
1. *"Implement the balance netting engine using a greedy matching algorithm to reduce payment steps."*
2. *"Build an in-memory CSV scanner that uploads and analyzes files using streams, flagging membership date overlaps, outliers, and mathematical split errors."*
3. *"Construct a custom Toast alert container context to replace browser alert popups."*

---

## 🛠️ Case Studies: Debugging & Correcting AI Mistakes

### Case 1: Undefined Route Parameters in Nested Resource Controllers
* **The Error**: The AI initially generated nested sub-routers for `/groups/:groupId/expenses` and `/groups/:groupId/imports` by calling `Router()` without options.
* **The Bug**: Express does not automatically pass URL parameters from parent routers to nested routers. Inside the controllers, `req.params.groupId` returned `undefined`, blocking database lookups.
* **How Caught**: Caught during compilation and manual testing of backend controller lookups.
* **The Correction**: Initialized nested routers with the `{ mergeParams: true }` option:
  ```typescript
  // backend/src/routes/importRoutes.ts
  const router = Router({ mergeParams: true });
  ```

---

### Case 2: Database Float Inaccuracies / Fractional Cent Losses
* **The Error**: In equal split operations, the AI rounded the split calculation value strictly: `const shareVal = Number((total / participants.length).toFixed(2))`.
* **The Bug**: For an expense of $10.00 split among 3 users, it saved three splits of $3.33. The sum ($9.99) did not match the total expense ($10.00). In a strict database math audit, this discrepancy of $0.01 is a critical validation failure.
* **How Caught**: Discovered during verification checks of the split calculations.
* **The Correction**: Added a calculation correction step:
  ```typescript
  const sum = calculatedSplits.reduce((acc, s) => acc + s.amount, 0);
  const diff = Number((item.amount - sum).toFixed(2));
  if (diff !== 0) {
    calculatedSplits[calculatedSplits.length - 1].amount += diff;
  }
  ```

---

### Case 3: Loose Validation of Membership Time Windows
* **The Error**: The AI validated expense participants simply by checking `GroupMember.isActive === true` in the group database.
* **The Bug**: It did not take the expense transaction `date` into account. This allowed importing or recording expenses on historical dates (e.g. 6 months ago) and charging members who had not yet joined the group at that time.
* **How Caught**: Discovered during review of edge cases regarding joining and leaving groups.
* **The Correction**: Created a dedicated helper function `getMembershipAtDate` that checks the transaction date against both `joinDate` and `leaveDate`:
  ```typescript
  const checkTime = new Date(date).getTime();
  const joinTime = new Date(membership.joinDate).getTime();
  if (joinTime > checkTime) {
    return { isMember: false }; // expense occurred before member joined
  }
  ```

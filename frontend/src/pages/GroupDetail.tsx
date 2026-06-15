import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';

interface User {
  id: string;
  name: string;
  email: string;
}

interface GroupMember {
  id: string;
  userId: string;
  joinDate: string;
  leaveDate: string | null;
  isActive: boolean;
  user: User;
}

interface ExpenseSplit {
  id: string;
  userId: string;
  amount: number;
  percentage: number | null;
  user: User;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  paidById: string;
  splitType: string;
  paidBy: User;
  splits: ExpenseSplit[];
}

interface Settlement {
  id: string;
  amount: number;
  date: string;
  payFromId: string;
  payToId: string;
  payFrom: User;
  payTo: User;
}

interface GroupDetailData {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  createdById: string;
  members: GroupMember[];
  expenses: Expense[];
  settlements: Settlement[];
}

interface UserBalance {
  userId: string;
  name: string;
  email: string;
  balance: number;
  isActive: boolean;
}

interface SuggestedSettlement {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: number;
}

export const GroupDetail: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { user: currentUser } = useAuth();

  const [group, setGroup] = useState<GroupDetailData | null>(null);
  const [balances, setBalances] = useState<UserBalance[]>([]);
  const [suggestedSettlements, setSuggestedSettlements] = useState<SuggestedSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Member management states
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberJoinDate, setMemberJoinDate] = useState(new Date().toISOString().substring(0, 10));
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  // Expense modal states
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(new Date().toISOString().substring(0, 10));
  const [expPaidById, setExpPaidById] = useState('');
  const [expSplitType, setExpSplitType] = useState('EQUAL'); // EQUAL, EXACT, PERCENTAGE
  const [expParticipants, setExpParticipants] = useState<Record<string, { checked: boolean; value: string }>>({});
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  // Settlement modal states
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleFromId, setSettleFromId] = useState('');
  const [settleToId, setSettleToId] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleDate, setSettleDate] = useState(new Date().toISOString().substring(0, 10));
  const [settleLoading, setSettleLoading] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  const fetchGroupDetail = async () => {
    if (!groupId) return;
    try {
      setLoading(true);
      
      // Fetch details and balances in parallel
      const [detailRes, balanceRes] = await Promise.all([
        api.get<{ group: GroupDetailData }>(`/groups/${groupId}`),
        api.get<{ balances: UserBalance[]; suggestedSettlements: SuggestedSettlement[] }>(`/groups/${groupId}/balances`)
      ]);

      setGroup(detailRes.group);
      setBalances(balanceRes.balances);
      setSuggestedSettlements(balanceRes.suggestedSettlements);
      setError(null);

      // Pre-fill default paidById for expense creation
      if (detailRes.group.members.length > 0) {
        const activeMembers = detailRes.group.members.filter(m => m.isActive);
        const currentIsActive = activeMembers.find(m => m.userId === currentUser?.id);
        setExpPaidById(currentIsActive ? currentUser?.id || '' : activeMembers[0]?.userId || '');

        // Initialize participants dictionary
        const participantInit: Record<string, { checked: boolean; value: string }> = {};
        activeMembers.forEach((m) => {
          participantInit[m.userId] = { checked: true, value: '' };
        });
        setExpParticipants(participantInit);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch group details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupDetail();
  }, [groupId]);

  // Handle adding a member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberEmail.trim()) {
      setMemberError('Email is required.');
      return;
    }

    setMemberLoading(true);
    setMemberError(null);

    try {
      await api.post(`/groups/${groupId}/members`, {
        email: memberEmail.trim(),
        joinDate: new Date(memberJoinDate).toISOString(),
      });
      setMemberEmail('');
      setShowMemberModal(false);
      await fetchGroupDetail();
    } catch (err: any) {
      setMemberError(err.message || 'Failed to add member.');
    } finally {
      setMemberLoading(false);
    }
  };

  // Handle member leaving
  const handleRemoveMember = async (memberUserId: string) => {
    if (!window.confirm('Are you sure you want to remove this member from the group?')) return;
    try {
      await api.post(`/groups/${groupId}/members/${memberUserId}/leave`, {
        leaveDate: new Date().toISOString(),
      });
      await fetchGroupDetail();
    } catch (err: any) {
      alert(err.message || 'Failed to remove member.');
    }
  };

  // Handle Expense deletion
  const handleDeleteExpense = async (expenseId: string) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    try {
      await api.delete(`/groups/${groupId}/expenses/${expenseId}`);
      await fetchGroupDetail();
    } catch (err: any) {
      alert(err.message || 'Failed to delete expense.');
    }
  };

  // Handle Participant check toggles
  const handleParticipantToggle = (userId: string) => {
    setExpParticipants((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], checked: !prev[userId].checked },
    }));
  };

  // Handle Participant custom split input value
  const handleParticipantValueChange = (userId: string, val: string) => {
    setExpParticipants((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], value: val },
    }));
  };

  // Handle adding/submitting an expense
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expDescription.trim() || !expAmount || !expPaidById) {
      setExpenseError('Please fill in all mandatory fields.');
      return;
    }

    const totalVal = parseFloat(expAmount);
    if (isNaN(totalVal) || totalVal <= 0) {
      setExpenseError('Amount must be a positive number.');
      return;
    }

    // Build splits list
    const participantList = Object.entries(expParticipants)
      .filter(([_, data]) => data.checked)
      .map(([userId, data]) => ({
        userId,
        value: expSplitType === 'EQUAL' ? undefined : parseFloat(data.value),
      }));

    if (participantList.length === 0) {
      setExpenseError('You must check at least one participant.');
      return;
    }

    // Validation checks for split amounts
    if (expSplitType === 'EXACT') {
      const sum = participantList.reduce((acc, p) => acc + (p.value || 0), 0);
      if (Math.abs(sum - totalVal) > 0.02) {
        setExpenseError(`Sum of splits ($${sum.toFixed(2)}) must match total expense ($${totalVal.toFixed(2)})`);
        return;
      }
    } else if (expSplitType === 'PERCENTAGE') {
      const sum = participantList.reduce((acc, p) => acc + (p.value || 0), 0);
      if (Math.abs(sum - 100) > 0.01) {
        setExpenseError(`Sum of percentages (${sum}%) must equal 100%`);
        return;
      }
    }

    setExpenseLoading(true);
    setExpenseError(null);

    try {
      await api.post(`/groups/${groupId}/expenses`, {
        description: expDescription.trim(),
        amount: totalVal,
        date: new Date(expDate).toISOString(),
        paidById: expPaidById,
        splitType: expSplitType,
        splits: participantList,
      });

      // Clear expense states
      setExpDescription('');
      setExpAmount('');
      setShowExpenseModal(false);
      await fetchGroupDetail();
    } catch (err: any) {
      setExpenseError(err.message || 'Failed to record expense.');
    } finally {
      setExpenseLoading(false);
    }
  };

  // Open Settle Modal pre-filled
  const openSettleModalPrefilled = (fromId: string, toId: string, amount: number) => {
    setSettleFromId(fromId);
    setSettleToId(toId);
    setSettleAmount(amount.toString());
    setSettleDate(new Date().toISOString().substring(0, 10));
    setSettleError(null);
    setShowSettleModal(true);
  };

  // Submit Settlement
  const handleRecordSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleFromId || !settleToId || !settleAmount) {
      setSettleError('Please fill in all fields.');
      return;
    }

    const amountVal = parseFloat(settleAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setSettleError('Amount must be a positive number.');
      return;
    }

    if (settleFromId === settleToId) {
      setSettleError('Members must be different.');
      return;
    }

    setSettleLoading(true);
    setSettleError(null);

    try {
      await api.post(`/groups/${groupId}/settlements`, {
        payFromId: settleFromId,
        payToId: settleToId,
        amount: amountVal,
        date: new Date(settleDate).toISOString(),
      });

      setShowSettleModal(false);
      setSettleAmount('');
      await fetchGroupDetail();
    } catch (err: any) {
      setSettleError(err.message || 'Failed to record settlement.');
    } finally {
      setSettleLoading(false);
    }
  };

  const activeMembers = group?.members.filter(m => m.isActive) || [];

  if (loading && !group) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <svg className="animate-spin h-8 w-8 text-primary-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center justify-center">
        <div className="bg-red-50 border border-red-200 text-red-600 px-6 py-4 rounded-2xl max-w-md text-center">
          <p className="font-bold">Error loading page</p>
          <p className="text-sm mt-1">{error || 'Group not found.'}</p>
          <Link to="/" className="inline-block mt-4 text-sm font-semibold bg-red-100 px-4 py-2 rounded-xl">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 py-4 px-6 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link to="/" className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 font-semibold text-sm">
            <span>← Back to Dashboard</span>
          </Link>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">{group.name}</h1>
          <div className="w-24"></div> {/* spacer */}
        </div>
      </header>

      <main className="max-w-6xl mx-auto py-12 px-6">
        {/* Top Info Section */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm mb-8 flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">{group.name}</h2>
            <p className="text-slate-500 text-sm mt-1">{group.description || 'No description provided.'}</p>
          </div>
          <div className="flex flex-wrap gap-2.5 mt-4 md:mt-0">
            <button
              onClick={() => setShowMemberModal(true)}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-semibold text-slate-700 transition-colors"
            >
              + Invite Member
            </button>
            <button
              onClick={() => {
                setSettleFromId(activeMembers[0]?.userId || '');
                setSettleToId(activeMembers[1]?.userId || '');
                setSettleAmount('');
                setSettleError(null);
                setShowSettleModal(true);
              }}
              className="py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-sm font-semibold transition-colors"
            >
              Settle Up
            </button>
            <button
              onClick={() => setShowExpenseModal(true)}
              className="py-2.5 px-5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-primary-200"
            >
              + Record Expense
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Members & Balances Column */}
          <div className="space-y-8 lg:col-span-1">
            {/* Balances Ledger Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Balances Ledger</h3>
              <div className="space-y-3">
                {balances.map((b) => (
                  <div key={b.userId} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0 text-sm">
                    <span className={`font-medium ${b.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                      {b.name}
                    </span>
                    {b.balance > 0 ? (
                      <span className="text-emerald-600 font-semibold bg-emerald-50 px-2 py-1 rounded-lg text-xs">
                        is owed ${b.balance.toFixed(2)}
                      </span>
                    ) : b.balance < 0 ? (
                      <span className="text-red-600 font-semibold bg-red-50 px-2 py-1 rounded-lg text-xs">
                        owes ${Math.abs(b.balance).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded-lg text-xs">
                        settled up
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Suggested Settlements (simplification) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Suggested Settlements</h3>
              {suggestedSettlements.length === 0 ? (
                <div className="p-4 bg-emerald-50 text-emerald-800 text-center rounded-xl text-xs font-semibold">
                  🎉 Everyone is fully settled up!
                </div>
              ) : (
                <div className="space-y-4">
                  {suggestedSettlements.map((s, idx) => (
                    <div key={idx} className="p-3 bg-slate-55 bg-slate-50/50 hover:bg-slate-50 border border-slate-100 rounded-xl text-xs flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-slate-700">{s.fromName}</span>
                        <span className="text-slate-400 mx-1">owes</span>
                        <span className="font-semibold text-slate-700">{s.toName}</span>
                        <div className="font-bold text-slate-950 mt-1 text-sm">${s.amount.toFixed(2)}</div>
                      </div>
                      <button
                        onClick={() => openSettleModalPrefilled(s.fromUserId, s.toUserId, s.amount)}
                        className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors"
                      >
                        Settle
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Members list */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Active Members ({activeMembers.length})</h3>
              <div className="space-y-4">
                {group.members.map((member) => (
                  <div key={member.id} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                    <div>
                      <p className={`font-semibold text-sm ${member.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                        {member.user.name}
                      </p>
                      <p className="text-slate-400 text-xs mt-0.5">{member.user.email}</p>
                      <p className="text-slate-400 text-[10px] mt-0.5">
                        Joined {new Date(member.joinDate).toLocaleDateString()}
                        {member.leaveDate && ` • Left ${new Date(member.leaveDate).toLocaleDateString()}`}
                      </p>
                    </div>
                    {member.isActive && member.userId !== group.createdById && (
                      <button
                        onClick={() => handleRemoveMember(member.userId)}
                        className="text-xs font-semibold text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded-lg"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Expenses & Settlements Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Expenses Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 mb-6">Group Expenses</h3>
              {group.expenses.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm font-medium">
                  No expenses recorded yet. Record an expense to see it here!
                </div>
              ) : (
                <div className="space-y-6">
                  {group.expenses.map((expense) => (
                    <div key={expense.id} className="flex justify-between items-start p-4 rounded-xl hover:bg-slate-50 border border-slate-100/50 transition-colors">
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-800">{expense.description}</h4>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-slate-500 text-xs">
                          <span>Paid by <strong className="text-slate-700">{expense.paidBy.name}</strong></span>
                          <span>•</span>
                          <span>{new Date(expense.date).toLocaleDateString()}</span>
                          <span>•</span>
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold text-slate-600">{expense.splitType}</span>
                        </div>
                        <div className="text-slate-400 text-xs pt-2">
                          <strong>Participants: </strong>
                          {expense.splits.map(s => `${s.user.name} ($${s.amount.toFixed(2)})`).join(', ')}
                        </div>
                      </div>
                      <div className="flex flex-col items-end space-y-2">
                        <span className="text-lg font-extrabold text-slate-800">${expense.amount.toFixed(2)}</span>
                        {(expense.paidById === currentUser?.id || group.createdById === currentUser?.id) && (
                          <button
                            onClick={() => handleDeleteExpense(expense.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-semibold"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Settlements History Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 mb-6">Settlement Payments History</h3>
              {group.settlements.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm font-medium bg-slate-50/55 rounded-2xl border border-dashed border-slate-150">
                  No settlements recorded yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {group.settlements.map((settlement) => (
                    <div key={settlement.id} className="p-4 rounded-xl border border-slate-100 flex justify-between items-center text-sm hover:bg-slate-50 transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 text-sm">
                          ✓
                        </div>
                        <div>
                          <p className="text-slate-700">
                            <strong className="font-semibold text-slate-800">{settlement.payFrom.name}</strong> paid{' '}
                            <strong className="font-semibold text-slate-800">{settlement.payTo.name}</strong>
                          </p>
                          <p className="text-slate-400 text-[10px] mt-0.5">
                            {new Date(settlement.date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-extrabold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                        ${settlement.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Add Member Modal */}
      {showMemberModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Add Group Member</h3>
              <button onClick={() => setShowMemberModal(false)} className="text-slate-400 hover:text-slate-600 text-lg p-1">✕</button>
            </div>

            {memberError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-xl text-sm mb-4 text-center">
                {memberError}
              </div>
            )}

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Registered User Email</label>
                <input
                  type="email"
                  required
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="e.g. bob@example.com"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Join Date</label>
                <input
                  type="date"
                  required
                  value={memberJoinDate}
                  onChange={(e) => setMemberJoinDate(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowMemberModal(false)}
                  className="py-2.5 px-4 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={memberLoading}
                  className="py-2.5 px-5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-primary-200 flex items-center space-x-2"
                >
                  {memberLoading ? 'Inviting...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-xl w-full p-6 animate-in fade-in zoom-in-95 duration-150 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Record Expense</h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-slate-600 text-lg p-1">✕</button>
            </div>

            {expenseError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-xl text-sm mb-4 text-center">
                {expenseError}
              </div>
            )}

            <form onSubmit={handleAddExpense} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <input
                    type="text"
                    required
                    value={expDescription}
                    onChange={(e) => setExpDescription(e.target.value)}
                    placeholder="e.g. Dinner, Rent, Electricity"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Paid By</label>
                  <select
                    value={expPaidById}
                    onChange={(e) => setExpPaidById(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm"
                  >
                    {activeMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>{m.user.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Split Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {['EQUAL', 'EXACT', 'PERCENTAGE'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setExpSplitType(type)}
                      className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                        expSplitType === type
                          ? 'border-primary-600 bg-primary-50 text-primary-700 font-bold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Participants Split Matrix */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Split Participants</label>
                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100 max-h-52 overflow-y-auto">
                  {activeMembers.map((m) => {
                    const part = expParticipants[m.userId] || { checked: false, value: '' };
                    return (
                      <div key={m.userId} className="flex justify-between items-center text-sm">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={part.checked}
                            onChange={() => handleParticipantToggle(m.userId)}
                            className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4"
                          />
                          <span className="font-medium text-slate-700">{m.user.name}</span>
                        </label>

                        {part.checked && expSplitType !== 'EQUAL' && (
                          <div className="flex items-center space-x-1.5">
                            <span className="text-slate-400 text-xs">{expSplitType === 'PERCENTAGE' ? '%' : '$'}</span>
                            <input
                              type="number"
                              step="0.01"
                              required
                              value={part.value}
                              onChange={(e) => handleParticipantValueChange(m.userId, e.target.value)}
                              placeholder={expSplitType === 'PERCENTAGE' ? '0' : '0.00'}
                              className="w-20 px-2 py-1 border border-slate-200 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-center text-xs"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="py-2.5 px-4 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={expenseLoading}
                  className="py-2.5 px-5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-primary-200 flex items-center space-x-2"
                >
                  {expenseLoading ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settle Up (Settlement) Modal */}
      {showSettleModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Record Settlement</h3>
              <button onClick={() => setShowSettleModal(false)} className="text-slate-400 hover:text-slate-600 text-lg p-1">✕</button>
            </div>

            {settleError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-xl text-sm mb-4 text-center">
                {settleError}
              </div>
            )}

            <form onSubmit={handleRecordSettlement} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pay From (Debtor)</label>
                <select
                  value={settleFromId}
                  onChange={(e) => setSettleFromId(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm"
                >
                  {activeMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>{m.user.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pay To (Creditor)</label>
                <select
                  value={settleToId}
                  onChange={(e) => setSettleToId(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm"
                >
                  {activeMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>{m.user.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="py-2.5 px-4 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settleLoading}
                  className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-200 flex items-center space-x-2"
                >
                  {settleLoading ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../context/ToastContext';

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

interface ImportAnomaly {
  rowNumber: number;
  severity: string;
  type: string;
  message: string;
}

interface ImportScanResult {
  jobId: string;
  status: string;
  totalRowsScanned: number;
  anomaliesCount: number;
  anomalies: ImportAnomaly[];
  validExpensesCount: number;
  validatedExpenses?: any[];
}

export const GroupDetail: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

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

  // CSV Importer states
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importScanResult, setImportScanResult] = useState<ImportScanResult | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [approvedRowNumbers, setApprovedRowNumbers] = useState<Record<number, boolean>>({});
  const [selectedAuditUser, setSelectedAuditUser] = useState<UserBalance | null>(null);

  const getMembersActiveOnDate = (dateStr: string) => {
    if (!group) return [];
    const date = new Date(dateStr);
    const time = date.getTime();
    return group.members.filter((m) => {
      const joinTime = new Date(m.joinDate).getTime();
      if (joinTime > time) return false;
      if (m.leaveDate) {
        const leaveTime = new Date(m.leaveDate).getTime();
        if (leaveTime < time) return false;
      }
      if (!m.isActive && !m.leaveDate) {
        return false;
      }
      return true;
    });
  };

  const [expenseMembers, setExpenseMembers] = useState<GroupMember[]>([]);
  const [settleMembers, setSettleMembers] = useState<GroupMember[]>([]);

  useEffect(() => {
    if (!group) return;
    const activeOnDate = getMembersActiveOnDate(expDate);
    setExpenseMembers(activeOnDate);

    if (activeOnDate.length > 0) {
      const isPaidByStillActive = activeOnDate.some((m) => m.userId === expPaidById);
      if (!isPaidByStillActive) {
        const currentIsActive = activeOnDate.find((m) => m.userId === currentUser?.id);
        setExpPaidById(currentIsActive ? currentUser?.id || '' : activeOnDate[0]?.userId || '');
      }

      setExpParticipants((prev) => {
        const updated: Record<string, { checked: boolean; value: string }> = {};
        activeOnDate.forEach((m) => {
          if (prev[m.userId]) {
            updated[m.userId] = prev[m.userId];
          } else {
            updated[m.userId] = { checked: true, value: '' };
          }
        });
        return updated;
      });
    } else {
      setExpPaidById('');
      setExpParticipants({});
    }
  }, [expDate, group]);

  useEffect(() => {
    if (!group) return;
    const activeOnDate = getMembersActiveOnDate(settleDate);
    setSettleMembers(activeOnDate);

    if (activeOnDate.length > 0) {
      const isFromStillActive = activeOnDate.some((m) => m.userId === settleFromId);
      const isToStillActive = activeOnDate.some((m) => m.userId === settleToId);

      if (!isFromStillActive) {
        setSettleFromId(activeOnDate[0]?.userId || '');
      }
      if (!isToStillActive) {
        setSettleToId(activeOnDate[1]?.userId || activeOnDate[0]?.userId || '');
      }
    } else {
      setSettleFromId('');
      setSettleToId('');
    }
  }, [settleDate, group]);

  const fetchGroupDetail = async () => {
    if (!groupId) return;
    try {
      setLoading(true);
      
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
      toast('Member added successfully!', 'success');
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
      toast('Member removed from active list.', 'info');
      await fetchGroupDetail();
    } catch (err: any) {
      toast(err.message || 'Failed to remove member.', 'error');
    }
  };

  // Handle Expense deletion
  const handleDeleteExpense = async (expenseId: string) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    try {
      await api.delete(`/groups/${groupId}/expenses/${expenseId}`);
      toast('Expense deleted successfully.', 'info');
      await fetchGroupDetail();
    } catch (err: any) {
      toast(err.message || 'Failed to delete expense.', 'error');
    }
  };

  // Handle Group deletion
  const handleDeleteGroup = async () => {
    if (!window.confirm('Are you sure you want to delete this group? All expenses, settlements, and member relationships will be permanently deleted. This action cannot be undone.')) return;
    try {
      await api.delete(`/groups/${groupId}`);
      toast('Group deleted successfully.', 'success');
      window.location.href = '/';
    } catch (err: any) {
      toast(err.message || 'Failed to delete group.', 'error');
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
        setExpenseError(`Sum of splits (₹${sum.toFixed(2)}) must match total expense (₹${totalVal.toFixed(2)})`);
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
      toast('Expense recorded successfully!', 'success');
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
      toast('Settlement recorded successfully!', 'success');
      await fetchGroupDetail();
    } catch (err: any) {
      setSettleError(err.message || 'Failed to record settlement.');
    } finally {
      setSettleLoading(false);
    }
  };

  // Handle CSV file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setImportError(null);
    }
  };

  // Upload and scan CSV
  const handleCSVUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setImportError('Please select a CSV file.');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    setImportLoading(true);
    setImportError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/groups/${groupId}/imports`, {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to scan CSV file.');
      }

      setImportScanResult(data);
      if (data.validatedExpenses) {
        const initChecked: Record<number, boolean> = {};
        data.validatedExpenses.forEach((exp: any) => {
          initChecked[exp.rowNumber] = true;
        });
        setApprovedRowNumbers(initChecked);
      }

      if (data.status === 'FAILED') {
        toast('CSV scan detected critical errors.', 'error');
      } else {
        toast('CSV scan complete with warnings.', 'info');
      }
    } catch (err: any) {
      setImportError(err.message || 'Error occurred while scanning CSV.');
    } finally {
      setImportLoading(false);
    }
  };

  // Confirm and save CSV expenses
  const handleCSVConfirm = async (action: 'APPROVE' | 'REJECT') => {
    if (!importScanResult) return;

    setImportLoading(true);
    setImportError(null);

    try {
      const approvedRows = Object.keys(approvedRowNumbers)
        .map(Number)
        .filter(rowNum => approvedRowNumbers[rowNum]);

      await api.post(`/groups/${groupId}/imports/${importScanResult.jobId}/confirm`, {
        action,
        approvedRowNumbers: approvedRows,
      });

      if (action === 'APPROVE') {
        toast('CSV imported successfully!', 'success');
      } else {
        toast('Import job rejected.', 'info');
      }

      setShowImportModal(false);
      setSelectedFile(null);
      setImportScanResult(null);
      await fetchGroupDetail();
    } catch (err: any) {
      setImportError(err.message || 'Failed to complete import processing.');
    } finally {
      setImportLoading(false);
    }
  };

  const activeMembers = group?.members.filter(m => m.isActive) || [];

  if (loading && !group) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <svg className="animate-spin h-9 w-9 text-primary-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="min-h-screen bg-slate-950 p-8 flex flex-col items-center justify-center text-slate-100 relative">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-primary-600/20 blur-[120px] pointer-events-none" />
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 text-white px-8 py-6 rounded-3xl max-w-md text-center shadow-2xl relative z-10">
          <p className="font-extrabold text-xl">Error loading group</p>
          <p className="text-sm text-slate-400 mt-2">{error || 'Group not found.'}</p>
          <Link to="/" className="inline-block mt-6 text-sm font-semibold bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-550 hover:to-indigo-550 px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-primary-500/20">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden font-sans pb-16">
      {/* Decorative Glowing Background Blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-primary-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[70%] rounded-full bg-indigo-600/15 blur-[130px] pointer-events-none" />
      <div className="absolute top-[40%] right-[20%] w-[35%] h-[45%] rounded-full bg-purple-600/10 blur-[100px] pointer-events-none" />

      {/* Floating Glass Header */}
      <header className="sticky top-0 z-40 bg-slate-900/40 backdrop-blur-md border-b border-white/5 py-4 px-6">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link to="/" className="flex items-center space-x-2 text-slate-350 hover:text-white font-semibold text-sm transition-colors">
            <span>← Back to Dashboard</span>
          </Link>
          <h1 className="text-lg font-black text-white tracking-tight bg-clip-text bg-gradient-to-r from-white via-white to-slate-400">
            {group.name}
          </h1>
          <div className="w-24"></div> {/* spacer */}
        </div>
      </header>

      <main className="max-w-6xl mx-auto py-12 px-6 relative z-10">
        {/* Top Info Section */}
        <div className="bg-white/[0.03] backdrop-blur-xl p-6 rounded-3xl border border-white/[0.06] shadow-2xl mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight bg-clip-text bg-gradient-to-r from-white to-slate-300">
              {group.name}
            </h2>
            <p className="text-slate-400 text-sm mt-1">{group.description || 'No description provided.'}</p>
          </div>
          <div className="flex flex-wrap gap-2.5 mt-4 md:mt-0">
            <button
              onClick={() => setShowMemberModal(true)}
              className="py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl text-sm font-semibold transition-all"
            >
              + Invite Member
            </button>
            <button
              onClick={() => {
                const members = getMembersActiveOnDate(new Date().toISOString().substring(0, 10));
                setSettleFromId(members[0]?.userId || '');
                setSettleToId(members[1]?.userId || members[0]?.userId || '');
                setSettleAmount('');
                setSettleDate(new Date().toISOString().substring(0, 10));
                setSettleError(null);
                setShowSettleModal(true);
              }}
              className="py-2.5 px-4 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-350 border border-emerald-500/20 rounded-xl text-sm font-semibold transition-all"
            >
              Settle Up
            </button>
            <button
              onClick={() => {
                setSelectedFile(null);
                setImportScanResult(null);
                setImportError(null);
                setShowImportModal(true);
              }}
              className="py-2.5 px-4 bg-blue-500/10 hover:bg-blue-500/20 text-blue-350 border border-blue-500/20 rounded-xl text-sm font-semibold transition-all"
            >
              Import CSV
            </button>
            <button
              onClick={() => setShowExpenseModal(true)}
              className="py-2.5 px-5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-550 hover:to-indigo-550 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30"
            >
              + Record Expense
            </button>
            {group.createdById === currentUser?.id && (
              <button
                onClick={handleDeleteGroup}
                className="py-2.5 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 rounded-xl text-sm font-semibold transition-all"
              >
                Delete Group
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Members & Balances Column */}
          <div className="space-y-8 lg:col-span-1">
            {/* Balances Ledger Card */}
            <div className="bg-white/[0.03] backdrop-blur-xl p-6 rounded-3xl border border-white/[0.06] shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-4">Balances Ledger</h3>
              <div className="space-y-3">
                {balances.map((b) => (
                  <div
                    key={b.userId}
                    onClick={() => setSelectedAuditUser(b)}
                    className="flex justify-between items-center py-2.5 px-3 hover:bg-white/5 rounded-xl cursor-pointer border border-transparent hover:border-white/5 transition-all text-sm group"
                  >
                    <span className={`font-semibold group-hover:text-primary-400 transition-colors ${b.isActive ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                      {b.name}
                    </span>
                    <div className="flex items-center space-x-1.5">
                      {b.balance > 0 ? (
                        <span className="text-emerald-450 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg text-xs">
                          is owed ₹{b.balance.toFixed(2)}
                        </span>
                      ) : b.balance < 0 ? (
                        <span className="text-red-400 font-bold bg-red-500/10 px-2.5 py-1 rounded-lg text-xs">
                          owes ₹{Math.abs(b.balance).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-bold bg-white/5 px-2.5 py-1 rounded-lg text-xs">
                          settled up
                        </span>
                      )}
                      <span className="text-slate-500 group-hover:text-slate-300 transition-colors text-xs">🔍</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Suggested Settlements */}
            <div className="bg-white/[0.03] backdrop-blur-xl p-6 rounded-3xl border border-white/[0.06] shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-4">Suggested Settlements</h3>
              {suggestedSettlements.length === 0 ? (
                <div className="p-4 bg-emerald-500/10 text-emerald-300 text-center rounded-xl text-xs font-semibold border border-emerald-500/15">
                  🎉 Everyone is fully settled up!
                </div>
              ) : (
                <div className="space-y-4">
                  {suggestedSettlements.map((s, idx) => (
                    <div key={idx} className="p-4 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 rounded-2xl text-xs flex justify-between items-center gap-3">
                      <div>
                        <span className="font-semibold text-slate-200">{s.fromName}</span>
                        <span className="text-slate-505 text-slate-500 mx-1">owes</span>
                        <span className="font-semibold text-slate-200">{s.toName}</span>
                        <div className="font-bold text-white mt-1 text-sm">₹{s.amount.toFixed(2)}</div>
                      </div>
                      <button
                        onClick={() => openSettleModalPrefilled(s.fromUserId, s.toUserId, s.amount)}
                        className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-555 text-white rounded-lg font-semibold transition-colors"
                      >
                        Settle
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Members list */}
            <div className="bg-white/[0.03] backdrop-blur-xl p-6 rounded-3xl border border-white/[0.06] shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-4">Active Members ({activeMembers.length})</h3>
              <div className="space-y-4">
                {group.members.map((member) => (
                  <div key={member.id} className="flex justify-between items-center py-2.5 border-b border-white/5 last:border-0">
                    <div>
                      <p className={`font-semibold text-sm ${member.isActive ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                        {member.user.name}
                      </p>
                      <p className="text-slate-400 text-xs mt-0.5">{member.user.email}</p>
                      <p className="text-slate-500 text-[10px] mt-0.5">
                        Joined {new Date(member.joinDate).toLocaleDateString()}
                        {member.leaveDate && ` • Left ${new Date(member.leaveDate).toLocaleDateString()}`}
                      </p>
                    </div>
                    {member.isActive && member.userId !== group.createdById && (
                      <button
                        onClick={() => handleRemoveMember(member.userId)}
                        className="text-xs font-semibold text-red-400 hover:text-red-350 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 rounded-lg border border-red-500/20 transition-all"
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
                          {expense.splits.map(s => `${s.user.name} (₹${s.amount.toFixed(2)})`).join(', ')}
                        </div>
                      </div>
                      <div className="flex flex-col items-end space-y-2">
                        <span className="text-lg font-extrabold text-slate-800">₹{expense.amount.toFixed(2)}</span>
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
                        ₹{settlement.amount.toFixed(2)}
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-3xl border border-white/10 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Add Group Member</h3>
              <button onClick={() => setShowMemberModal(false)} className="text-slate-400 hover:text-white text-lg p-1 transition-colors">✕</button>
            </div>

            {memberError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-xl text-sm mb-4 text-center">
                {memberError}
              </div>
            )}

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-350 mb-1.5">Registered User Email</label>
                <input
                  type="email"
                  required
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="e.g. bob@example.com"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-slate-800/50 text-sm placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-350 mb-1.5">Join Date</label>
                <input
                  type="date"
                  required
                  value={memberJoinDate}
                  onChange={(e) => setMemberJoinDate(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-slate-800/50 text-sm color-scheme-dark"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowMemberModal(false)}
                  className="py-2.5 px-4 bg-white/5 border border-white/10 rounded-xl text-sm font-semibold text-slate-300 hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={memberLoading}
                  className="py-2.5 px-5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-550 hover:to-indigo-550 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-primary-500/20 flex items-center space-x-2"
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-3xl border border-white/10 max-w-xl w-full p-6 animate-in fade-in zoom-in-95 duration-150 overflow-y-auto max-h-[90vh] shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Record Expense</h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-slate-600 text-lg p-1">✕</button>
            </div>

            {expenseError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2.5 rounded-xl text-sm mb-4 text-center">
                {expenseError}
              </div>
            )}

            <form onSubmit={handleAddExpense} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-350 mb-1.5">Description</label>
                  <input
                    type="text"
                    required
                    value={expDescription}
                    onChange={(e) => setExpDescription(e.target.value)}
                    placeholder="e.g. Dinner, Rent, Electricity"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-slate-800/50 text-sm placeholder:text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-350 mb-1.5">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-slate-800/50 text-sm placeholder:text-slate-550 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-350 mb-1.5">Date</label>
                  <input
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-slate-800/50 text-sm color-scheme-dark"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-350 mb-1.5">Paid By</label>
                  <select
                    value={expPaidById}
                    onChange={(e) => setExpPaidById(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-white/10 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  >
                    {expenseMembers.map((m) => (
                      <option key={m.userId} value={m.userId} className="bg-slate-900 text-white">{m.user.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-350 mb-1.5">Split Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {['EQUAL', 'EXACT', 'PERCENTAGE'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setExpSplitType(type)}
                      className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                        expSplitType === type
                          ? 'border-primary-500 bg-primary-600/10 text-primary-400 font-bold'
                          : 'border-white/10 text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Participants Split Matrix */}
              <div>
                <label className="block text-sm font-semibold text-slate-350 mb-2">Split Participants</label>
                <div className="space-y-3 bg-white/[0.02] p-4 rounded-xl border border-white/5 max-h-52 overflow-y-auto">
                  {expenseMembers.map((m) => {
                    const part = expParticipants[m.userId] || { checked: false, value: '' };
                    return (
                      <div key={m.userId} className="flex justify-between items-center text-sm py-1">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={part.checked}
                            onChange={() => handleParticipantToggle(m.userId)}
                            className="rounded text-primary-500 focus:ring-primary-500 h-4 w-4 bg-white/5 border-white/10"
                          />
                          <span className="font-medium text-slate-200">{m.user.name}</span>
                        </label>

                        {part.checked && expSplitType !== 'EQUAL' && (
                          <div className="flex items-center space-x-1.5">
                            <span className="text-slate-400 text-xs">{expSplitType === 'PERCENTAGE' ? '%' : '₹'}</span>
                            <input
                              type="number"
                              step="0.01"
                              required
                              value={part.value}
                              onChange={(e) => handleParticipantValueChange(m.userId, e.target.value)}
                              placeholder={expSplitType === 'PERCENTAGE' ? '0' : '0.00'}
                              className="w-24 px-2.5 py-1.5 bg-white/5 border border-white/10 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-center text-xs placeholder:text-slate-500"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="py-2.5 px-4 bg-white/5 border border-white/10 rounded-xl text-sm font-semibold text-slate-300 hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={expenseLoading}
                  className="py-2.5 px-5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-550 hover:to-indigo-550 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-primary-500/20 flex items-center space-x-2"
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
                  {settleMembers.map((m) => (
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
                  {settleMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>{m.user.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹)</label>
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

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-2xl w-full p-6 animate-in fade-in zoom-in-95 duration-150 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800 font-sans">Import Expenses from CSV</h3>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setSelectedFile(null);
                  setImportScanResult(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-lg p-1"
              >
                ✕
              </button>
            </div>

            {importError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm mb-4 text-center font-medium">
                {importError}
              </div>
            )}

            {!importScanResult ? (
              <form onSubmit={handleCSVUpload} className="space-y-6">
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center bg-slate-50 hover:bg-slate-100/50 transition-colors cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv"
                    required
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="space-y-2">
                    <div className="text-4xl text-slate-400">📄</div>
                    <p className="font-bold text-slate-700 text-sm">
                      {selectedFile ? selectedFile.name : 'Choose a CSV file or drag it here'}
                    </p>
                    <p className="text-slate-400 text-xs">Only .csv files are supported</p>
                  </div>
                </div>

                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 leading-relaxed">
                  <p className="font-bold mb-1">CSV Template Format:</p>
                  <code className="block bg-blue-100/50 p-2 rounded text-[11px] overflow-x-auto text-blue-900 font-mono">
                    date,description,paid_by,amount,currency,split_type,split_with,split_details
                  </code>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-blue-700">
                    <li><strong>paid_by</strong>: Registered name of the payer (e.g. Aisha, Priya)</li>
                    <li><strong>split_type</strong>: equal, unequal, percentage, or share</li>
                    <li><strong>split_with</strong>: Semicolon-separated participant names (e.g. Aisha;Rohan;Priya)</li>
                    <li><strong>split_details</strong>: Required for unequal, percentage, share. Matches name to value (e.g. Rohan 700; Priya 400 or Rohan 30%; Priya 30% or Rohan 1; Priya 2)</li>
                    <li><strong>currency</strong> (optional): Defaults to INR. Supports USD for automatic exchange rates.</li>
                  </ul>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    className="py-2.5 px-4 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={importLoading || !selectedFile}
                    className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {importLoading ? 'Scanning...' : 'Scan CSV'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-xl border bg-slate-50 border-slate-150 text-sm">
                  <div>
                    <span className="text-slate-500">Total Scanned: </span>
                    <strong className="text-slate-800">{importScanResult.totalRowsScanned} rows</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Valid: </span>
                    <strong className="text-slate-800">{importScanResult.validExpensesCount} expenses</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Anomalies Detected: </span>
                    <strong className={`px-2 py-0.5 rounded text-xs ${importScanResult.anomaliesCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                      {importScanResult.anomaliesCount}
                    </strong>
                  </div>
                </div>

                {importScanResult.status === 'FAILED' ? (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm font-medium">
                    ❌ Scan failed. The file contains critical errors that must be fixed before importing.
                  </div>
                ) : importScanResult.anomaliesCount > 0 ? (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm font-medium">
                    ⚠️ Scan complete with warnings. Review warnings below before importing.
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-xl text-sm font-medium">
                    🎉 Scan successful! All rows are clean and ready to import.
                  </div>
                )}

                {importScanResult.anomalies.length > 0 && (
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm mb-2">Detected Anomalies</h4>
                    <div className="border border-slate-100 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                            <th className="p-3">Row</th>
                            <th className="p-3">Severity</th>
                            <th className="p-3">Type</th>
                            <th className="p-3">Message</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {importScanResult.anomalies.map((a, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="p-3 font-semibold text-slate-700">{a.rowNumber}</td>
                              <td className="p-3">
                                <span className={`px-1.5 py-0.5 rounded-[5px] text-[10px] font-extrabold uppercase ${
                                  a.severity === 'ERROR' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {a.severity}
                                </span>
                              </td>
                              <td className="p-3 text-slate-600 font-medium">{a.type}</td>
                              <td className="p-3 text-slate-500 leading-normal">{a.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {importScanResult.validatedExpenses && importScanResult.validatedExpenses.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-800 text-sm">Select Transactions to Import (Meera's Request)</h4>
                    <div className="border border-slate-100 rounded-xl max-h-52 overflow-y-auto p-3 bg-slate-50/20 space-y-2">
                      {importScanResult.validatedExpenses.map((exp: any) => (
                        <label key={exp.rowNumber} className="flex items-start space-x-3 text-xs text-slate-700 hover:bg-slate-50 p-2 rounded-lg cursor-pointer border border-slate-100/50 bg-white">
                          <input
                            type="checkbox"
                            checked={approvedRowNumbers[exp.rowNumber] ?? true}
                            onChange={() => {
                              setApprovedRowNumbers(prev => ({
                                ...prev,
                                [exp.rowNumber]: !prev[exp.rowNumber]
                              }));
                            }}
                            className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4 mt-0.5"
                          />
                          <div>
                            <span className="font-bold text-slate-800">Row {exp.rowNumber}: {exp.description}</span>
                            {exp.isSettlement ? (
                              <>
                                <span className="text-slate-500 font-medium"> • ₹{exp.amount.toFixed(2)} • Paid by {group?.members.find(m => m.userId === exp.paidById)?.user.name} to {group?.members.find(m => m.userId === exp.recipientId)?.user.name}</span>
                                <div className="text-slate-400 mt-1 font-semibold text-emerald-600">Reclassified as Group Settlement</div>
                              </>
                            ) : (
                              <>
                                <span className="text-slate-500 font-medium"> • ₹{exp.amount.toFixed(2)} • Paid by {group?.members.find(m => m.userId === exp.paidById)?.user.name}</span>
                                <div className="text-slate-400 mt-1">Split Type: {exp.splitType} • With: {exp.splits?.map((s: any) => s.name).join(', ') || ''}</div>
                              </>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => handleCSVConfirm('REJECT')}
                    disabled={importLoading}
                    className="py-2.5 px-4 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel / Reject
                  </button>
                  {importScanResult.status !== 'FAILED' && (
                    <button
                      onClick={() => handleCSVConfirm('APPROVE')}
                      disabled={importLoading}
                      className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-200"
                    >
                      {importLoading ? 'Importing...' : 'Approve & Import'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rohan's Balance Audit Trail Modal */}
      {selectedAuditUser && (() => {
        const userPaid = group.expenses.filter(e => e.paidById === selectedAuditUser.userId);
        const userOwed = group.expenses.flatMap(e => {
          const split = e.splits.find(s => s.userId === selectedAuditUser.userId);
          return split ? [{ ...e, myShare: split.amount }] : [];
        });
        const settlementsSent = group.settlements.filter(s => s.payFromId === selectedAuditUser.userId);
        const settlementsReceived = group.settlements.filter(s => s.payToId === selectedAuditUser.userId);

        const totalPaid = userPaid.reduce((sum, e) => sum + e.amount, 0);
        const totalOwed = userOwed.reduce((sum, e) => sum + e.myShare, 0);
        const totalSent = settlementsSent.reduce((sum, s) => sum + s.amount, 0);
        const totalReceived = settlementsReceived.reduce((sum, s) => sum + s.amount, 0);
        const computedBalance = totalPaid - totalOwed + totalSent - totalReceived;

        return (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-2xl w-full p-6 animate-in fade-in zoom-in-95 duration-150 overflow-y-auto max-h-[90vh]">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800 font-sans">Balance Audit Trail</h3>
                  <p className="text-slate-500 text-xs mt-0.5 font-sans">Detailed breakdown for {selectedAuditUser.name}</p>
                </div>
                <button onClick={() => setSelectedAuditUser(null)} className="text-slate-400 hover:text-slate-600 text-lg p-1">✕</button>
              </div>

              <div className="space-y-6 font-sans">
                {/* Summary cards */}
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/50">
                    <p className="text-slate-400 text-[10px] uppercase font-bold">Total Paid</p>
                    <p className="text-sm font-extrabold text-slate-700 font-sans">₹{totalPaid.toFixed(2)}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/50">
                    <p className="text-slate-400 text-[10px] uppercase font-bold">My Shares</p>
                    <p className="text-sm font-extrabold text-slate-700 font-sans">₹{totalOwed.toFixed(2)}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/50">
                    <p className="text-slate-400 text-[10px] uppercase font-bold">Settled Out</p>
                    <p className="text-sm font-extrabold text-slate-700 font-sans">₹{totalSent.toFixed(2)}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/50">
                    <p className="text-slate-400 text-[10px] uppercase font-bold">Settled In</p>
                    <p className="text-sm font-extrabold text-slate-700 font-sans">₹{totalReceived.toFixed(2)}</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl flex justify-between items-center text-sm font-bold bg-slate-50 border border-slate-100">
                  <span className="text-slate-600 font-medium">Audit Formula: Paid - Shares + Sent - Received</span>
                  <span className={computedBalance >= 0 ? 'text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg' : 'text-red-600 bg-red-50 px-2.5 py-1 rounded-lg'}>
                    ₹{computedBalance.toFixed(2)}
                  </span>
                </div>

                {/* Detailed Ledger List */}
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  <h4 className="font-bold text-slate-800 text-sm">Ledger Entries</h4>
                  
                  {userPaid.map(e => (
                    <div key={e.id} className="p-3 bg-emerald-50/35 border border-emerald-100/50 rounded-xl flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-slate-800">Paid: {e.description}</span>
                        <span className="text-slate-400 block mt-0.5">{new Date(e.date).toLocaleDateString()}</span>
                      </div>
                      <span className="font-bold text-emerald-600">+₹{e.amount.toFixed(2)}</span>
                    </div>
                  ))}

                  {userOwed.map(e => (
                    <div key={e.id} className="p-3 bg-red-50/35 border border-red-100/50 rounded-xl flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-slate-800">Owed Share: {e.description}</span>
                        <span className="text-slate-400 block mt-0.5">Paid by {group.members.find(m => m.userId === e.paidById)?.user.name} on {new Date(e.date).toLocaleDateString()}</span>
                      </div>
                      <span className="font-bold text-red-600">-₹{e.myShare.toFixed(2)}</span>
                    </div>
                  ))}

                  {settlementsSent.map(s => (
                    <div key={s.id} className="p-3 bg-blue-50/35 border border-blue-100/50 rounded-xl flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-slate-800">Sent Settlement to {s.payTo.name}</span>
                        <span className="text-slate-400 block mt-0.5">{new Date(s.date).toLocaleDateString()}</span>
                      </div>
                      <span className="font-bold text-blue-600">+₹{s.amount.toFixed(2)}</span>
                    </div>
                  ))}

                  {settlementsReceived.map(s => (
                    <div key={s.id} className="p-3 bg-amber-50/35 border border-amber-100/50 rounded-xl flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-slate-800">Received Settlement from {s.payFrom.name}</span>
                        <span className="text-slate-400 block mt-0.5">{new Date(s.date).toLocaleDateString()}</span>
                      </div>
                      <span className="font-bold text-amber-600">-₹{s.amount.toFixed(2)}</span>
                    </div>
                  ))}

                  {userPaid.length === 0 && userOwed.length === 0 && settlementsSent.length === 0 && settlementsReceived.length === 0 && (
                    <p className="text-center text-slate-400 text-xs py-4">No ledger transactions for this user.</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100 mt-6">
                <button
                  onClick={() => setSelectedAuditUser(null)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-semibold text-slate-700 transition-colors"
                >
                  Close Audit Trail
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

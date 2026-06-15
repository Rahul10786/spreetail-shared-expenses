import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';

interface Group {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Group creation form states
  const [showModal, setShowModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // CSV Import states
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importScanResult, setImportScanResult] = useState<any>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [approvedRowNumbers, setApprovedRowNumbers] = useState<Record<number, boolean>>({});

  // Import configuration states
  const [importDestinationType, setImportDestinationType] = useState<'NEW' | 'EXISTING'>('NEW');
  const [importGroupName, setImportGroupName] = useState('');
  const [importSelectedGroupId, setImportSelectedGroupId] = useState('');

  // Fetch groups
  const fetchGroups = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ groups: Group[] }>('/groups');
      setGroups(res.groups);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch groups.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  // Handle group creation
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) {
      setCreateError('Group name is required.');
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      await api.post('/groups', {
        name: newGroupName.trim(),
        description: newGroupDesc.trim() || undefined,
      });
      setNewGroupName('');
      setNewGroupDesc('');
      setShowModal(false);
      toast('Group created successfully!', 'success');
      await fetchGroups();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create group.');
    } finally {
      setCreateLoading(false);
    }
  };

  // Handle CSV file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setImportError(null);
    }
  };

  // Upload and scan CSV from Dashboard
  const handleCSVUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setImportError('Please select a CSV file.');
      return;
    }

    setImportLoading(true);
    setImportError(null);

    try {
      let targetGroupId = importSelectedGroupId;

      // If creating a new group, create it first
      if (importDestinationType === 'NEW') {
        if (!importGroupName.trim()) {
          throw new Error('Please enter a name for the new group.');
        }
        const createRes = await api.post<{ id: string; name: string }>('/groups', {
          name: importGroupName.trim(),
          description: `Imported via CSV on ${new Date().toLocaleDateString()}`,
        });
        targetGroupId = createRes.id;
      }

      if (!targetGroupId) {
        throw new Error('Please select or create a group to import into.');
      }

      // Now perform the upload
      const formData = new FormData();
      formData.append('file', selectedFile);

      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/groups/${targetGroupId}/imports`, {
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

      // Keep track of active target group ID for confirmation
      setImportSelectedGroupId(targetGroupId);

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
        toast('CSV scan complete.', 'info');
      }
    } catch (err: any) {
      setImportError(err.message || 'Error occurred while scanning CSV.');
    } finally {
      setImportLoading(false);
    }
  };

  // Confirm and save CSV expenses from Dashboard
  const handleCSVConfirm = async (action: 'APPROVE' | 'REJECT') => {
    if (!importScanResult) return;

    setImportLoading(true);
    setImportError(null);

    try {
      const approvedRows = Object.keys(approvedRowNumbers)
        .map(Number)
        .filter(rowNum => approvedRowNumbers[rowNum]);

      await api.post(`/groups/${importSelectedGroupId}/imports/${importScanResult.jobId}/confirm`, {
        action,
        approvedRowNumbers: approvedRows,
      });

      if (action === 'APPROVE') {
        toast('CSV imported successfully!', 'success');
        navigate(`/groups/${importSelectedGroupId}`);
      } else {
        toast('Import job rejected.', 'info');
        setShowImportModal(false);
        setSelectedFile(null);
        setImportScanResult(null);
        await fetchGroups();
      }
    } catch (err: any) {
      setImportError(err.message || 'Failed to complete import.');
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden font-sans">
      {/* Decorative Glowing Background Blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-primary-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[70%] rounded-full bg-indigo-600/15 blur-[130px] pointer-events-none" />
      <div className="absolute top-[40%] right-[20%] w-[35%] h-[45%] rounded-full bg-purple-600/10 blur-[100px] pointer-events-none" />

      {/* Floating Glass Header */}
      <header className="sticky top-0 z-40 bg-slate-900/40 backdrop-blur-md border-b border-white/5 py-4 px-6">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary-600 to-indigo-600 flex items-center justify-center text-white text-xl font-black shadow-lg shadow-primary-500/20">
              ₹
            </div>
            <span className="text-xl font-black text-white tracking-tight bg-clip-text bg-gradient-to-r from-white via-white to-slate-400">
              FairShare
            </span>
          </div>
          <div className="flex items-center space-x-6">
            <span className="text-sm font-medium text-slate-350">
              Hello, <strong className="text-white font-semibold">{user?.name}</strong>
            </span>
            <button
              onClick={logout}
              className="text-xs font-bold text-red-400 hover:text-red-350 bg-red-500/10 hover:bg-red-500/20 px-4 py-2 rounded-xl transition-all border border-red-500/20"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto py-16 px-6 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
          <div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight bg-clip-text bg-gradient-to-r from-white to-slate-300">
              Your Expense Groups
            </h2>
            <p className="text-slate-400 text-sm mt-2">
              Select an expense group below to track split transactions, check balances, or import logs.
            </p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button
              onClick={() => {
                setSelectedFile(null);
                setImportScanResult(null);
                setImportError(null);
                setImportGroupName('');
                setImportDestinationType('NEW');
                setImportSelectedGroupId(groups[0]?.id || '');
                setShowImportModal(true);
              }}
              className="flex-1 md:flex-none flex items-center justify-center space-x-2 py-3 px-6 bg-white/5 hover:bg-white/10 text-sm font-semibold rounded-2xl text-white shadow-lg border border-white/10 hover:border-white/20 transition-all duration-300 hover:-translate-y-0.5"
            >
              <span>Import CSV</span>
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex-1 md:flex-none flex items-center justify-center space-x-2 py-3 px-6 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-550 hover:to-indigo-550 text-sm font-semibold rounded-2xl text-white shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30 transition-all duration-300 hover:-translate-y-0.5"
            >
              <span className="text-base font-medium">+</span>
              <span>Create Group</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-350 px-5 py-3.5 rounded-2xl text-sm mb-8 text-center backdrop-blur-xl">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24">
            <svg className="animate-spin h-9 w-9 text-primary-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : groups.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-16 text-center max-w-2xl mx-auto shadow-2xl">
            <div className="w-20 h-20 bg-gradient-to-tr from-white/5 to-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-3xl shadow-inner border border-white/5">
              👥
            </div>
            <h3 className="text-xl font-bold text-white">No Expense Groups Yet</h3>
            <p className="text-slate-400 text-sm mt-3 mb-8 max-w-md mx-auto leading-relaxed">
              You are not a member of any shared expense groups. Create one to easily split house bills, travel expenses, or dinners!
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="py-3 px-6 text-sm font-semibold text-white bg-white/10 hover:bg-white/15 rounded-2xl transition-all border border-white/10"
            >
              Get Started
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map((group) => (
              <div
                key={group.id}
                onClick={() => navigate(`/groups/${group.id}`)}
                className="bg-white/[0.03] hover:bg-white/[0.07] backdrop-blur-xl p-6 rounded-3xl border border-white/[0.06] hover:border-primary-500/30 shadow-2xl hover:shadow-primary-500/5 transition-all duration-300 cursor-pointer group flex flex-col justify-between min-h-[180px] hover:-translate-y-1 relative overflow-hidden"
              >
                {/* Decorative border highlight on hover */}
                <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-primary-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-primary-400 transition-colors">
                    {group.name}
                  </h3>
                  <p className="text-slate-400 text-sm mt-3 line-clamp-2 leading-relaxed">
                    {group.description || 'No description provided.'}
                  </p>
                </div>
                <div className="text-xs text-slate-500 mt-6 pt-4 border-t border-white/[0.06] flex justify-between items-center">
                  <span>Created {new Date(group.createdAt).toLocaleDateString()}</span>
                  <span className="font-bold text-primary-400 group-hover:text-primary-300 group-hover:translate-x-1 transition-all flex items-center gap-1">
                    Manage <span>→</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Group Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900/90 backdrop-blur-2xl rounded-3xl border border-white/10 max-w-md w-full p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-150 relative overflow-hidden">
            {/* Modal Ambient Light */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary-500/10 rounded-full blur-[60px] pointer-events-none" />

            <div className="flex justify-between items-center mb-6 relative z-10">
              <h3 className="text-xl font-bold text-white">Create New Group</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white text-lg p-1 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-350 px-4 py-2.5 rounded-2xl text-xs mb-4 text-center">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateGroup} className="space-y-5 relative z-10">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Group Name</label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Shared Apartment, Road Trip"
                  className="w-full px-4 py-3 border border-white/10 rounded-xl bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500/60 focus:bg-white/10 text-sm transition-all placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Description (Optional)</label>
                <textarea
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="Describe the purpose of this group..."
                  rows={3}
                  className="w-full px-4 py-3 border border-white/10 rounded-xl bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500/60 focus:bg-white/10 text-sm resize-none transition-all placeholder:text-slate-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-5 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-semibold transition-all border border-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="py-2.5 px-5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-550 hover:to-indigo-550 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-primary-500/10 flex items-center space-x-2"
                >
                  {createLoading ? (
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : null}
                  <span>Create Group</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900/90 backdrop-blur-2xl rounded-3xl border border-white/10 max-w-2xl w-full p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-150 relative overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* Modal Ambient Light */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary-500/10 rounded-full blur-[60px] pointer-events-none" />

            <div className="flex justify-between items-center mb-6 relative z-10">
              <h3 className="text-xl font-bold text-white">Import Expenses from CSV</h3>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setSelectedFile(null);
                  setImportScanResult(null);
                }}
                className="text-slate-400 hover:text-white text-lg p-1 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
              >
                ✕
              </button>
            </div>

            {importError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-350 px-4 py-3 rounded-2xl text-xs mb-4 text-center font-semibold relative z-10">
                {importError}
              </div>
            )}

            {!importScanResult ? (
              <form onSubmit={handleCSVUpload} className="space-y-6 relative z-10">
                {/* Choose target group */}
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-350 uppercase tracking-wider">
                    Import Destination
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setImportDestinationType('NEW')}
                      className={`py-2.5 px-4 rounded-xl border text-xs font-semibold transition-all ${
                        importDestinationType === 'NEW'
                          ? 'border-primary-500 bg-primary-500/10 text-white'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      Create New Group
                    </button>
                    <button
                      type="button"
                      disabled={groups.length === 0}
                      onClick={() => {
                        setImportDestinationType('EXISTING');
                        if (!importSelectedGroupId && groups.length > 0) {
                          setImportSelectedGroupId(groups[0].id);
                        }
                      }}
                      className={`py-2.5 px-4 rounded-xl border text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        importDestinationType === 'EXISTING'
                          ? 'border-primary-500 bg-primary-500/10 text-white'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      Add to Existing Group
                    </button>
                  </div>
                </div>

                {importDestinationType === 'NEW' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-350 uppercase tracking-wider mb-2">
                      New Group Name
                    </label>
                    <input
                      type="text"
                      required
                      value={importGroupName}
                      onChange={(e) => setImportGroupName(e.target.value)}
                      placeholder="e.g. Europe Trip, Shared Bills"
                      className="w-full px-4 py-3 border border-white/10 rounded-xl bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500/60 focus:bg-white/10 text-sm transition-all placeholder:text-slate-500"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-350 uppercase tracking-wider mb-2">
                      Select Group
                    </label>
                    <select
                      value={importSelectedGroupId}
                      onChange={(e) => setImportSelectedGroupId(e.target.value)}
                      className="w-full px-4 py-3 border border-white/10 rounded-xl bg-slate-900 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500/60 text-sm transition-all"
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="border-2 border-dashed border-white/10 rounded-2xl p-8 text-center bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv"
                    required
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="space-y-2">
                    <div className="text-4xl text-slate-400">📄</div>
                    <p className="font-bold text-white text-sm">
                      {selectedFile ? selectedFile.name : 'Choose a CSV file or drag it here'}
                    </p>
                    <p className="text-slate-500 text-xs">Only .csv files are supported</p>
                  </div>
                </div>

                <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-xs text-slate-300 leading-relaxed">
                  <p className="font-bold text-white mb-1">CSV Template Format:</p>
                  <code className="block bg-black/30 p-2 rounded text-[11px] overflow-x-auto text-slate-400 font-mono">
                    date,description,paid_by,amount,currency,split_type,split_with,split_details
                  </code>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-slate-400">
                    <li><strong>paid_by</strong>: Registered name of the payer (e.g. Aisha, Priya)</li>
                    <li><strong>split_type</strong>: equal, unequal, percentage, or share</li>
                    <li><strong>split_with</strong>: Semicolon-separated participant names (e.g. Aisha;Rohan;Priya)</li>
                    <li><strong>split_details</strong>: Required for unequal/percentage/share splits.</li>
                  </ul>
                </div>

                <div className="flex justify-end space-x-3 pt-5 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    className="py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-semibold transition-all border border-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={importLoading || !selectedFile}
                    className="py-2.5 px-5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-550 hover:to-indigo-550 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-primary-500/10 flex items-center space-x-2"
                  >
                    {importLoading ? (
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : null}
                    <span>Scan CSV</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-6 relative z-10">
                <div className="grid grid-cols-3 gap-4 p-4 rounded-xl border border-white/15 bg-white/5 text-xs">
                  <div>
                    <span className="text-slate-400">Total Scanned: </span>
                    <strong className="text-white block mt-0.5">{importScanResult.totalRowsScanned} rows</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Valid: </span>
                    <strong className="text-white block mt-0.5">{importScanResult.validExpensesCount} expenses</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Anomalies Detected: </span>
                    <strong className={`inline-block px-1.5 py-0.5 mt-0.5 rounded text-[10px] ${importScanResult.anomaliesCount > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                      {importScanResult.anomaliesCount}
                    </strong>
                  </div>
                </div>

                {importScanResult.status === 'FAILED' ? (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-350 p-4 rounded-xl text-xs font-semibold">
                    ❌ Scan failed. The file contains critical errors that must be fixed before importing.
                  </div>
                ) : importScanResult.anomaliesCount > 0 ? (
                  <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-4 rounded-xl text-xs font-semibold">
                    ⚠️ Scan complete with warnings. Review warnings below before importing.
                  </div>
                ) : (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 p-4 rounded-xl text-xs font-semibold">
                    🎉 Scan successful! All rows are clean and ready to import.
                  </div>
                )}

                {importScanResult.anomalies.length > 0 && (
                  <div>
                    <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-2">Detected Anomalies</h4>
                    <div className="border border-white/10 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-white/5 text-slate-350 font-bold border-b border-white/10">
                            <th className="p-3">Row</th>
                            <th className="p-3">Severity</th>
                            <th className="p-3">Type</th>
                            <th className="p-3">Message</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {importScanResult.anomalies.map((a: any, idx: number) => (
                            <tr key={idx} className="hover:bg-white/[0.02]">
                              <td className="p-3 font-semibold text-slate-300">{a.rowNumber}</td>
                              <td className="p-3">
                                <span className={`px-1.5 py-0.5 rounded-[5px] text-[9px] font-extrabold uppercase ${
                                  a.severity === 'ERROR' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'
                                }`}>
                                  {a.severity}
                                </span>
                              </td>
                              <td className="p-3 text-slate-300 font-medium">{a.type}</td>
                              <td className="p-3 text-slate-400 leading-normal">{a.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {importScanResult.validatedExpenses && importScanResult.validatedExpenses.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-white text-xs uppercase tracking-wider">Select Transactions to Import</h4>
                    <div className="border border-white/10 rounded-xl max-h-52 overflow-y-auto p-3 bg-white/[0.01] space-y-2">
                      {importScanResult.validatedExpenses.map((exp: any) => (
                        <label key={exp.rowNumber} className="flex items-start space-x-3 text-xs text-slate-300 hover:bg-white/5 p-2 rounded-lg cursor-pointer border border-white/5 bg-slate-900/40">
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
                            <span className="font-bold text-white">Row {exp.rowNumber}: {exp.description}</span>
                            {exp.isSettlement ? (
                              <>
                                <span className="text-slate-400 font-medium"> • ₹{exp.amount.toFixed(2)} • Settlement</span>
                                <div className="text-emerald-400 mt-1 font-semibold">Reclassified as Settlement</div>
                              </>
                            ) : (
                              <>
                                <span className="text-slate-400 font-medium"> • ₹{exp.amount.toFixed(2)}</span>
                                <div className="text-slate-500 mt-1">Split Type: {exp.splitType}</div>
                              </>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end space-x-3 pt-5 border-t border-white/5">
                  <button
                    onClick={() => handleCSVConfirm('REJECT')}
                    disabled={importLoading}
                    className="py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-semibold transition-all border border-white/5"
                  >
                    Cancel / Reject
                  </button>
                  {importScanResult.status !== 'FAILED' && (
                    <button
                      onClick={() => handleCSVConfirm('APPROVE')}
                      disabled={importLoading}
                      className="py-2.5 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-550 hover:to-teal-550 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-500/10"
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
    </div>
  );
};

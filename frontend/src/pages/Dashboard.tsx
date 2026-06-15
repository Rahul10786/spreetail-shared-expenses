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
      // Reset form & reload
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
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center space-x-2 py-3 px-6 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-550 hover:to-indigo-550 text-sm font-semibold rounded-2xl text-white shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30 transition-all duration-300 hover:-translate-y-0.5"
          >
            <span className="text-base font-medium">+</span>
            <span>Create Group</span>
          </button>
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
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
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
      await fetchGroups();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create group.');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 py-4 px-6 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white text-lg font-bold shadow-sm">
              $
            </div>
            <span className="text-lg font-bold text-slate-800 tracking-tight">FairShare</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-slate-600">Hello, {user?.name}</span>
            <button
              onClick={logout}
              className="text-sm font-semibold text-red-600 hover:text-red-500 bg-red-50 hover:bg-red-100/70 px-3.5 py-2 rounded-xl transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto py-12 px-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Your Expense Groups</h2>
            <p className="text-slate-500 text-sm mt-1">Select a group to manage expenses, check balances, or import data.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center space-x-2 py-3 px-5 border border-transparent text-sm font-semibold rounded-xl text-white bg-primary-600 hover:bg-primary-700 shadow-md shadow-primary-200 hover:shadow-lg hover:shadow-primary-200 transition-all hover:-translate-y-0.5"
          >
            <span>+ Create Group</span>
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm mb-6 text-center">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <svg className="animate-spin h-8 w-8 text-primary-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : groups.length === 0 ? (
          <div className="bg-white text-center py-16 px-4 rounded-2xl border border-slate-100 shadow-sm">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400 text-2xl">
              👥
            </div>
            <h3 className="text-lg font-bold text-slate-800">No Groups Found</h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto mt-2 mb-6">
              You are not a member of any expense group yet. Create one above to start sharing expenses!
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="py-2.5 px-4 text-sm font-semibold text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
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
                className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-primary-100 transition-all cursor-pointer group flex flex-col justify-between min-h-[160px] hover:-translate-y-0.5"
              >
                <div>
                  <h3 className="text-lg font-bold text-slate-800 group-hover:text-primary-600 transition-colors">
                    {group.name}
                  </h3>
                  <p className="text-slate-500 text-sm mt-2 line-clamp-2">
                    {group.description || 'No description provided.'}
                  </p>
                </div>
                <div className="text-xs text-slate-400 mt-4 pt-3 border-t border-slate-50 flex justify-between items-center">
                  <span>Created {new Date(group.createdAt).toLocaleDateString()}</span>
                  <span className="font-semibold text-primary-500 group-hover:translate-x-1 transition-transform">
                    View Details →
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Group Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Create New Group</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg p-1"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-xl text-sm mb-4 text-center">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Group Name</label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Apartment Roommates, Road Trip"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="Describe the purpose of this group..."
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="py-2.5 px-4 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="py-2.5 px-5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-primary-200 flex items-center space-x-2"
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

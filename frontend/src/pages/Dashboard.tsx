import React from 'react';
import { useAuth } from '../hooks/useAuth';

export const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100 py-4 px-6 flex justify-between items-center">
        <h1 className="text-xl font-bold text-slate-800">Shared Expenses</h1>
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-slate-600">Hello, {user?.name}</span>
          <button
            onClick={logout}
            className="text-sm font-semibold text-red-600 hover:text-red-500 bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>
      <main className="max-w-4xl mx-auto py-12 px-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome to your Dashboard!</h2>
          <p className="text-slate-500">Authentication is working correctly.</p>
        </div>
      </main>
    </div>
  );
};

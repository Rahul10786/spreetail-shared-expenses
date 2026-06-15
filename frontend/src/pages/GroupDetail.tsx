import React from 'react';
import { useParams, Link } from 'react-router-dom';

export const GroupDetail: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
        <Link to="/" className="text-primary-600 font-semibold text-sm hover:underline">
          ← Back to Dashboard
        </Link>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-4">Group Details</h2>
        <p className="text-slate-500 text-sm mt-1">Group ID: {groupId}</p>
        <div className="mt-8 p-6 bg-slate-50 rounded-xl text-center text-slate-500 font-medium">
          Expense sharing and balance calculations will be implemented in the next milestone.
        </div>
      </div>
    </div>
  );
};

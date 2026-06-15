import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../context/ToastContext';

export const Register: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await register(name, email, password);
      toast('Account created successfully! Welcome to FairShare.', 'success');
      navigate('/'); // Redirect to Dashboard on success
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden font-sans flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Decorative Glowing Background Blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-primary-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[70%] rounded-full bg-indigo-600/15 blur-[130px] pointer-events-none" />

      <div className="max-w-md w-full space-y-8 bg-white/[0.03] backdrop-blur-xl p-8 rounded-3xl border border-white/[0.06] shadow-2xl relative z-10">
        <div>
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary-650 to-indigo-650 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-primary-500/20">
              $
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white tracking-tight bg-clip-text bg-gradient-to-r from-white to-slate-300">
            Create a new account
          </h2>
          <p className="mt-2 text-center text-sm text-slate-400">
            Or{' '}
            <Link to="/login" className="font-semibold text-primary-455 hover:text-primary-400 transition-colors">
              sign in to your existing account
            </Link>
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm text-center">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <div className="rounded-md space-y-4">
            <div>
              <label htmlFor="full-name" className="block text-sm font-semibold text-slate-350 mb-1.5">
                Full Name
              </label>
              <input
                id="full-name"
                name="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="appearance-none rounded-xl relative block w-full px-4 py-3 bg-white/5 border border-white/10 placeholder-slate-500 text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-slate-800/50 transition-all sm:text-sm"
                placeholder="Alice Smith"
              />
            </div>
            <div>
              <label htmlFor="email-address" className="block text-sm font-semibold text-slate-350 mb-1.5">
                Email Address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-xl relative block w-full px-4 py-3 bg-white/5 border border-white/10 placeholder-slate-500 text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-slate-800/50 transition-all sm:text-sm"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-slate-350 mb-1.5">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-xl relative block w-full px-4 py-3 bg-white/5 border border-white/10 placeholder-slate-500 text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-slate-800/50 transition-all sm:text-sm"
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-semibold text-slate-350 mb-1.5">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none rounded-xl relative block w-full px-4 py-3 bg-white/5 border border-white/10 placeholder-slate-500 text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-slate-800/50 transition-all sm:text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-550 hover:to-indigo-550 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 shadow-lg shadow-primary-500/20 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : null}
              Register
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

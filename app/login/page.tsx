'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { API_ROUTES } from '@/lib/constants';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(API_ROUTES.AUTH_LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push('/');
        router.refresh();
      } else {
        setError(data.message || 'Invalid password');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#F2F2F7' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{
              backgroundColor: '#007AFF',
              boxShadow: '0 4px 16px rgba(0, 122, 255, 0.25)',
            }}
          >
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold" style={{ color: '#1D1D1F' }}>
            よみサポ
          </h1>
          <p className="text-sm mt-1" style={{ color: '#8E8E93' }}>
            Japanese Reading Assistant
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="rounded-2xl p-6"
          style={{
            backgroundColor: '#FFFFFF',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div className="mb-5">
            <label
              htmlFor="password"
              className="block text-xs font-medium mb-1.5 uppercase tracking-wide"
              style={{ color: '#8E8E93' }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Enter password"
              className="w-full px-4 py-3 rounded-xl text-base outline-none transition-all duration-200"
              style={{
                backgroundColor: '#F2F2F7',
                border: `2px solid ${isFocused ? '#007AFF' : 'transparent'}`,
                color: '#1D1D1F',
              }}
              required={true}
              disabled={loading}
            />
          </div>

          {error && (
            <div
              className="mb-4 px-4 py-3 rounded-xl text-sm"
              style={{
                backgroundColor: 'rgba(255, 59, 48, 0.08)',
                color: '#FF3B30',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl font-semibold text-white text-base interactive-btn disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: loading ? '#8E8E93' : '#007AFF',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

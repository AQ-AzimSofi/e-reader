'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { API_ROUTES, COLORS } from '@/lib/constants';
import { toTint } from '@/lib/utils/colorTint';

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
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: COLORS.BASE, color: COLORS.INK }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 mx-auto mb-5 flex items-center justify-center"
            style={{ backgroundColor: COLORS.PRIMARY, color: COLORS.SURFACE }}
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <h1 className="font-mincho font-bold text-[28px] tracking-[0.04em]" style={{ color: COLORS.INK }}>
            よみサポ
          </h1>
          <p className="text-xs mt-2 tracking-[0.12em]" style={{ color: COLORS.SECONDARY }}>
            Japanese Reading Assistant
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="p-6 border"
          style={{
            backgroundColor: COLORS.SURFACE,
            borderColor: COLORS.NEUTRAL,
          }}
        >
          <div className="mb-5">
            <label
              htmlFor="password"
              className="block text-xs font-bold mb-2 uppercase tracking-[0.12em]"
              style={{ color: COLORS.SECONDARY }}
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
              className="w-full px-4 py-3 text-base outline-none transition-colors duration-200"
              style={{
                backgroundColor: COLORS.SURFACE,
                border: `1px solid ${isFocused ? COLORS.INK : COLORS.NEUTRAL}`,
                color: COLORS.INK,
              }}
              required={true}
              disabled={loading}
            />
          </div>

          {error && (
            <div
              className="mb-4 px-4 py-3 text-sm border"
              style={{
                backgroundColor: toTint(COLORS.DANGER, 8),
                borderColor: COLORS.DANGER,
                color: COLORS.DANGER,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-11 px-5 text-sm font-bold interactive-btn disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: loading ? COLORS.SECONDARY : COLORS.PRIMARY,
              color: COLORS.SURFACE,
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

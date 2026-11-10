'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { COLORS } from '@/lib/constants';

// Only load Swagger UI in development - will fail gracefully in production
const SwaggerUI = dynamic(
  () => import('swagger-ui-react').catch(() => {
    // Return a dummy component if swagger-ui-react is not available (production)
    return { default: () => <div>API documentation is not available in production.</div> };
  }),
  {
    ssr: false,
    loading: () => <div className="text-sm" style={{ padding: '2rem', textAlign: 'center', color: COLORS.SECONDARY }}>Loading...</div>
  }
);

export default function ApiDocsPage() {
  const [spec, setSpec] = useState(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch the OpenAPI spec
    fetch('/api/swagger-spec')
      .then((res) => {
        if (!res.ok) throw new Error('API docs not available');
        return res.json();
      })
      .then((data) => setSpec(data))
      .catch((err) => {
        console.error('Failed to load API spec:', err);
        setError('API documentation is not available in production.');
      });
  }, []);

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: COLORS.INK }}>
        <h1 className="font-mincho font-bold text-2xl mb-2">API Documentation</h1>
        <p className="text-sm" style={{ color: COLORS.SECONDARY }}>{error}</p>
      </div>
    );
  }

  if (!spec) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: COLORS.INK }}>
        <h1 className="font-mincho font-bold text-2xl">Loading API Documentation...</h1>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', overflow: 'auto' }}>
      <SwaggerUI spec={spec} />
    </div>
  );
}

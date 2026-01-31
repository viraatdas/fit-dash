import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Fitness Dashboard';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 40,
          }}
        >
          <svg
            width="80"
            height="80"
            viewBox="0 0 100 100"
            style={{ marginRight: 24 }}
          >
            <defs>
              <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" rx="20" fill="url(#grad)" />
            <path
              d="M25 65 L35 45 L50 55 L65 30 L75 40"
              stroke="white"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="75" cy="40" r="6" fill="white" />
          </svg>
          <span
            style={{
              fontSize: 64,
              fontWeight: 300,
              color: '#374151',
              letterSpacing: '-0.02em',
            }}
          >
            Fitness Dashboard
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 60,
            marginTop: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 48, fontWeight: 300, color: '#3b82f6' }}>
              Track
            </span>
            <span style={{ fontSize: 20, color: '#9ca3af', fontWeight: 300 }}>
              Workouts
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 48, fontWeight: 300, color: '#10b981' }}>
              Analyze
            </span>
            <span style={{ fontSize: 20, color: '#9ca3af', fontWeight: 300 }}>
              Progress
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 48, fontWeight: 300, color: '#f59e0b' }}>
              Improve
            </span>
            <span style={{ fontSize: 20, color: '#9ca3af', fontWeight: 300 }}>
              Results
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

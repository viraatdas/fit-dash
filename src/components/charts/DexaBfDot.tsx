'use client';

interface DexaBfDotProps {
  cx?: number;
  cy?: number;
  payload?: { source?: string };
  defaultColor: string;
  dexaColor?: string;
  r?: number;
}

// Custom Recharts dot renderer for body-fat-% lines: draws the DEXA reading as a
// distinct diamond marker with a "DEXA" label, so it never reads as just another
// InBody (bioimpedance) point on the same trend line.
export function DexaBfDot({ cx, cy, payload, defaultColor, dexaColor = '#B072D8', r = 4 }: DexaBfDotProps) {
  if (cx == null || cy == null) return null;

  if (payload?.source === 'dexa') {
    const size = 5;
    return (
      <g>
        <rect
          x={cx - size}
          y={cy - size}
          width={size * 2}
          height={size * 2}
          transform={`rotate(45 ${cx} ${cy})`}
          fill={dexaColor}
        />
        <text x={cx} y={cy - 12} textAnchor="middle" fontSize={9} fontFamily="Space Mono" fill={dexaColor}>
          DEXA
        </text>
      </g>
    );
  }

  return <circle cx={cx} cy={cy} r={r} fill={defaultColor} strokeWidth={0} />;
}

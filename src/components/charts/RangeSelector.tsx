'use client';

import { ChartRangeKey, CHART_RANGE_OPTIONS } from '@/lib/exercise/strength';

interface RangeSelectorProps {
  value: ChartRangeKey;
  onChange: (range: ChartRangeKey) => void;
  className?: string;
}

/**
 * Controlled range-button group for chart X-axis windows (1M/3M/6M/1Y/MAX). Styled to match
 * the existing Tabs pill look (src/components/ui/Tabs.tsx), but built as its own small
 * controlled component since Tabs manages its active value internally and doesn't expose it
 * to the parent — the chart needs the selected range to drive its own data filtering.
 */
export function RangeSelector({ value, onChange, className = '' }: RangeSelectorProps) {
  return (
    <div className={`inline-flex gap-0 border border-n-border-visible rounded-pill overflow-hidden ${className}`}>
      {CHART_RANGE_OPTIONS.map(option => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] transition-all duration-200 whitespace-nowrap ${
            value === option
              ? 'bg-n-text-display text-n-black'
              : 'text-n-text-secondary hover:text-n-text-primary'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

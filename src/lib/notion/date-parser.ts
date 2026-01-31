import { parse, isValid } from 'date-fns';

const DATE_FORMATS = [
  'MMMM d, yyyy',      // January 29, 2026
  'MMMM dd, yyyy',     // January 29, 2026
  'yyyy-MM-dd',        // 2023-01-11
  'MM/dd/yyyy',        // 01/11/2023
  'M/d/yyyy',          // 1/11/2023
  'MMMM d',            // January 29 (assumes current year)
  'MMM d, yyyy',       // Jan 29, 2026
  'MMM dd, yyyy',      // Jan 29, 2026
];

export function parseDate(text: string): Date | null {
  // Remove leading "#" or other common prefixes
  const cleanedText = text.replace(/^[#\s-]+/, '').trim();

  for (const format of DATE_FORMATS) {
    const parsed = parse(cleanedText, format, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  // Try native Date parsing as fallback
  const nativeParsed = new Date(cleanedText);
  if (isValid(nativeParsed)) {
    return nativeParsed;
  }

  return null;
}

export function extractDateFromLine(line: string): Date | null {
  // Match common date patterns in workout logs
  const patterns = [
    /^#?\s*(\d{4}-\d{2}-\d{2})/,                    // # 2022-11-03
    /^#?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/,        // January 29, 2026 or # January 29 2026
    /^#?\s*([A-Za-z]+\s+\d{1,2})\s*$/,              // January 29 (no year)
    /(\d{1,2}\/\d{1,2}\/\d{4})/,                    // 01/29/2026
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      const parsed = parseDate(match[1]);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

export function isDateLine(line: string): boolean {
  return extractDateFromLine(line) !== null;
}

import type { LogEntry } from './types';

function escapeCsv(value: string | number): string {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(entries: LogEntry[]): string {
  const rows = entries.map((entry) => [
    entry.date,
    entry.time,
    entry.url,
    entry.text
  ]);

  return [['date', 'time', 'url', 'text'], ...rows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\r\n');
}

export function toTxt(entries: LogEntry[]): string {
  if (!entries.length) return 'No typing logs found.\n';

  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  let lastDate = '';
  const lines: string[] = [];

  for (const entry of sorted) {
    if (entry.date !== lastDate) {
      if (lines.length) lines.push('');
      lines.push(`Date: ${entry.date}`, '');
      lastDate = entry.date;
    }

    lines.push(
      `Time: ${entry.time}`,
      `URL: ${entry.url}`,
      `Text: ${entry.text}`,
      ''
    );
  }

  return lines.join('\n');
}

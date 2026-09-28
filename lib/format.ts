import type { LogEntry, FieldInfo } from './types';

function escapeCsv(value: string | number): string {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fieldInfoToString(field?: FieldInfo): string {
  if (!field) return '';
  const parts = [];
  if (field.label) parts.push(`Field: ${field.label}`);
  if (field.type && field.type !== field.label) parts.push(`Type: ${field.type}`);
  if (field.name && field.name !== field.label) parts.push(`Name: ${field.name}`);
  if (field.placeholder && field.placeholder !== field.label) parts.push(`Placeholder: ${field.placeholder}`);
  if (field.id) parts.push(`ID: ${field.id}`);
  if (field.isPassword) parts.push('⚠ Password field');
  return parts.join(' | ');
}

export function toCsv(entries: LogEntry[]): string {
  const rows = entries.map((entry) => [
    entry.date,
    entry.time,
    entry.url,
    entry.text,
    fieldInfoToString(entry.field)
  ]);

  return [['date', 'time', 'url', 'text', 'field'], ...rows]
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
      fieldInfoToString(entry.field) ? `Field: ${fieldInfoToString(entry.field)}` : '',
      ''
    );
  }

  return lines.join('\n');
}
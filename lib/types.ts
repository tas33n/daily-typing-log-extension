export interface LogEntry {
  id: string;
  date: string;
  time: string;
  timestamp: number;
  url: string;
  text: string;
}

export type ExtensionMessage =
  | { type: 'UPSERT_LOG'; entry: LogEntry }
  | { type: 'GET_LOGS'; date?: string; limit?: number }
  | { type: 'DELETE_DATE'; date: string }
  | { type: 'DELETE_ALL' }
  | { type: 'SEND_LOGS_NOW' };

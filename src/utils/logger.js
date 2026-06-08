/**
 * In-app logger: captures console.log/warn/error so they can be
 * displayed inside the app on a real device (no ADB needed).
 */

const MAX_LOGS = 300;
const logs = [];

const formatEntry = (level, args) => {
  const time = new Date().toISOString().slice(11, 23); // HH:mm:ss.mmm
  const msg = args
    .map(a => {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (typeof a === 'object') {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    })
    .join(' ');
  return `[${time}] ${level}: ${msg}`;
};

const _origLog   = console.log.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);

const push = (entry) => {
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();
};

export const initLogger = () => {
  console.log   = (...args) => { _origLog(...args);   push(formatEntry('LOG',   args)); };
  console.warn  = (...args) => { _origWarn(...args);  push(formatEntry('WARN',  args)); };
  console.error = (...args) => { _origError(...args); push(formatEntry('ERROR', args)); };
};

export const getLogs  = () => [...logs].reverse(); // newest first
export const clearLogs = () => { logs.length = 0; };

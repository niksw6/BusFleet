/**
 * In-app logger: captures console.log/warn/error so they can be
 * displayed inside the app on a real device (no ADB needed).
 */

const MAX_LOGS = 300;
const logs = [];

const LOG_COLORS = {
  SUCCESS: '\x1b[32m',
  ERROR: '\x1b[31m',
  WARNING: '\x1b[31m',
  GET: '\x1b[36m',
  POST: '\x1b[35m',
  PUT: '\x1b[34m',
  DELETE: '\x1b[33m',
};
const RESET_COLOR = '\x1b[0m';
const HIGHLIGHT_COLOR = '\x1b[1;97m';

const formatEntry = (level, args) => {
  const time = new Date().toLocaleString('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
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
  return `[${time}] ${msg}`;
};

const _origLog   = console.log.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);

const push = (entry) => {
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();
};

export const initLogger = () => {
  console.log = (...args) => {
    _origLog(...args);
    push(formatEntry('LOG', args));
  };
  console.warn = (...args) => {
    _origWarn(...args);
    push(formatEntry('WARN', args));
  };
  console.error = (...args) => {
    _origError(...args);
    push(formatEntry('ERROR', args));
  };
};

export const logApi = (level, message, method = '') => {
  const entry = formatEntry(level, [message]);
  const normalizedMethod = String(method).toUpperCase();
  const color = level === 'SUCCESS'
    ? LOG_COLORS[normalizedMethod] || LOG_COLORS.SUCCESS
    : LOG_COLORS[level] || LOG_COLORS.ERROR;
  const highlightedEntry = entry.replace(
    /Action: ([^|\n]+)/,
    `Action: ${HIGHLIGHT_COLOR}$1${color}`,
  );
  const output = `\n${color}${highlightedEntry}${RESET_COLOR}`;
  if (level === 'ERROR') _origError(output);
  else if (level === 'WARNING') _origWarn(output);
  else _origLog(output);
  push(entry);
};

export const getLogs  = () => [...logs].reverse(); // newest first
export const clearLogs = () => { logs.length = 0; };

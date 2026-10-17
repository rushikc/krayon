/** Structured JSON on stdout. Cloud Run picks up severity and the trace field. Token query values are redacted. */
export const cloudLog = (severity: 'INFO' | 'WARNING' | 'ERROR', message: string, fields: Record<string, unknown> = {}) => {
  const redact = (value: unknown): unknown => {
    if (typeof value === 'string') return value.replace(/token=[^&\s]+/g, 'token=REDACTED');
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key.toLowerCase().includes('token') ? 'REDACTED' : redact(item)]));
    }
    return value;
  };
  const trace = process.env.TRACE_HEADER || undefined;
  process.stdout.write(
    `${JSON.stringify({
      severity,
      message,
      ...redact(fields) as Record<string, unknown>,
      'logging.googleapis.com/trace': trace,
    })}\n`,
  );
};

export const logger = {
  info: (message: string, fields?: Record<string, unknown>) => cloudLog('INFO', message, fields),
  warning: (message: string, fields?: Record<string, unknown>) => cloudLog('WARNING', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => cloudLog('ERROR', message, fields),
};

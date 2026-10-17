import { describe, expect, it } from 'vitest';
import { redact } from '../src/logging.js';

describe('redact', () => {
  it('keeps a numeric token count and hides token strings', () => {
    expect(redact({ usage: { thinking_tokens: 120 } })).toEqual({ usage: { thinking_tokens: 120 } });
    expect(redact({ appcheck_token: '1234567890' })).toEqual({ appcheck_token: '[REDACTED]' });
    expect(redact({ token: 'abc', api_key: '42' })).toEqual({ token: '[REDACTED]', api_key: '[REDACTED]' });
    expect(redact({ refresh_token: { value: 1 } })).toEqual({ refresh_token: '[REDACTED]' });
  });
});

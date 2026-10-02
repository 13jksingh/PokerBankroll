import { describe, expect, it } from 'vitest';
import { isConfigured, type AppConfig } from './config';

function config(apiUrl: string): AppConfig {
  return { apiUrl, initialTableId: null };
}

describe('isConfigured', () => {
  it('accepts Azure and legacy HTTPS endpoints', () => {
    expect(
      isConfigured(
        config('https://pokerbankroll-api.azurewebsites.net/api/poker'),
      ),
    ).toBe(true);
    expect(
      isConfigured(config('https://script.google.com/macros/s/example/exec')),
    ).toBe(true);
  });

  it('accepts local HTTP development endpoints', () => {
    expect(isConfigured(config('http://localhost:7071/api/poker'))).toBe(true);
  });

  it('rejects missing, malformed, and non-HTTP URLs', () => {
    expect(isConfigured(config(''))).toBe(false);
    expect(isConfigured(config('not-a-url'))).toBe(false);
    expect(isConfigured(config('file:///tmp/api'))).toBe(false);
  });
});

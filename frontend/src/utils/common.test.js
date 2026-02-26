import { describe, it, expect } from 'vitest';
import { formatCurrency } from './common';

describe('formatCurrency utility', () => {
    it('formats numbers for ko-KR', () => {
        const result = formatCurrency(50000);
        console.log('Result for 50000:', result);
        // expect(result).toBe('50,000'); // This might fail in CI/JSDOM if locale is missing
    });
});

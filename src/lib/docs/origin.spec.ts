import { describe, expect, it } from 'vitest';

import { normalizeSiteOrigin } from './origin.ts';

describe('normalizeSiteOrigin', () => {
	it.each([
		['https://docs.example.com', 'https://docs.example.com'],
		// The form a platform hands you: Railway's own domain variables carry no scheme.
		['upwell-docs-production.up.railway.app', 'https://upwell-docs-production.up.railway.app'],
		['https://docs.example.com/', 'https://docs.example.com'],
		['https://docs.example.com/docs/', 'https://docs.example.com'],
		['http://docs.example.com', 'http://docs.example.com'],
		['https://docs.example.com:8443', 'https://docs.example.com:8443'],
		// A local host is being served over http, whatever a hosting platform would imply.
		['localhost:4173', 'http://localhost:4173'],
		['127.0.0.1:3000', 'http://127.0.0.1:3000']
	])('normalizes %s', (value, expected) => {
		expect(normalizeSiteOrigin(value)).toBe(expected);
	});

	it.each([undefined, '', '   '])('falls back to the development origin for %o', (value) => {
		expect(normalizeSiteOrigin(value)).toBe('http://localhost:3000');
	});

	it.each(['ftp://docs.example.com', 'https://', 'https://%%%'])('refuses %s, naming the variable', (value) => {
		expect(() => normalizeSiteOrigin(value)).toThrow(/SITE_ORIGIN must be an origin/);
	});
});

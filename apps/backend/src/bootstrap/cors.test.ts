import { describe, expect, it } from 'vitest';
import { isAllowedOrigin, parseOriginList } from './cors.js';

describe('CORS de red local', () => {
  it.each([
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'https://192.168.1.10',
    'http://10.0.0.25:8080',
    'http://172.16.4.2',
    'http://172.31.255.1:3000',
    'https://karbon.local',
  ])('permite el origen privado %s', (origin) => {
    expect(isAllowedOrigin(origin, [])).toBe(true);
  });

  it.each([
    'https://evil.example.com',
    'http://172.32.0.1',
    'http://192.169.1.1',
    'http://8.8.8.8',
    'file://',
    // Páginas file:// e iframes aislados envían "null": aceptarlo abriría la API a cualquiera.
    'null',
    'app://otra-app',
    'no-es-una-url',
  ])('rechaza el origen público o inválido %s', (origin) => {
    expect(isAllowedOrigin(origin, [])).toBe(false);
  });

  it('permite siempre el renderer empaquetado de escritorio', () => {
    expect(isAllowedOrigin('app://karbon', [])).toBe(true);
  });

  it('permite orígenes extra configurados', () => {
    const extra = parseOriginList(' https://pos.mirestaurante.co/ , ,http://pos.example.com ');
    expect(extra).toEqual(['https://pos.mirestaurante.co', 'http://pos.example.com']);
    expect(isAllowedOrigin('https://pos.mirestaurante.co', extra)).toBe(true);
    expect(isAllowedOrigin('http://pos.example.com', extra)).toBe(true);
  });
});

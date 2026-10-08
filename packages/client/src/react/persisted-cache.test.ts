import { afterEach, describe, expect, it } from 'vitest';
import { discardStaleCaches } from './persisted-cache';

describe('caché guardada en el equipo', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('descarta lo que guardaron otras versiones y conserva la sesión y la versión actual', () => {
    localStorage.setItem('karbon.desktop.session', '{"accessToken":"x"}');
    localStorage.setItem('karbon.desktop.session.cache', '[]');
    localStorage.setItem('karbon.desktop.session.cache.v1', '[]');
    localStorage.setItem('karbon.desktop.session.cache.v2', '[]');
    localStorage.setItem('karbon.mobile.session.cache.v1', '[]');

    discardStaleCaches('karbon.desktop.session.cache', 'karbon.desktop.session.cache.v2');

    expect(Object.keys(localStorage).sort()).toEqual([
      'karbon.desktop.session',
      'karbon.desktop.session.cache.v2',
      'karbon.mobile.session.cache.v1',
    ]);
  });
});

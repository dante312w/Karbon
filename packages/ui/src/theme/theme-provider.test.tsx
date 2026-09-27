import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cn } from '../lib/cn';
import { useTheme } from './theme-context';
import { ThemeProvider } from './theme-provider';

function mockSystemTheme(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: prefersDark && query === '(prefers-color-scheme: dark)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function Probe() {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <>
      <output>{`${preference}:${resolved}`}</output>
      <button
        type="button"
        onClick={() => {
          setPreference('dark');
        }}
      >
        oscuro
      </button>
    </>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sigue el tema del sistema por defecto', () => {
    mockSystemTheme(true);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe('system:dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('aplica y persiste la preferencia elegida', () => {
    mockSystemTheme(false);
    render(
      <ThemeProvider storageKey="test.theme">
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    act(() => {
      screen.getByRole('button', { name: 'oscuro' }).click();
    });

    expect(screen.getByRole('status').textContent).toBe('dark:dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('test.theme')).toBe('dark');
  });

  it('useTheme falla con un mensaje claro fuera del provider', () => {
    mockSystemTheme(false);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
  });
});

describe('cn', () => {
  it('resuelve conflictos de Tailwind a favor de la última clase', () => {
    expect(cn('px-2 text-sm', null, undefined, { hidden: false }, 'px-4')).toBe('text-sm px-4');
  });
});

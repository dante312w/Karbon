import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ThemeContext,
  type ResolvedTheme,
  type ThemeContextValue,
  type ThemePreference,
} from './theme-context';
import { useMediaQuery } from './use-media-query';

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

function readStoredPreference(storageKey: string): ThemePreference {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return PREFERENCES.find((preference) => preference === stored) ?? 'system';
  } catch {
    // Almacenamiento bloqueado (modo privado, políticas del navegador): se usa el del sistema.
    return 'system';
  }
}

export interface ThemeProviderProps {
  children: ReactNode;
  storageKey?: string;
}

export function ThemeProvider({ children, storageKey = 'karbon.theme' }: ThemeProviderProps) {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    readStoredPreference(storageKey),
  );
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolved: ResolvedTheme =
    preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, preference);
    } catch {
      // Sin persistencia: la preferencia vive solo en esta sesión.
    }
  }, [preference, storageKey]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

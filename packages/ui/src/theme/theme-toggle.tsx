import { Button } from '../components/button';
import { useTheme, type ThemePreference } from './theme-context';

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const LABEL: Record<ThemePreference, string> = {
  system: 'Tema: sistema',
  light: 'Tema: claro',
  dark: 'Tema: oscuro',
};

/** Alterna sistema → claro → oscuro. */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        setPreference(NEXT[preference]);
      }}
    >
      {LABEL[preference]}
    </Button>
  );
}

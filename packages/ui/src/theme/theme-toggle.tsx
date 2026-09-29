import { type LucideIcon, MonitorSmartphoneIcon, MoonIcon, SunIcon } from 'lucide-react';
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

const ICON: Record<ThemePreference, LucideIcon> = {
  system: MonitorSmartphoneIcon,
  light: SunIcon,
  dark: MoonIcon,
};

/**
 * Alterna sistema → claro → oscuro. `compact` muestra solo el ícono (encabezado del celular,
 * donde el nombre del negocio y del mesero necesitan el espacio).
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference } = useTheme();
  const Icon = ICON[preference];
  return (
    <Button
      variant={compact ? 'ghost' : 'outline'}
      size={compact ? 'icon' : 'sm'}
      aria-label={LABEL[preference]}
      title={LABEL[preference]}
      onClick={() => {
        setPreference(NEXT[preference]);
      }}
    >
      {compact ? <Icon /> : LABEL[preference]}
    </Button>
  );
}

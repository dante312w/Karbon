export { cn } from './lib/cn';
export { Button, type ButtonProps } from './components/button';
export { buttonVariants } from './components/button-variants';
export { Badge, type BadgeProps } from './components/badge';
export { badgeVariants } from './components/badge-variants';
export { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/card';
export { StatusDot } from './components/status-dot';
export { ThemeProvider, type ThemeProviderProps } from './theme/theme-provider';
export {
  useTheme,
  type ResolvedTheme,
  type ThemeContextValue,
  type ThemePreference,
} from './theme/theme-context';
export { useMediaQuery } from './theme/use-media-query';
export { useServerHealth, type ServerConnection } from './connection/use-server-health';
export { ConnectionBadge, type ConnectionBadgeProps } from './connection/connection-badge';
export { ThemeToggle } from './theme/theme-toggle';
export {
  KITCHEN_TICKET_STATUS_LABEL,
  ORDER_ITEM_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  TABLE_STATUS_META,
  type StatusMeta,
} from './domain/status-meta';
export {
  Dialog,
  DialogClose,
  DialogContent,
  type DialogContentProps,
  DialogTrigger,
} from './components/dialog';
export {
  Field,
  type FieldProps,
  Input,
  Label,
  Select,
  Switch,
  type SwitchProps,
  Textarea,
} from './components/form';
export {
  Chip,
  type Column,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  Spinner,
  StatCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './components/layout';
export { NumberPad, type NumberPadProps } from './components/number-pad';
export {
  NotesEditor,
  type NotesEditorProps,
  QuantityStepper,
  type QuantityStepperProps,
} from './components/order-inputs';
export { ErrorScreen, Toaster } from './components/feedback';
export { errorMessage, notifyError, toast } from './components/notify';
export { tableStatusLabel } from './domain/status-meta';
export { PERMISSION_GROUPS } from './domain/permission-labels';
export { useNow } from './lib/use-now';
export { playChime } from './lib/chime';

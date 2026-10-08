import { cn } from '@karbon/ui';

/** Logo de Karbon (el mismo SVG del paquete de marca). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn('shrink-0', className)}
      role="img"
      aria-label="Karbon POS"
    >
      <rect width="512" height="512" rx="112" fill="#1d1237" stroke="#3b2a63" strokeWidth="8" />
      <path d="M160 128h56v104l96-104h72L272 246l116 138h-72L216 262v122h-56z" fill="#a78bfa" />
    </svg>
  );
}

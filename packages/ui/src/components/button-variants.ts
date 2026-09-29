import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-[color,background-color,box-shadow,transform] outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-soft hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive:
          'bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90',
        link: 'text-foreground underline-offset-4 hover:underline',
      },
      // En pantallas táctiles (celular, iPad, POS táctil) ningún botón queda por debajo de los
      // 44 px que recomiendan las guías de iOS; con mouse se conservan los tamaños compactos.
      size: {
        sm: 'h-8 px-3 text-xs pointer-coarse:h-11',
        md: 'h-10 px-4 pointer-coarse:h-11',
        lg: 'h-12 px-6 text-base',
        /** Objetivo táctil amplio para pantallas del POS y celulares. */
        touch: 'h-14 px-6 text-base',
        icon: 'size-10 pointer-coarse:size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

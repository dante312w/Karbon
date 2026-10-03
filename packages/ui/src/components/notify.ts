import { toast } from 'sonner';

export { toast };

/** Mensaje legible de cualquier error (ApiError trae el texto del servidor). */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Ocurrió un error inesperado';
}

export function notifyError(error: unknown): void {
  toast.error(errorMessage(error));
}

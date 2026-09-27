import { Transform } from 'class-transformer';

/** Booleano en query string: solo "true" es verdadero (Boolean("false") sería true). */
export const QueryBoolean = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => value === true || value === 'true');

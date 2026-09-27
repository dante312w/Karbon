/** Reglas de credenciales compartidas por usuarios, ingreso y asistente de primer arranque. */
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,60}$/;
export const USERNAME_MESSAGE = 'El usuario usa 3 a 60 letras, números, punto, guion o guion bajo';
export const PIN_PATTERN = /^[0-9]{4,6}$/;
export const PIN_MESSAGE = 'El PIN debe tener entre 4 y 6 dígitos';

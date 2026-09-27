import type { FloorElementKind } from '@karbon/types';

export const ELEMENT_LABEL: Readonly<Record<FloorElementKind, string>> = {
  BAR: 'Barra',
  KITCHEN: 'Cocina',
  RESTROOM: 'Baños',
  ENTRANCE: 'Entrada',
  CASHIER: 'Caja',
  WALL: 'Pared',
};

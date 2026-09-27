import { BusinessMode, KitchenStation } from '@karbon/types';

/**
 * Reglas y vocabulario que cambian entre restaurante y bar. Todo lo demás (meseros, mesas,
 * inventario, caja, reportes) es idéntico: el modo solo decide adónde van las comandas y
 * cómo se nombra el área de preparación.
 */

export interface Terminology {
  /** "Cocina" | "Barra" */
  prepArea: string;
  /** "a cocina" | "a barra" */
  toPrepArea: string;
  /** "en cocina" | "en barra" */
  inPrepArea: string;
  /** Acción principal del mesero. */
  sendAction: string;
  /** Rol de sistema que opera el tablero de preparación. */
  prepRoleName: string;
  /** Estado de mesa WAITING_FOOD. */
  waitingLabel: string;
  venue: string;
  /** Notas frecuentes que se agregan con un toque al tomar el pedido. */
  quickNotes: readonly string[];
}

const TERMINOLOGY: Readonly<Record<BusinessMode, Terminology>> = {
  RESTAURANT: {
    prepArea: 'Cocina',
    toPrepArea: 'a cocina',
    inPrepArea: 'en cocina',
    sendAction: 'Enviar a cocina',
    prepRoleName: 'Cocina',
    waitingLabel: 'Esperando comida',
    venue: 'Restaurante',
    quickNotes: [
      'Sin cebolla',
      'Sin sal',
      'Sin salsas',
      'Término medio',
      'Bien asado',
      'Extra queso',
      'Para llevar',
    ],
  },
  BAR: {
    prepArea: 'Barra',
    toPrepArea: 'a barra',
    inPrepArea: 'en barra',
    sendAction: 'Enviar a barra',
    prepRoleName: 'Barra',
    waitingLabel: 'Esperando pedido',
    venue: 'Bar',
    quickNotes: [
      'Sin hielo',
      'Poco hielo',
      'Sin azúcar',
      'Doble',
      'Michelada',
      'Con limón',
      'Bien fría',
    ],
  },
};

export function getTerminology(mode: BusinessMode): Terminology {
  return TERMINOLOGY[mode];
}

export const STATION_LABEL: Readonly<Record<KitchenStation, string>> = {
  KITCHEN: 'Cocina',
  BAR: 'Barra',
};

/** Estaciones de preparación que existen en cada modo. */
export function enabledStations(mode: BusinessMode): KitchenStation[] {
  return mode === BusinessMode.BAR
    ? [KitchenStation.BAR]
    : [KitchenStation.KITCHEN, KitchenStation.BAR];
}

/** Estación a la que va un producto: en modo bar, todo va a la barra. */
export function effectiveStation(station: KitchenStation, mode: BusinessMode): KitchenStation {
  return enabledStations(mode).includes(station) ? station : KitchenStation.BAR;
}

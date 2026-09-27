import {
  BusinessMode,
  FloorElementKind,
  KitchenStation,
  MeasureUnit,
  SystemRole,
  TableShape,
  TaxKind,
  type OpeningHoursSlot,
} from '@karbon/types';
import { getTerminology } from '@karbon/utils';

export function systemRoles(
  mode: BusinessMode,
): Readonly<Record<SystemRole, { name: string; description: string }>> {
  const terms = getTerminology(mode);
  return {
    ADMIN: {
      name: 'Administrador',
      description: 'Acceso total: catálogo, inventario, usuarios, caja, reportes y configuración',
    },
    CASHIER: { name: 'Cajero', description: 'Abre y cierra caja, cobra pedidos y emite facturas' },
    WAITER: {
      name: 'Mesero',
      description: `Toma pedidos desde el celular, los envía ${terms.toPrepArea} y solicita la cuenta`,
    },
    KITCHEN: {
      name: terms.prepRoleName,
      description: 'Visualiza comandas y actualiza su estado en el KDS',
    },
  };
}

/** Tarifas vigentes en Colombia para restaurantes y bares. */
export const DEFAULT_TAXES = [
  { name: 'Impoconsumo 8 %', kind: TaxKind.CONSUMPTION, rate: 8, isDefault: true },
  { name: 'IVA 19 %', kind: TaxKind.VAT, rate: 19, isDefault: false },
  { name: 'Exento', kind: TaxKind.OTHER, rate: 0, isDefault: false },
] as const;

const WEEKDAYS = [0, 1, 2, 3, 4] as const;

export function defaultOpeningHours(mode: BusinessMode): OpeningHoursSlot[] {
  return mode === BusinessMode.BAR
    ? [
        ...WEEKDAYS.map((day) => ({ day, opensAt: '17:00', closesAt: '01:00' })),
        { day: 5, opensAt: '17:00', closesAt: '03:00' },
        { day: 6, opensAt: '17:00', closesAt: '03:00' },
      ]
    : [
        ...WEEKDAYS.map((day) => ({ day, opensAt: '11:00', closesAt: '22:00' })),
        { day: 5, opensAt: '11:00', closesAt: '23:30' },
        { day: 6, opensAt: '11:00', closesAt: '23:30' },
      ];
}

// ─── Datos de demostración ───────────────────────────────────────────────────

export const DEMO_STAFF_PASSWORD = 'Demo123*';

export interface DemoTable {
  name: string;
  capacity: number;
  shape: TableShape;
  posX: number;
  posY: number;
}

export interface DemoElement {
  kind: FloorElementKind;
  label?: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
}

const element = (
  kind: FloorElementKind,
  posX: number,
  posY: number,
  width: number,
  height: number,
  label?: string,
): DemoElement => ({ kind, posX, posY, width, height, ...(label ? { label } : {}) });

function grid(
  prefix: string,
  count: number,
  columns: number,
  capacity: (i: number) => number,
): DemoTable[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `${prefix}${i + 1}`,
    capacity: capacity(i),
    shape: capacity(i) <= 2 ? TableShape.ROUND : TableShape.SQUARE,
    posX: (i % columns) * 2,
    posY: Math.floor(i / columns) * 2,
  }));
}

export interface DemoIngredient {
  key: string;
  name: string;
  unit: MeasureUnit;
  stock: number;
  minStock: number;
  /** Costo en COP por unidad de medida. */
  cost: number;
}

export interface DemoProduct {
  name: string;
  category: string;
  price: number;
  station: KitchenStation;
  recipe: readonly (readonly [string, number])[];
}

export interface DemoDataset {
  businessName: string;
  legalName: string;
  taxId: string;
  address: string;
  staff: readonly { username: string; name: string; role: SystemRole; pin: string }[];
  areas: readonly {
    name: string;
    tables: readonly DemoTable[];
    elements?: readonly DemoElement[];
  }[];
  categories: readonly { key: string; name: string; color: string }[];
  ingredients: readonly DemoIngredient[];
  products: readonly DemoProduct[];
}

const { UNIT, GRAM, MILLILITER } = MeasureUnit;
const { KITCHEN, BAR } = KitchenStation;

const RESTAURANT: DemoDataset = {
  businessName: 'Karbon Demo',
  legalName: 'Karbon Demo S.A.S.',
  taxId: '901234567-8',
  address: 'Calle 85 # 12-34',
  staff: [
    { username: 'caja', name: 'Camila Rojas', role: SystemRole.CASHIER, pin: '1111' },
    { username: 'laura', name: 'Laura Gómez', role: SystemRole.WAITER, pin: '2222' },
    { username: 'andres', name: 'Andrés Ruiz', role: SystemRole.WAITER, pin: '3333' },
    { username: 'cocina', name: 'Cocina', role: SystemRole.KITCHEN, pin: '4444' },
  ],
  areas: [
    {
      name: 'Salón',
      tables: grid('Mesa ', 8, 4, (i) => (i % 3 === 0 ? 2 : 4)),
      elements: [
        element(FloorElementKind.KITCHEN, 8, 0, 2, 2),
        element(FloorElementKind.RESTROOM, 8, 3, 2, 1),
        element(FloorElementKind.ENTRANCE, 0, 4, 2, 1),
        element(FloorElementKind.CASHIER, 3, 4, 2, 1),
      ],
    },
    {
      name: 'Terraza',
      tables: grid('Terraza ', 4, 2, () => 4),
      elements: [element(FloorElementKind.WALL, 0, 4, 3, 1, 'Baranda')],
    },
    {
      name: 'Barra',
      tables: grid('Barra ', 3, 3, () => 2),
      elements: [element(FloorElementKind.BAR, 0, 1, 5, 1)],
    },
  ],
  categories: [
    { key: 'entradas', name: 'Entradas', color: '#F59E0B' },
    { key: 'hamburguesas', name: 'Hamburguesas', color: '#EF4444' },
    { key: 'fuertes', name: 'Platos fuertes', color: '#22C55E' },
    { key: 'bebidas', name: 'Bebidas', color: '#3B82F6' },
    { key: 'postres', name: 'Postres', color: '#A855F7' },
  ],
  ingredients: [
    { key: 'pan', name: 'Pan de hamburguesa', unit: UNIT, stock: 60, minStock: 20, cost: 800 },
    {
      key: 'carne',
      name: 'Carne de res molida',
      unit: GRAM,
      stock: 10_000,
      minStock: 3_000,
      cost: 28,
    },
    { key: 'queso', name: 'Queso cheddar', unit: GRAM, stock: 3_000, minStock: 1_000, cost: 40 },
    { key: 'tocineta', name: 'Tocineta', unit: GRAM, stock: 2_000, minStock: 500, cost: 45 },
    { key: 'lechuga', name: 'Lechuga', unit: GRAM, stock: 2_000, minStock: 500, cost: 8 },
    { key: 'tomate', name: 'Tomate', unit: GRAM, stock: 3_000, minStock: 800, cost: 6 },
    { key: 'cebolla', name: 'Cebolla', unit: GRAM, stock: 3_000, minStock: 800, cost: 4 },
    { key: 'papa', name: 'Papa', unit: GRAM, stock: 15_000, minStock: 4_000, cost: 3 },
    {
      key: 'aceite',
      name: 'Aceite vegetal',
      unit: MILLILITER,
      stock: 10_000,
      minStock: 2_000,
      cost: 10,
    },
    { key: 'pollo', name: 'Pechuga de pollo', unit: GRAM, stock: 8_000, minStock: 2_000, cost: 22 },
    { key: 'arroz', name: 'Arroz', unit: GRAM, stock: 10_000, minStock: 3_000, cost: 4 },
    { key: 'limon', name: 'Limón', unit: UNIT, stock: 100, minStock: 30, cost: 300 },
    { key: 'azucar', name: 'Azúcar', unit: GRAM, stock: 5_000, minStock: 1_000, cost: 4 },
    { key: 'gaseosa', name: 'Gaseosa 350 ml', unit: UNIT, stock: 48, minStock: 24, cost: 1_800 },
    { key: 'agua', name: 'Agua 600 ml', unit: UNIT, stock: 48, minStock: 24, cost: 1_000 },
    { key: 'cerveza', name: 'Cerveza nacional', unit: UNIT, stock: 12, minStock: 24, cost: 2_500 },
    {
      key: 'helado',
      name: 'Helado de vainilla',
      unit: GRAM,
      stock: 4_000,
      minStock: 1_000,
      cost: 15,
    },
    { key: 'brownie', name: 'Brownie', unit: UNIT, stock: 20, minStock: 8, cost: 2_500 },
  ],
  products: [
    {
      name: 'Papas a la francesa',
      category: 'entradas',
      price: 9_000,
      station: KITCHEN,
      recipe: [
        ['papa', 250],
        ['aceite', 50],
      ],
    },
    {
      name: 'Ensalada de la casa',
      category: 'entradas',
      price: 12_000,
      station: KITCHEN,
      recipe: [
        ['lechuga', 80],
        ['tomate', 60],
        ['cebolla', 20],
        ['limon', 1],
      ],
    },
    {
      name: 'Hamburguesa clásica',
      category: 'hamburguesas',
      price: 25_000,
      station: KITCHEN,
      recipe: [
        ['pan', 1],
        ['carne', 150],
        ['queso', 30],
        ['lechuga', 20],
        ['tomate', 30],
        ['cebolla', 15],
      ],
    },
    {
      name: 'Hamburguesa doble tocineta',
      category: 'hamburguesas',
      price: 32_000,
      station: KITCHEN,
      recipe: [
        ['pan', 1],
        ['carne', 300],
        ['queso', 60],
        ['tocineta', 40],
        ['lechuga', 20],
        ['tomate', 30],
      ],
    },
    {
      name: 'Pechuga a la plancha',
      category: 'fuertes',
      price: 28_000,
      station: KITCHEN,
      recipe: [
        ['pollo', 250],
        ['arroz', 150],
        ['lechuga', 40],
        ['tomate', 40],
        ['aceite', 15],
      ],
    },
    {
      name: 'Arroz con pollo',
      category: 'fuertes',
      price: 24_000,
      station: KITCHEN,
      recipe: [
        ['pollo', 180],
        ['arroz', 200],
        ['cebolla', 30],
        ['aceite', 20],
      ],
    },
    {
      name: 'Gaseosa 350 ml',
      category: 'bebidas',
      price: 5_000,
      station: BAR,
      recipe: [['gaseosa', 1]],
    },
    { name: 'Agua 600 ml', category: 'bebidas', price: 4_000, station: BAR, recipe: [['agua', 1]] },
    {
      name: 'Limonada natural',
      category: 'bebidas',
      price: 7_000,
      station: BAR,
      recipe: [
        ['limon', 2],
        ['azucar', 30],
      ],
    },
    {
      name: 'Cerveza nacional',
      category: 'bebidas',
      price: 8_000,
      station: BAR,
      recipe: [['cerveza', 1]],
    },
    {
      name: 'Brownie con helado',
      category: 'postres',
      price: 14_000,
      station: KITCHEN,
      recipe: [
        ['brownie', 1],
        ['helado', 80],
      ],
    },
  ],
};

const BAR_DATASET: DemoDataset = {
  businessName: 'Karbon Bar Demo',
  legalName: 'Karbon Bar Demo S.A.S.',
  taxId: '901234568-6',
  address: 'Carrera 13 # 82-10',
  staff: [
    { username: 'caja', name: 'Camila Rojas', role: SystemRole.CASHIER, pin: '1111' },
    { username: 'laura', name: 'Laura Gómez', role: SystemRole.WAITER, pin: '2222' },
    { username: 'andres', name: 'Andrés Ruiz', role: SystemRole.WAITER, pin: '3333' },
    { username: 'barra', name: 'Barra', role: SystemRole.KITCHEN, pin: '4444' },
  ],
  areas: [
    {
      name: 'Barra',
      tables: grid('Banca ', 8, 8, () => 1),
      elements: [element(FloorElementKind.BAR, 0, 1, 15, 1)],
    },
    {
      name: 'Mesas altas',
      tables: grid('Alta ', 6, 3, () => 4),
      elements: [
        element(FloorElementKind.RESTROOM, 6, 0, 2, 1),
        element(FloorElementKind.ENTRANCE, 0, 4, 2, 1),
      ],
    },
    {
      name: 'Terraza',
      tables: grid('Terraza ', 4, 2, () => 4),
      elements: [element(FloorElementKind.WALL, 0, 4, 3, 1, 'Baranda')],
    },
  ],
  categories: [
    { key: 'cervezas', name: 'Cervezas', color: '#F59E0B' },
    { key: 'cocteles', name: 'Cócteles', color: '#EC4899' },
    { key: 'licores', name: 'Licores y shots', color: '#8B5CF6' },
    { key: 'sin-alcohol', name: 'Sin alcohol', color: '#3B82F6' },
    { key: 'picadas', name: 'Picadas', color: '#22C55E' },
  ],
  ingredients: [
    { key: 'cerveza', name: 'Cerveza nacional', unit: UNIT, stock: 96, minStock: 48, cost: 2_500 },
    {
      key: 'artesanal',
      name: 'Cerveza artesanal',
      unit: UNIT,
      stock: 18,
      minStock: 24,
      cost: 6_500,
    },
    { key: 'ron', name: 'Ron blanco', unit: MILLILITER, stock: 5_250, minStock: 1_500, cost: 45 },
    { key: 'tequila', name: 'Tequila', unit: MILLILITER, stock: 3_750, minStock: 1_500, cost: 80 },
    {
      key: 'aguardiente',
      name: 'Aguardiente',
      unit: MILLILITER,
      stock: 7_500,
      minStock: 2_000,
      cost: 30,
    },
    { key: 'whisky', name: 'Whisky', unit: MILLILITER, stock: 3_000, minStock: 1_000, cost: 120 },
    { key: 'limon', name: 'Limón', unit: UNIT, stock: 150, minStock: 50, cost: 300 },
    { key: 'hierbabuena', name: 'Hierbabuena', unit: GRAM, stock: 800, minStock: 200, cost: 20 },
    { key: 'azucar', name: 'Azúcar', unit: GRAM, stock: 5_000, minStock: 1_000, cost: 4 },
    { key: 'soda', name: 'Soda', unit: MILLILITER, stock: 12_000, minStock: 3_000, cost: 5 },
    { key: 'hielo', name: 'Hielo', unit: GRAM, stock: 40_000, minStock: 10_000, cost: 1 },
    {
      key: 'naranja',
      name: 'Jugo de naranja',
      unit: MILLILITER,
      stock: 6_000,
      minStock: 2_000,
      cost: 6,
    },
    {
      key: 'granadina',
      name: 'Granadina',
      unit: MILLILITER,
      stock: 1_000,
      minStock: 300,
      cost: 25,
    },
    { key: 'sal', name: 'Sal', unit: GRAM, stock: 1_000, minStock: 200, cost: 2 },
    { key: 'chicharron', name: 'Chicharrón', unit: GRAM, stock: 4_000, minStock: 1_000, cost: 30 },
    { key: 'papa', name: 'Papa criolla', unit: GRAM, stock: 6_000, minStock: 1_500, cost: 5 },
  ],
  products: [
    {
      name: 'Cerveza nacional',
      category: 'cervezas',
      price: 8_000,
      station: BAR,
      recipe: [['cerveza', 1]],
    },
    {
      name: 'Cerveza artesanal',
      category: 'cervezas',
      price: 16_000,
      station: BAR,
      recipe: [['artesanal', 1]],
    },
    {
      name: 'Mojito',
      category: 'cocteles',
      price: 24_000,
      station: BAR,
      recipe: [
        ['ron', 60],
        ['limon', 1],
        ['hierbabuena', 10],
        ['azucar', 20],
        ['soda', 100],
        ['hielo', 150],
      ],
    },
    {
      name: 'Margarita',
      category: 'cocteles',
      price: 26_000,
      station: BAR,
      recipe: [
        ['tequila', 60],
        ['limon', 1],
        ['sal', 5],
        ['hielo', 150],
      ],
    },
    {
      name: 'Tequila sunrise',
      category: 'cocteles',
      price: 26_000,
      station: BAR,
      recipe: [
        ['tequila', 60],
        ['naranja', 120],
        ['granadina', 15],
        ['hielo', 150],
      ],
    },
    {
      name: 'Shot de tequila',
      category: 'licores',
      price: 14_000,
      station: BAR,
      recipe: [
        ['tequila', 45],
        ['limon', 0.5],
        ['sal', 2],
      ],
    },
    {
      name: 'Shot de aguardiente',
      category: 'licores',
      price: 8_000,
      station: BAR,
      recipe: [['aguardiente', 45]],
    },
    {
      name: 'Whisky en las rocas',
      category: 'licores',
      price: 22_000,
      station: BAR,
      recipe: [
        ['whisky', 60],
        ['hielo', 100],
      ],
    },
    {
      name: 'Limonada natural',
      category: 'sin-alcohol',
      price: 8_000,
      station: BAR,
      recipe: [
        ['limon', 2],
        ['azucar', 30],
        ['hielo', 100],
      ],
    },
    {
      name: 'Soda con limón',
      category: 'sin-alcohol',
      price: 6_000,
      station: BAR,
      recipe: [
        ['soda', 300],
        ['limon', 0.5],
        ['hielo', 100],
      ],
    },
    {
      name: 'Picada para dos',
      category: 'picadas',
      price: 38_000,
      station: KITCHEN,
      recipe: [
        ['chicharron', 200],
        ['papa', 250],
        ['limon', 1],
      ],
    },
    {
      name: 'Papitas criollas',
      category: 'picadas',
      price: 14_000,
      station: KITCHEN,
      recipe: [
        ['papa', 250],
        ['sal', 3],
      ],
    },
  ],
};

export const DEMO_DATASETS: Readonly<Record<BusinessMode, DemoDataset>> = {
  RESTAURANT,
  BAR: BAR_DATASET,
};

export const DEMO_SUPPLIER = {
  name: 'Distribuidora La Sabana S.A.S.',
  taxId: '900123456-7',
  contactName: 'Jorge Méndez',
  phone: '6015550123',
  email: 'ventas@lasabana.example',
};

export const DEMO_CUSTOMER = {
  name: 'María Fernanda López',
  phone: '3001234567',
  email: 'mafe.lopez@example.com',
  documentNumber: '1020304050',
  birthday: new Date('1990-05-14'),
};

import { useMoney, useTerminology } from '@karbon/client';
import { type FloorElementDto, FloorElementKind, type TableDto, TableShape } from '@karbon/types';
import { cn, TABLE_STATUS_META, tableStatusLabel, toast } from '@karbon/ui';
import { elapsedLabel, summarizeTable } from '@karbon/utils';
import {
  BanknoteIcon,
  ChefHatIcon,
  DoorOpenIcon,
  type LucideIcon,
  MartiniIcon,
  ToiletIcon,
} from 'lucide-react';
import { type KeyboardEvent, type PointerEvent, useId, useRef, useState } from 'react';
import {
  blocks,
  CELL,
  cellRect,
  chairPositions,
  fitFontSize,
  floorPlanSize,
  type GridBox,
  overlaps,
  type Rect,
  tableRect,
} from './floor-geometry';
import { ELEMENT_LABEL } from './floor-labels';

const ELEMENT_ICON: Readonly<Partial<Record<FloorElementKind, LucideIcon>>> = {
  BAR: MartiniIcon,
  KITCHEN: ChefHatIcon,
  RESTROOM: ToiletIcon,
  ENTRANCE: DoorOpenIcon,
  CASHIER: BanknoteIcon,
};

type Item = { type: 'table'; table: TableDto } | { type: 'element'; element: FloorElementDto };
type Position = Pick<GridBox, 'posX' | 'posY'>;

export interface FloorPlanEditor {
  onMoveTable: (table: TableDto, position: Position) => void;
  onMoveElement: (element: FloorElementDto, position: Position) => void;
  onEditElement: (element: FloorElementDto) => void;
}

interface Drag {
  key: string;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  moved: boolean;
}

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

const itemKey = (item: Item): string =>
  item.type === 'table' ? `t:${item.table.id}` : `e:${item.element.id}`;
const itemBox = (item: Item): GridBox => (item.type === 'table' ? item.table : item.element);
const itemKind = (item: Item): FloorElementKind | 'TABLE' =>
  item.type === 'table' ? 'TABLE' : item.element.kind;

/**
 * Plano del área visto desde arriba, en SVG: mesas con sus sillas y el color de su estado,
 * más barra, cocina, baños y demás elementos fijos. Escala al ancho disponible sin recalcular
 * nada y no usa sombras, filtros ni animaciones permanentes. Con `editor`, las mesas y los
 * elementos se arrastran (o se mueven con las flechas) celda por celda.
 */
export function FloorPlan({
  label,
  tables,
  elements,
  now,
  selectedId = null,
  onSelectTable,
  editor,
}: {
  label: string;
  tables: TableDto[];
  elements: FloorElementDto[];
  now: number;
  selectedId?: string | null;
  onSelectTable: (table: TableDto) => void;
  editor?: FloorPlanEditor;
}) {
  const patternId = `plano-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const editing = editor !== undefined;

  const items: Item[] = [
    ...elements.map((element): Item => ({ type: 'element', element })),
    ...tables.map((table): Item => ({ type: 'table', table })),
  ];
  const tablesById = new Map(tables.map((table) => [table.id, table]));
  const { cols, rows } = floorPlanSize(items.map(itemBox), editing);
  const width = cols * CELL;
  const height = rows * CELL;

  const toSvgPoint = (event: PointerEvent): DOMPoint | null => {
    const matrix = svgRef.current?.getScreenCTM();
    return matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
      : null;
  };

  const move = (item: Item, dx: number, dy: number): void => {
    const box = itemBox(item);
    const target = { ...box, posX: box.posX + dx, posY: box.posY + dy };
    const key = itemKey(item);
    const blocked =
      target.posX < 0 ||
      target.posY < 0 ||
      (blocks(itemKind(item)) &&
        items.some(
          (other) =>
            itemKey(other) !== key && blocks(itemKind(other)) && overlaps(itemBox(other), target),
        ));
    if (blocked) {
      toast.error('Ese lugar ya está ocupado');
      return;
    }
    const position = { posX: target.posX, posY: target.posY };
    if (item.type === 'table') editor?.onMoveTable(item.table, position);
    else editor?.onMoveElement(item.element, position);
  };

  const activate = (item: Item): void => {
    if (item.type === 'element') {
      editor?.onEditElement(item.element);
      return;
    }
    // En operación, tocar una mesa unida abre la principal (ahí vive el pedido).
    const main = item.table.mergedIntoId ? tablesById.get(item.table.mergedIntoId) : undefined;
    onSelectTable(editing ? item.table : (main ?? item.table));
  };

  const interaction = (item: Item) => ({
    role: 'button' as const,
    tabIndex: 0,
    onKeyDown: (event: KeyboardEvent) => {
      const arrow = ARROWS[event.key];
      if (editing && arrow) {
        event.preventDefault();
        move(item, arrow[0], arrow[1]);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate(item);
      }
    },
    ...(editing
      ? {
          onPointerDown: (event: PointerEvent) => {
            if (event.button !== 0) return;
            const point = toSvgPoint(event);
            if (!point) return;
            svgRef.current?.setPointerCapture(event.pointerId);
            setDrag({
              key: itemKey(item),
              startX: point.x,
              startY: point.y,
              dx: 0,
              dy: 0,
              moved: false,
            });
          },
        }
      : {
          onClick: () => {
            activate(item);
          },
        }),
  });

  const offsetFor = (item: Item): string | undefined =>
    drag?.key === itemKey(item) && (drag.dx !== 0 || drag.dy !== 0)
      ? `translate(${String(drag.dx * CELL)} ${String(drag.dy * CELL)})`
      : undefined;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      width="100%"
      role="group"
      aria-label={label}
      className={cn('block h-auto select-none', editing && 'touch-none')}
      style={{ maxWidth: width }}
      onPointerMove={(event) => {
        if (!drag) return;
        const point = toSvgPoint(event);
        if (!point) return;
        const offsetX = point.x - drag.startX;
        const offsetY = point.y - drag.startY;
        const next = {
          dx: Math.round(offsetX / CELL),
          dy: Math.round(offsetY / CELL),
          moved: drag.moved || Math.hypot(offsetX, offsetY) > 6,
        };
        if (next.dx !== drag.dx || next.dy !== drag.dy || next.moved !== drag.moved) {
          setDrag({ ...drag, ...next });
        }
      }}
      onPointerUp={() => {
        if (!drag) return;
        const item = items.find((candidate) => itemKey(candidate) === drag.key);
        setDrag(null);
        if (!item) return;
        if (!drag.moved) activate(item);
        else if (drag.dx !== 0 || drag.dy !== 0) move(item, drag.dx, drag.dy);
      }}
      onPointerCancel={() => {
        setDrag(null);
      }}
    >
      <defs>
        {editing ? (
          <pattern id={patternId} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            <path
              d={`M ${String(CELL)} 0 L 0 0 0 ${String(CELL)}`}
              className="fill-none stroke-border"
            />
          </pattern>
        ) : (
          <pattern id={patternId} width={CELL / 2} height={CELL / 2} patternUnits="userSpaceOnUse">
            <circle cx={CELL / 4} cy={CELL / 4} r={1.6} className="fill-border" />
          </pattern>
        )}
      </defs>
      <rect
        x={2}
        y={2}
        width={width - 4}
        height={height - 4}
        rx={20}
        className="fill-card stroke-border"
        strokeWidth={2}
      />
      <rect x={2} y={2} width={width - 4} height={height - 4} rx={20} fill={`url(#${patternId})`} />

      {items.map((item) => (
        <g
          key={itemKey(item)}
          transform={offsetFor(item)}
          className={cn(
            'group outline-none',
            editing ? 'cursor-grab' : item.type === 'table' && 'cursor-pointer',
            drag?.key === itemKey(item) && drag.moved && 'cursor-grabbing opacity-80',
          )}
          {...(editing || item.type === 'table' ? interaction(item) : {})}
        >
          {item.type === 'table' ? (
            <TableGlyph
              table={item.table}
              mergedInto={
                item.table.mergedIntoId ? (tablesById.get(item.table.mergedIntoId) ?? null) : null
              }
              now={now}
              selected={item.table.id === selectedId}
              dimmed={editing && !item.table.isActive}
            />
          ) : (
            <ElementGlyph element={item.element} editing={editing} />
          )}
        </g>
      ))}
    </svg>
  );
}

/** Contorno de enfoque/selección: visible al seleccionar o al navegar con el teclado. */
function FocusRing({ rect, round, visible }: { rect: Rect; round: boolean; visible: boolean }) {
  const className = cn(
    'fill-none stroke-ring',
    visible ? 'opacity-100' : 'opacity-0 group-focus-visible:opacity-100',
  );
  return round ? (
    <ellipse
      cx={rect.x + rect.width / 2}
      cy={rect.y + rect.height / 2}
      rx={rect.width / 2 + 8}
      ry={rect.height / 2 + 8}
      strokeWidth={3}
      className={className}
    />
  ) : (
    <rect
      x={rect.x - 8}
      y={rect.y - 8}
      width={rect.width + 16}
      height={rect.height + 16}
      rx={16}
      strokeWidth={3}
      className={className}
    />
  );
}

function TableGlyph({
  table,
  mergedInto,
  now,
  selected,
  dimmed,
}: {
  table: TableDto;
  mergedInto: TableDto | null;
  now: number;
  selected: boolean;
  dimmed: boolean;
}) {
  const money = useMoney();
  const terms = useTerminology();
  const rect = tableRect(table);
  const color = TABLE_STATUS_META[table.status].color;
  const round = table.shape === TableShape.ROUND;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const { total, pendingTickets: pending, openedAt } = summarizeTable(table);
  const detail = mergedInto
    ? `con ${mergedInto.name}`
    : openedAt
      ? elapsedLabel(openedAt, now)
      : `${String(table.capacity)} pers.`;
  const fontSize = fitFontSize(table.name, rect.width);
  const amount = total > 0 ? money(total) : null;
  const pillWidth = amount ? amount.length * 6.6 + 16 : 0;
  const body = {
    fill: color,
    fillOpacity: 0.16,
    stroke: color,
    strokeWidth: 2.5,
    strokeDasharray: mergedInto ? '6 4' : undefined,
    className: 'transition-[stroke-width] group-hover:stroke-[3.5]',
  };

  return (
    <g opacity={dimmed ? 0.45 : 1}>
      <title>{`${table.name}: ${tableStatusLabel(table.status, terms)}`}</title>
      {chairPositions(table.shape, rect, table.capacity).map((chair, index) =>
        round ? (
          <circle
            key={index}
            cx={chair.x}
            cy={chair.y}
            r={6}
            className="fill-muted stroke-border"
            strokeWidth={1.5}
          />
        ) : (
          <rect
            key={index}
            x={chair.x - 6}
            y={chair.y - 6}
            width={12}
            height={12}
            rx={3}
            className="fill-muted stroke-border"
            strokeWidth={1.5}
          />
        ),
      )}
      <FocusRing rect={rect} round={round} visible={selected} />
      {round ? (
        <ellipse cx={cx} cy={cy} rx={rect.width / 2} ry={rect.height / 2} {...body} />
      ) : (
        <rect {...rect} rx={10} {...body} />
      )}
      <text
        x={cx}
        y={cy - 1}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={700}
        className="fill-foreground"
      >
        {table.name}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} className="fill-muted-foreground">
        {detail}
      </text>
      {pending > 0 ? (
        <g>
          <title>{`${String(pending)} ${pending === 1 ? 'comanda' : 'comandas'} ${terms.inPrepArea}`}</title>
          <circle
            cx={rect.x + rect.width - 2}
            cy={rect.y + 2}
            r={10}
            fill="var(--status-waiting-food)"
            className="stroke-card"
            strokeWidth={2}
          />
          <text
            x={rect.x + rect.width - 2}
            y={rect.y + 6}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            className="fill-black"
          >
            {pending}
          </text>
        </g>
      ) : null}
      {amount ? (
        <g>
          <rect
            x={cx - pillWidth / 2}
            y={rect.y + rect.height - 9}
            width={pillWidth}
            height={18}
            rx={9}
            stroke={color}
            strokeWidth={1.5}
            className="fill-card"
          />
          <text
            x={cx}
            y={rect.y + rect.height + 4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            className="fill-foreground tabular-nums"
          >
            {amount}
          </text>
        </g>
      ) : null}
    </g>
  );
}

function ElementGlyph({ element, editing }: { element: FloorElementDto; editing: boolean }) {
  const text = element.label ?? ELEMENT_LABEL[element.kind];
  const area = cellRect(element, 6);
  const cx = area.x + area.width / 2;
  const cy = area.y + area.height / 2;

  if (element.kind === FloorElementKind.WALL) {
    const horizontal = element.width >= element.height;
    const bar = horizontal
      ? { x: area.x, y: cy - 5, width: area.width, height: 10 }
      : { x: cx - 5, y: area.y, width: 10, height: area.height };
    return (
      <g>
        <title>{text}</title>
        {editing ? <rect {...area} rx={10} className="fill-transparent" /> : null}
        <rect {...bar} rx={5} className="fill-muted-foreground" opacity={0.45} />
        {element.label ? (
          <text
            x={cx}
            y={horizontal ? cy - 12 : cy}
            textAnchor="middle"
            fontSize={12}
            className="fill-muted-foreground"
          >
            {element.label}
          </text>
        ) : null}
      </g>
    );
  }

  const Icon = ELEMENT_ICON[element.kind];
  const isBar = element.kind === FloorElementKind.BAR;
  const tone = isBar ? 'text-primary' : 'text-muted-foreground';
  return (
    <g className={tone}>
      <title>{text}</title>
      {element.kind === FloorElementKind.ENTRANCE ? (
        <rect
          {...area}
          rx={12}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="6 5"
        />
      ) : (
        <rect
          {...area}
          rx={12}
          strokeWidth={isBar ? 2 : 1.5}
          className={isBar ? 'fill-primary/10 stroke-primary' : 'fill-muted stroke-border'}
        />
      )}
      {Icon ? <Icon x={cx - 10} y={cy - 24} width={20} height={20} aria-hidden /> : null}
      <text
        x={cx}
        y={cy + 14}
        textAnchor="middle"
        fontSize={13}
        fontWeight={600}
        fill="currentColor"
      >
        {text}
      </text>
    </g>
  );
}

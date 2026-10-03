import type { OrderItemInput, ProductDto } from '@karbon/types';
import { useState } from 'react';

export interface CartLine {
  key: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
}

function read(storageKey: string): CartLine[] {
  try {
    const raw = sessionStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

/**
 * Carrito del mesero antes de enviar. Se guarda en la sesión del navegador: si el celular
 * recarga la página o se bloquea, el pedido a medio tomar no se pierde.
 */
export function useCart(storageKey: string) {
  const [lines, setLines] = useState<CartLine[]>(() => read(storageKey));
  const save = (next: CartLine[]): void => {
    setLines(next);
    try {
      if (next.length === 0) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Sin almacenamiento (modo privado): el carrito vive solo en memoria.
    }
  };

  /** Agregar el mismo producto con la misma nota suma cantidad en lugar de repetir la línea. */
  const add = (product: ProductDto, quantity = 1, notes = ''): void => {
    const trimmed = notes.trim();
    const existing = lines.find((line) => line.productId === product.id && line.notes === trimmed);
    save(
      existing
        ? lines.map((line) =>
            line === existing ? { ...line, quantity: line.quantity + quantity } : line,
          )
        : [
            ...lines,
            {
              key: `${product.id}:${String(Date.now())}`,
              productId: product.id,
              name: product.name,
              price: product.price,
              quantity,
              notes: trimmed,
            },
          ],
    );
  };

  const update = (key: string, patch: Partial<Pick<CartLine, 'quantity' | 'notes'>>): void => {
    save(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const remove = (key: string): void => {
    save(lines.filter((line) => line.key !== key));
  };

  const toItems = (): OrderItemInput[] =>
    lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      notes: line.notes || null,
    }));

  return {
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    total: lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
    add,
    update,
    remove,
    clear: () => {
      save([]);
    },
    toItems,
  };
}

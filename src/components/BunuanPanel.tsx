import React, { useMemo } from 'react';
import { PackageCheck, Info } from 'lucide-react';
import MenuItemCard from './MenuItemCard';
import type { CartItem, GroupBuy, Product, ProductVariation } from '../types';
import type { KitState } from '../lib/kitRules';
import type { KitStatusRow } from '../hooks/useKitStatus';

/**
 * The Bunuan phase storefront.
 *
 * Deliberately NOT the normal catalog with a filter applied. Bunuan answers one
 * question — "which kits are short, and by how much?" — so the page shows only
 * products that still need units and leads with the shortfall rather than the
 * price. A kit that reaches its size disappears on the next realtime tick,
 * which is also exactly when the server stops accepting orders for it.
 */

interface BunuanPanelProps {
  /** Rows the hook has already narrowed to kits that still need units. */
  incompleteRows: KitStatusRow[];
  menuItems: Product[];
  cartItems: CartItem[];
  addToCart: (product: Product, variation?: ProductVariation, quantity?: number) => void;
  getKitState: (productId: string) => KitState;
  getMoq: (productId: string) => number;
  groupBuy?: GroupBuy | null;
}

const BunuanPanel: React.FC<BunuanPanelProps> = ({
  incompleteRows,
  menuItems,
  cartItems,
  addToCart,
  getKitState,
  getMoq,
  groupBuy,
}) => {
  // Join the kit rows back to live products so pricing, variations and images
  // all come from the same source the rest of the storefront uses.
  const products = useMemo(() => {
    const byId = new Map(menuItems.map((p) => [p.id, p]));
    return incompleteRows
      .map((row) => ({ row, product: byId.get(row.product_id) }))
      .filter((entry): entry is { row: KitStatusRow; product: Product } => Boolean(entry.product))
      .sort((a, b) => a.row.bunuan_available - b.row.bunuan_available); // closest to done first
  }, [incompleteRows, menuItems]);

  const getCartQuantity = (productId: string) =>
    cartItems
      .filter((item) => item.product.id === productId)
      .reduce((sum, item) => sum + item.quantity, 0);

  const totalNeeded = products.reduce((sum, { row }) => sum + row.bunuan_available, 0);

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-10">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-theme-accent px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
              <PackageCheck className="h-3.5 w-3.5" />
              Bunuan
            </span>
            {groupBuy && (
              <span className="text-sm font-semibold text-theme-text/60">
                GB #{groupBuy.gb_number} — {groupBuy.title}
              </span>
            )}
          </div>

          <h2 className="font-jp text-[28px] sm:text-[30px] font-extrabold tracking-[-0.01em] text-theme-text">
            Complete the remaining kits
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-theme-text/70">
            Normal ordering has closed. These kits are just short of complete —
            only the exact number of vials still needed is available, and the
            usual minimum order does not apply.
          </p>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-theme-accent/20 bg-theme-accent/10 px-3 py-2">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-theme-accent" />
            <p className="text-xs leading-relaxed text-theme-text/80">
              Bunuan is open only to customers who already joined this Group Buy.
              Please check out using the <strong>same name, email and phone number</strong>{' '}
              you used on your original order.
            </p>
          </div>
        </header>

        {products.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mx-auto max-w-md rounded-xl border border-gray-100 bg-white p-12 shadow-soft">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-50">
                <PackageCheck className="h-10 w-10 text-green-600" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-theme-text">All kits are complete</h3>
              <p className="text-gray-500">
                Nothing is short right now. If an order is cancelled, the kit it
                belonged to will reappear here automatically.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-6 text-sm font-medium text-theme-text/50">
              <span className="font-bold text-theme-secondary">{products.length}</span>{' '}
              {products.length === 1 ? 'kit needs' : 'kits need'}{' '}
              <span className="font-bold text-theme-secondary">{totalNeeded}</span>{' '}
              more {totalNeeded === 1 ? 'vial' : 'vials'} in total
            </p>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
              {products.map(({ product }) => (
                <MenuItemCard
                  key={product.id}
                  product={product}
                  onAddToCart={addToCart}
                  cartQuantity={getCartQuantity(product.id)}
                  // gbLocked stays false: during Bunuan these products ARE the
                  // round, so steering the shopper "to the Group Buy" would be
                  // pointing at the page they are already on.
                  kit={{
                    phase: 'bunuan_open',
                    state: getKitState(product.id),
                    moq: getMoq(product.id),
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BunuanPanel;

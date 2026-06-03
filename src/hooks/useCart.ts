import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CartItem, CartItemRef, Product, ProductVariation, PricingMode } from '../types';
import { computeEffectivePrice, round2, type GlobalDiscount } from '../lib/pricing';

const CART_KEY = 'peptide_cart';
const PRICING_MODE_KEY = 'peptide_pricing_mode';

// Get current pricing mode from localStorage
function getCurrentPricingMode(): PricingMode {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(PRICING_MODE_KEY);
    if (saved === 'national' || saved === 'international') {
      return saved;
    }
  }
  return 'national';
}

// Normalize whatever is in localStorage into the identity-only ref shape.
// Handles BOTH the new ref shape AND the legacy shape (full product + price
// snapshot) so existing customer carts survive the upgrade without data loss.
function loadRefsFromStorage(): CartItemRef[] {
  if (typeof window === 'undefined') return [];
  const saved = localStorage.getItem(CART_KEY);
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((raw: any): CartItemRef | null => {
        // Legacy shape: { product: Product, variation?, price, quantity, ... }
        if (raw && raw.product && raw.product.id) {
          return {
            product_id: raw.product.id,
            variation_id: raw.variation?.id,
            quantity: Math.max(1, Number(raw.quantity) || 1),
            pricing_mode: raw.pricing_mode === 'international' ? 'international' : 'national',
            currency: raw.currency === 'USD' ? 'USD' : 'PHP',
            added_at: Number(raw.added_at) || Date.now(),
            snapshot: {
              name: raw.product.name ?? 'Product',
              image_url: raw.product.image_url ?? null,
              variation_name: raw.variation?.name ?? null,
              purity_percentage: raw.product.purity_percentage ?? null,
            },
          };
        }
        // New ref shape
        if (raw && raw.product_id) {
          return {
            product_id: raw.product_id,
            variation_id: raw.variation_id,
            quantity: Math.max(1, Number(raw.quantity) || 1),
            pricing_mode: raw.pricing_mode === 'international' ? 'international' : 'national',
            currency: raw.currency === 'USD' ? 'USD' : 'PHP',
            added_at: Number(raw.added_at) || Date.now(),
            snapshot: raw.snapshot,
          };
        }
        return null;
      })
      .filter((r): r is CartItemRef => r !== null);
  } catch (error) {
    console.error('Error loading cart from localStorage:', error);
    return [];
  }
}

// Build a minimal placeholder Product so a deleted / not-yet-loaded item can
// still render a name + image. It is marked unavailable and priced at 0 so it
// can never contribute to a total or be checked out.
function placeholderProduct(ref: CartItemRef): Product {
  return {
    id: ref.product_id,
    name: ref.snapshot?.name ?? 'Unavailable product',
    description: '',
    category: '',
    base_price: 0,
    national_price: null,
    international_price: null,
    discount_price: null,
    discount_start_date: null,
    discount_end_date: null,
    discount_active: false,
    concentration: null,
    purity_percentage: ref.snapshot?.purity_percentage ?? 0,
    molecular_weight: null,
    cas_number: null,
    sequence: null,
    storage_conditions: '',
    inclusions: null,
    stock_quantity: 0,
    available: false,
    featured: false,
    image_url: ref.snapshot?.image_url ?? null,
    safety_sheet_url: null,
    created_at: '',
    updated_at: '',
    variations: [],
  };
}

/**
 * Cart hook.
 *
 * Source of truth is `refs` (identity + quantity), persisted to localStorage.
 * The UI-facing `cartItems` are RESOLVED live against `menuItems` on every
 * render, so prices, stock, and availability always reflect the database. When
 * `menuItems` updates (useMenu's realtime subscription), totals recompute with
 * no stale cache — that is the cart-price fix.
 *
 * @param menuItems live products from useMenu()
 * @param globalDiscount optional sitewide discount (wired in Phase 4)
 */
export function useCart(menuItems: Product[] = [], globalDiscount?: GlobalDiscount | null) {
  const [refs, setRefs] = useState<CartItemRef[]>(() => loadRefsFromStorage());

  // Persist identity-only refs whenever they change.
  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(refs));
  }, [refs]);

  // Resolve refs -> live cart items. Recomputes when refs OR menuItems change.
  const cartItems = useMemo<CartItem[]>(() => {
    return refs.map((ref) => {
      const liveProduct = menuItems.find((p) => p.id === ref.product_id);

      if (!liveProduct) {
        const product = placeholderProduct(ref);
        return {
          product,
          variation: undefined,
          quantity: ref.quantity,
          price: 0,
          pricing_mode: ref.pricing_mode,
          currency: ref.currency,
          available: false,
          availableStock: 0,
          lineTotal: 0,
        };
      }

      const variation = ref.variation_id
        ? liveProduct.variations?.find((v) => v.id === ref.variation_id)
        : undefined;

      // A variation that no longer exists means the line is unavailable.
      const variationMissing = !!ref.variation_id && !variation;
      const available = liveProduct.available !== false && !variationMissing;

      const availableStock = variation
        ? variation.stock_quantity
        : liveProduct.stock_quantity;

      const price = available
        ? computeEffectivePrice(liveProduct, variation, {
            pricingMode: ref.pricing_mode,
            globalDiscount,
          })
        : 0;

      return {
        product: liveProduct,
        variation,
        quantity: ref.quantity,
        price,
        pricing_mode: ref.pricing_mode,
        currency: ref.currency,
        available,
        availableStock,
        lineTotal: price * ref.quantity,
      };
    });
  }, [refs, menuItems, globalDiscount]);

  const addToCart = useCallback((product: Product, variation?: ProductVariation, quantity: number = 1) => {
    const pricingMode = getCurrentPricingMode();
    const currency = pricingMode === 'national' ? 'PHP' : 'USD';

    // Check stock availability from the live product/variation passed in.
    const availableStock = variation ? variation.stock_quantity : product.stock_quantity;

    if (availableStock === 0) {
      alert(`Sorry, ${product.name}${variation ? ` ${variation.name}` : ''} is out of stock.`);
      return;
    }

    setRefs((current) => {
      // Prevent mixing currencies in the cart
      if (current.length > 0) {
        const cartCurrency = current[0].currency;
        if (cartCurrency !== currency) {
          const currencyLabel = cartCurrency === 'PHP' ? 'Peso (₱)' : 'Dollar ($)';
          const newCurrencyLabel = currency === 'PHP' ? 'Peso (₱)' : 'Dollar ($)';
          alert(
            `Your cart currently contains ${currencyLabel} items. ` +
            `You cannot add ${newCurrencyLabel} items to the same cart. ` +
            `Please clear your cart first or switch your pricing mode.`
          );
          return current;
        }
      }

      const existingIndex = current.findIndex(
        (item) => item.product_id === product.id &&
          (variation ? item.variation_id === variation.id : !item.variation_id) &&
          item.pricing_mode === pricingMode
      );

      if (existingIndex > -1) {
        const currentQuantity = current[existingIndex].quantity;
        let qtyToAdd = quantity;
        const newQuantity = currentQuantity + qtyToAdd;

        if (newQuantity > availableStock) {
          const remainingStock = availableStock - currentQuantity;
          if (remainingStock > 0) {
            alert(`Only ${remainingStock} item(s) available in stock. Added ${remainingStock} to your cart.`);
            qtyToAdd = remainingStock;
          } else {
            alert(`Sorry, you already have the maximum available quantity (${currentQuantity}) in your cart.`);
            return current;
          }
        }

        const updated = [...current];
        updated[existingIndex] = { ...updated[existingIndex], quantity: currentQuantity + qtyToAdd };
        return updated;
      }

      // New item — clamp to stock
      let qtyToAdd = quantity;
      if (qtyToAdd > availableStock) {
        alert(`Only ${availableStock} item(s) available in stock. Added ${availableStock} to your cart.`);
        qtyToAdd = availableStock;
      }

      const newRef: CartItemRef = {
        product_id: product.id,
        variation_id: variation?.id,
        quantity: qtyToAdd,
        pricing_mode: pricingMode,
        currency,
        added_at: Date.now(),
        snapshot: {
          name: product.name,
          image_url: product.image_url ?? null,
          variation_name: variation?.name ?? null,
          purity_percentage: product.purity_percentage ?? null,
        },
      };
      return [...current, newRef];
    });
  }, []);

  const removeFromCart = useCallback((index: number) => {
    setRefs((current) => current.filter((_, i) => i !== index));
  }, []);

  const updateQuantity = useCallback((index: number, quantity: number) => {
    if (quantity <= 0) {
      setRefs((current) => current.filter((_, i) => i !== index));
      return;
    }

    setRefs((current) => {
      const ref = current[index];
      if (!ref) return current;

      // Clamp against current live stock when the product is loaded.
      const liveProduct = menuItems.find((p) => p.id === ref.product_id);
      let availableStock = Infinity;
      if (liveProduct) {
        const variation = ref.variation_id
          ? liveProduct.variations?.find((v) => v.id === ref.variation_id)
          : undefined;
        availableStock = variation ? variation.stock_quantity : liveProduct.stock_quantity;
      }

      let newQuantity = quantity;
      if (availableStock !== Infinity && newQuantity > availableStock) {
        alert(`Only ${availableStock} item(s) available in stock.`);
        newQuantity = availableStock;
      }

      const updated = [...current];
      updated[index] = { ...ref, quantity: newQuantity };
      return updated;
    });
  }, [menuItems]);

  const clearCart = useCallback(() => {
    setRefs([]);
    localStorage.removeItem(CART_KEY);
  }, []);

  const getTotalPrice = useCallback(() => {
    const sum = cartItems.reduce((total, item) => total + (item.available ? item.lineTotal : 0), 0);
    return round2(sum); // round the aggregate to avoid float drift (e.g. 99.99999…)
  }, [cartItems]);

  const getTotalItems = useCallback(() => {
    // Based on refs so the badge count is stable even before the menu loads.
    return refs.reduce((total, ref) => total + ref.quantity, 0);
  }, [refs]);

  // Update all cart items to a new pricing mode. Prices are derived live, so we
  // only need to flip the mode/currency on the refs.
  const updateCartPricingMode = useCallback((newMode: PricingMode) => {
    const newCurrency = newMode === 'national' ? 'PHP' : 'USD';
    setRefs((current) => current.map((ref) => ({ ...ref, pricing_mode: newMode, currency: newCurrency })));
  }, []);

  const getCartPricingMode = useCallback((): PricingMode => {
    if (refs.length > 0) return refs[0].pricing_mode;
    return getCurrentPricingMode();
  }, [refs]);

  return {
    cartItems,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    getTotalPrice,
    getTotalItems,
    updateCartPricingMode,
    getCartPricingMode,
  };
}

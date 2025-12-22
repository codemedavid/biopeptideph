import { useState, useEffect, useCallback } from 'react';
import type { CartItem, Product, ProductVariation, PricingMode } from '../types';
import { getPrice, getVariationPrice } from './usePricingMode';

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

export function useCart() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem(CART_KEY);
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart);
        // Migrate old cart items that don't have pricing_mode
        const migratedItems = parsed.map((item: CartItem) => ({
          ...item,
          pricing_mode: item.pricing_mode || 'national',
          currency: item.currency || 'PHP',
        }));
        setCartItems(migratedItems);
      } catch (error) {
        console.error('Error loading cart from localStorage:', error);
      }
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cartItems));
  }, [cartItems]);

  const addToCart = useCallback((product: Product, variation?: ProductVariation, quantity: number = 1) => {
    const pricingMode = getCurrentPricingMode();
    const currency = pricingMode === 'national' ? 'PHP' : 'USD';

    // Check stock availability
    const availableStock = variation ? variation.stock_quantity : product.stock_quantity;

    if (availableStock === 0) {
      alert(`Sorry, ${product.name}${variation ? ` ${variation.name}` : ''} is out of stock.`);
      return;
    }

    // Get price based on current pricing mode
    const price = variation
      ? getVariationPrice(variation, pricingMode)
      : getPrice(product, pricingMode);

    setCartItems(currentItems => {
      const existingItemIndex = currentItems.findIndex(
        item => item.product.id === product.id &&
          (variation ? item.variation?.id === variation.id : !item.variation) &&
          item.pricing_mode === pricingMode // Only match items with same pricing mode
      );

      if (existingItemIndex > -1) {
        // Update existing item - check if new total exceeds stock
        const currentQuantity = currentItems[existingItemIndex].quantity;
        let qtyToAdd = quantity;
        const newQuantity = currentQuantity + qtyToAdd;

        if (newQuantity > availableStock) {
          const remainingStock = availableStock - currentQuantity;
          if (remainingStock > 0) {
            alert(`Only ${remainingStock} item(s) available in stock. Added ${remainingStock} to your cart.`);
            qtyToAdd = remainingStock;
          } else {
            alert(`Sorry, you already have the maximum available quantity (${currentQuantity}) in your cart.`);
            return currentItems;
          }
        }

        const updatedItems = [...currentItems];
        updatedItems[existingItemIndex].quantity += qtyToAdd;
        return updatedItems;
      } else {
        // Add new item - check if quantity exceeds stock
        let qtyToAdd = quantity;
        if (qtyToAdd > availableStock) {
          alert(`Only ${availableStock} item(s) available in stock. Added ${availableStock} to your cart.`);
          qtyToAdd = availableStock;
        }

        const newItem: CartItem = {
          product,
          variation,
          quantity: qtyToAdd,
          price,
          pricing_mode: pricingMode,
          currency,
        };
        return [...currentItems, newItem];
      }
    });
  }, []);

  const updateQuantity = useCallback((index: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(index);
      return;
    }

    setCartItems(currentItems => {
      const item = currentItems[index];
      if (!item) return currentItems;

      const availableStock = item.variation ? item.variation.stock_quantity : item.product.stock_quantity;

      let newQuantity = quantity;
      if (newQuantity > availableStock) {
        alert(`Only ${availableStock} item(s) available in stock.`);
        newQuantity = availableStock;
      }

      const updatedItems = [...currentItems];
      updatedItems[index] = { ...updatedItems[index], quantity: newQuantity };
      return updatedItems;
    });
  }, []);

  const removeFromCart = useCallback((index: number) => {
    setCartItems(currentItems => currentItems.filter((_, i) => i !== index));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    localStorage.removeItem(CART_KEY);
  }, []);

  const getTotalPrice = useCallback(() => {
    return cartItems.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);
  }, [cartItems]);

  const getTotalItems = useCallback(() => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  }, [cartItems]);

  // Update all cart items to a new pricing mode
  const updateCartPricingMode = useCallback((newMode: PricingMode) => {
    const newCurrency = newMode === 'national' ? 'PHP' : 'USD';

    setCartItems(currentItems =>
      currentItems.map(item => {
        const newPrice = item.variation
          ? getVariationPrice(item.variation, newMode)
          : getPrice(item.product, newMode);

        return {
          ...item,
          price: newPrice,
          pricing_mode: newMode,
          currency: newCurrency,
        };
      })
    );
  }, []);

  // Get current cart's pricing mode (from first item or default)
  const getCartPricingMode = useCallback((): PricingMode => {
    if (cartItems.length > 0) {
      return cartItems[0].pricing_mode;
    }
    return getCurrentPricingMode();
  }, [cartItems]);

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

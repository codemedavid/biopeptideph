import React, { useEffect, useState } from 'react';
import { Plus, Minus, ShoppingCart, Package } from 'lucide-react';
import type { Product, ProductVariation } from '../types';
import type { GroupBuyPhase, KitState } from '../lib/kitRules';
import { usePricingMode, getPrice, getVariationPrice } from '../hooks/usePricingMode';
import { getBasePriceByMode } from '../lib/pricing';
import { imageUrl } from '../lib/imageDelivery';

interface MenuItemCardProps {
  product: Product;
  onAddToCart: (product: Product, variation?: ProductVariation, quantity?: number) => void;
  cartQuantity?: number;
  onUpdateQuantity?: (index: number, quantity: number) => void;
  onProductClick?: (product: Product) => void;
  // Turned OFF for the active GB (behavior = "disable"): visible but not purchasable.
  unavailable?: boolean;
  // A group buy is OPEN and this product is NOT part of it — block add-to-cart
  // and steer the shopper to the active round instead.
  gbLocked?: boolean;
  gbNumber?: number | null;
  onGoToGroupBuy?: () => void;
  /**
   * MOQ + kit context for the current round, resolved per VARIATION (each
   * strength has its own minimum and fills its own kit). Omitted (or before the
   * MOQ migrations are applied) the card behaves exactly as it always has.
   */
  kit?: {
    phase: GroupBuyPhase;
    getState: (variationId?: string | null) => KitState;
    getMoq: (variationId?: string | null) => number;
  };
  /**
   * Pin the card to one variation (the Bunuan page lists each short strength
   * as its own card): it is preselected and the other strengths are hidden.
   */
  lockedVariationId?: string | null;
}

// QuantityInput component
const QuantityInput: React.FC<{
  value: number;
  max: number;
  onChange: (val: number) => void;
}> = ({ value, max, onChange }) => {
  const [localValue, setLocalValue] = useState<string>(value.toString());

  React.useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocalValue(newVal);

    if (newVal === '') return;
    const parsed = parseInt(newVal);
    if (!isNaN(parsed) && parsed > 0) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    let parsed = parseInt(localValue);
    if (isNaN(parsed) || parsed < 1) parsed = 1;
    if (max > 0 && parsed > max) parsed = max;
    setLocalValue(parsed.toString());
    onChange(parsed);
  };

  return (
    <input
      type="number"
      min="1"
      max={max > 0 ? max : 999}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onClick={(e) => e.stopPropagation()}
      className="w-8 sm:w-10 text-center text-xs sm:text-sm font-medium text-theme-text border-none focus:ring-0 p-0 appearance-none bg-transparent no-spinner"
    />
  );
};

const MenuItemCard: React.FC<MenuItemCardProps> = ({
  product,
  onAddToCart,
  cartQuantity = 0,
  onProductClick,
  unavailable = false,
  gbLocked = false,
  gbNumber = null,
  onGoToGroupBuy,
  kit,
  lockedVariationId = null,
}) => {
  const { pricingMode, currencySymbol, isInternational, globalDiscount } = usePricingMode();
  const lockedVariation = lockedVariationId
    ? product.variations?.find((v) => v.id === lockedVariationId)
    : undefined;
  const pickableVariations = lockedVariation ? [lockedVariation] : (product.variations ?? []);
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | undefined>(
    lockedVariation ?? (product.variations && product.variations.length > 0 ? product.variations[0] : undefined)
  );

  // Effective (discounted) price and the non-discounted "was" price — both via the
  // centralized pricing authority, so per-product AND global discounts are shown.
  const currentPrice = selectedVariation
    ? getVariationPrice(selectedVariation, pricingMode, globalDiscount)
    : getPrice(product, pricingMode, globalDiscount);
  const wasPrice = getBasePriceByMode(product, selectedVariation, pricingMode);
  const hasDiscount = currentPrice < wasPrice - 0.001;

  const availableStock = selectedVariation ? selectedVariation.stock_quantity : product.stock_quantity;

  // Check if product has any available stock (either in variations or product itself)
  const hasAnyStock = product.variations && product.variations.length > 0
    ? product.variations.some(v => v.stock_quantity > 0)
    : product.stock_quantity > 0;

  // --- MOQ / Bunuan bounds --------------------------------------------------
  // Normal ordering: the MOQ is a floor and stock is the ceiling.
  // Bunuan: the MOQ is suspended (buying a single vial is the whole point) and
  // the kit's shortfall becomes the ceiling, usually well below stock.
  const isBunuan = kit?.phase === 'bunuan_open';
  // Per variation: switching 10mg -> 15mg switches the minimum and the kit.
  const kitState = kit ? kit.getState(selectedVariation?.id) : undefined;
  const moq = kit ? kit.getMoq(selectedVariation?.id) : 1;
  const minQuantity = isBunuan ? 1 : moq;
  const bunuanRemaining = isBunuan && kitState ? kitState.bunuanAvailable : null;
  const maxQuantity = bunuanRemaining !== null
    ? Math.min(availableStock, bunuanRemaining)
    : availableStock;

  // A kit-tracked product that is finished (or was switched off) cannot be
  // bought during Bunuan at all.
  const bunuanClosed = isBunuan && bunuanRemaining !== null && bunuanRemaining <= 0;

  // Start at the minimum the customer is allowed to buy, so a MOQ-3 product
  // opens on 3 instead of making them click "+" twice to discover the rule.
  const [quantity, setQuantity] = useState(minQuantity);

  // MOQ and kit numbers arrive asynchronously, so the opening quantity is
  // corrected once they land — and again whenever the round's rules change.
  useEffect(() => {
    setQuantity((prev) => {
      const clamped = Math.min(Math.max(prev, minQuantity), Math.max(maxQuantity, minQuantity));
      return clamped === prev ? prev : clamped;
    });
  }, [minQuantity, maxQuantity]);

  const handleAddToCart = () => {
    onAddToCart(product, selectedVariation, quantity);
    setQuantity(minQuantity);
  };

  const incrementQuantity = () => {
    setQuantity(prev => {
      if (prev >= maxQuantity) {
        alert(
          bunuanRemaining !== null && bunuanRemaining < availableStock
            ? `Only ${bunuanRemaining} left to complete this kit.`
            : `Only ${availableStock} item(s) available in stock.`
        );
        return prev;
      }
      return prev + 1;
    });
  };

  // Stops at the MOQ rather than at 1: dropping below the minimum is not a
  // state the customer can check out from, so the control should not offer it.
  const decrementQuantity = () => setQuantity(prev => (prev > minQuantity ? prev - 1 : minQuantity));

  return (
    <div className="bg-gradient-to-b from-[var(--frost-strong)] to-[var(--frost)] backdrop-blur-[14px] rounded-[var(--r-lg)] shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-frost),var(--glow)] hover:-translate-y-1.5 transition-all duration-300 border border-[var(--frost-line)] overflow-hidden h-full flex flex-col group relative p-2.5">
      {/* Click overlay for product details */}
      <div
        onClick={() => onProductClick?.(product)}
        className="absolute inset-x-0 top-0 h-36 z-10 cursor-pointer"
        title="View details"
      />

      {/* Product Image - frosted media pane */}
      <div className="relative h-36 rounded-[16px] overflow-hidden" style={{ background: 'radial-gradient(120% 120% at 50% 18%, #ffffff, #e4f3ff 70%, #cfeaff)' }}>
        {product.image_url ? (
          <img
            src={imageUrl(product.image_url, 640)}
            loading="lazy"
            decoding="async"
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-theme-blue/30">
            <Package className="w-8 h-8" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
          {product.featured && (
            <span className="bg-theme-blue text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
              Featured
            </span>
          )}
          {hasDiscount && (
            <span className="bg-theme-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
              {Math.round((1 - currentPrice / wasPrice) * 100)}% OFF
            </span>
          )}
          {isInternational && (
            <span className="bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
              🌎 USD
            </span>
          )}
        </div>

        {/* Stock Status Overlay */}
        {!hasAnyStock && !unavailable && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
            <span className="bg-theme-navy text-white px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wide">
              Out of Stock
            </span>
          </div>
        )}

        {/* GB Unavailable Overlay (admin turned this product OFF for the current Group Buy) */}
        {unavailable && (
          <div className="absolute inset-0 bg-white/85 backdrop-blur-sm flex items-center justify-center z-10">
            <span className="bg-theme-navy text-white px-3 py-1 text-[10px] md:text-[11px] font-bold rounded-full uppercase tracking-wide text-center">
              Currently Unavailable
            </span>
          </div>
        )}
      </div>

      {/* Product Details */}
      <div className="p-3 sm:p-5 flex-1 flex flex-col">
        <h3 className="font-bold text-theme-navy text-sm sm:text-lg mb-1 line-clamp-2 leading-tight group-hover:text-theme-blue transition-colors">{product.name}</h3>
        <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem] leading-relaxed">{product.description}</p>

        {/* Variations (Sizes) */}
        <div className="mb-3 sm:mb-4 min-h-[2.5rem] sm:min-h-[3rem]">
          {pickableVariations.length > 0 && (
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {pickableVariations.slice(0, 3).map((variation) => {
                const isOutOfStock = variation.stock_quantity === 0;
                return (
                  <button
                    key={variation.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isOutOfStock) {
                        setSelectedVariation(variation);
                      }
                    }}
                    disabled={isOutOfStock}
                    className={`
                      px-2 py-1 text-[10px] sm:text-xs font-medium rounded-md border transition-all relative z-20
                      ${selectedVariation?.id === variation.id && !isOutOfStock
                        ? 'bg-theme-navy text-white border-theme-navy shadow-sm'
                        : isOutOfStock
                          ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-theme-blue hover:text-theme-blue'
                      }
                    `}
                  >
                    {variation.name}
                  </button>
                );
              })}
              {pickableVariations.length > 3 && (
                <span className="text-[10px] sm:text-xs text-gray-400 self-center font-medium">
                  +{pickableVariations.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Price and Cart Actions */}
        <div className="flex flex-col gap-2 sm:gap-3 mt-1 sm:mt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg sm:text-xl font-bold text-theme-navy">
              {currencySymbol}{currentPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
            </span>
            {hasDiscount && (
              <span className="text-xs sm:text-sm text-gray-400 line-through decoration-gray-300">
                {currencySymbol}{wasPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 relative z-20">
            {/* Quantity Controls */}
            <div className="flex items-center justify-between border border-gray-200 rounded-lg bg-gray-50 sm:w-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  decrementQuantity();
                }}
                className="p-1.5 sm:p-2 hover:bg-gray-100 transition-colors rounded-l-lg text-gray-500 hover:text-theme-navy flex-1 sm:flex-none flex justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!hasAnyStock || quantity <= minQuantity}
              >
                <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
              <div className="w-8 flex justify-center">
                <QuantityInput
                  value={quantity}
                  max={maxQuantity}
                  onChange={setQuantity}
                />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  incrementQuantity();
                }}
                className="p-1.5 sm:p-2 hover:bg-gray-100 transition-colors rounded-r-lg text-gray-500 hover:text-theme-navy flex-1 sm:flex-none flex justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={quantity >= maxQuantity || !hasAnyStock}
              >
                <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
            </div>

            {/* Add to Cart Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (gbLocked) { onGoToGroupBuy?.(); return; }
                if (unavailable || bunuanClosed) return;
                if (quantity > maxQuantity) {
                  alert(
                    bunuanRemaining !== null && bunuanRemaining < availableStock
                      ? `Only ${bunuanRemaining} left to complete this kit.`
                      : `Only ${availableStock} item(s) available in stock.`
                  );
                  setQuantity(maxQuantity);
                  return;
                }
                // Backstop for a typed-in quantity below the MOQ. The server
                // rejects it too; this just explains it before the cart.
                if (quantity < minQuantity) {
                  alert(`Minimum order for ${product.name} is ${minQuantity} vials.`);
                  setQuantity(minQuantity);
                  return;
                }
                handleAddToCart();
              }}
              disabled={!gbLocked && (!hasAnyStock || availableStock === 0 || unavailable || bunuanClosed)}
              className="flex-1 min-w-0 bg-gradient-to-b from-theme-blue to-theme-secondary text-white px-3 py-2 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold shadow-[0_12px_26px_-12px_var(--ice-deep)] hover:-translate-y-0.5 hover:shadow-[var(--glow)] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2 group/btn"
            >
              <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 group-hover/btn:scale-110 transition-transform" />
              <span>
                {gbLocked
                  ? 'View Group Buy'
                  : unavailable
                    ? 'Unavailable'
                    : bunuanClosed
                      ? 'Kit Completed'
                      : 'Add'}
              </span>
            </button>
          </div>

          {/* MOQ notice — normal ordering only. Shown as a standing rule, not an
              error, so the customer learns it before hitting the cart. */}
          {!gbLocked && !isBunuan && moq > 1 && (
            <p className="text-[11px] leading-snug text-theme-text/60">
              Minimum order: <span className="font-semibold text-theme-text">{moq} vials</span>
            </p>
          )}

          {/* Bunuan progress — "8 / 10 filled, 2 needed to complete this kit" */}
          {isBunuan && kitState && kitState.kitSize !== null && (
            <div className="rounded-md bg-theme-accent/10 border border-theme-accent/20 px-2 py-1.5 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-theme-accent">
                <span>BUNUAN</span>
                <span>{kitState.inProgress} / {kitState.kitSize} filled</span>
              </div>
              <div
                className="h-1.5 rounded-full bg-theme-accent/20 overflow-hidden"
                role="progressbar"
                aria-valuenow={kitState.inProgress}
                aria-valuemin={0}
                aria-valuemax={kitState.kitSize}
                aria-label={`${kitState.inProgress} of ${kitState.kitSize} vials filled`}
              >
                <div
                  className="h-full bg-theme-accent transition-[width] duration-300"
                  style={{ width: `${(kitState.inProgress / kitState.kitSize) * 100}%` }}
                />
              </div>
              <p className="text-[11px] leading-snug text-theme-text/70">
                {bunuanClosed
                  ? 'Kit completed.'
                  : `${kitState.bunuanAvailable} ${kitState.bunuanAvailable === 1 ? 'vial' : 'vials'} needed to complete this kit.`}
              </p>
            </div>
          )}

          {/* GB Lock Notice — a group buy is open, so the normal catalog is closed for checkout */}
          {gbLocked && (
            <button
              onClick={(e) => { e.stopPropagation(); onGoToGroupBuy?.(); }}
              className="text-left text-[11px] leading-snug bg-theme-accent/10 border border-theme-accent/20 text-theme-accent rounded-md px-2 py-1.5"
            >
              Can't add to cart — Group Buy{gbNumber ? ` #${gbNumber}` : ''} is currently open.{' '}
              <span className="font-semibold underline">Shop the Group Buy →</span>
            </button>
          )}

          {/* Cart Status */}
          {cartQuantity > 0 && (
            <div className="text-center text-xs text-theme-blue font-medium bg-theme-blue/5 py-1 rounded-md">
              {cartQuantity} in cart
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MenuItemCard;

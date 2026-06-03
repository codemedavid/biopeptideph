import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { PricingMode } from '../types';
import { computeEffectivePrice, type GlobalDiscount } from '../lib/pricing';
import { supabase } from '../lib/supabase';

const PRICING_MODE_KEY = 'peptide_pricing_mode';

interface PricingContextValue {
    pricingMode: PricingMode;
    currency: 'PHP' | 'USD';
    currencySymbol: string;
    setPricingMode: (mode: PricingMode) => void;
    isNational: boolean;
    isInternational: boolean;
    // Sitewide discount (#7), loaded from site_settings. null = none active.
    globalDiscount: GlobalDiscount | null;
}

const PricingContext = createContext<PricingContextValue | undefined>(undefined);

export function PricingProvider({ children }: { children: ReactNode }) {
    const [pricingMode, setPricingModeState] = useState<PricingMode>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(PRICING_MODE_KEY);
            if (saved === 'national' || saved === 'international') {
                return saved;
            }
        }
        return 'national';
    });

    const currency = pricingMode === 'national' ? 'PHP' : 'USD';
    const currencySymbol = pricingMode === 'national' ? '₱' : '$';
    const isNational = pricingMode === 'national';
    const isInternational = pricingMode === 'international';

    const [globalDiscount, setGlobalDiscount] = useState<GlobalDiscount | null>(null);

    useEffect(() => {
        localStorage.setItem(PRICING_MODE_KEY, pricingMode);
    }, [pricingMode]);

    // Load the sitewide discount once. Missing rows / unmigrated DB -> no discount.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data } = await supabase
                    .from('site_settings')
                    .select('id, value')
                    .in('id', ['global_discount_active', 'global_discount_type', 'global_discount_value', 'global_discount_start', 'global_discount_end']);
                if (cancelled || !data) return;
                const get = (id: string) => data.find((r: { id: string; value: string }) => r.id === id)?.value;
                const active = get('global_discount_active') === 'true';
                const value = parseFloat(get('global_discount_value') || '0');
                if (active && value > 0) {
                    setGlobalDiscount({
                        active: true,
                        type: get('global_discount_type') === 'fixed' ? 'fixed' : 'percentage',
                        value,
                        startDate: get('global_discount_start') || null,
                        endDate: get('global_discount_end') || null,
                    });
                } else {
                    setGlobalDiscount(null);
                }
            } catch {
                if (!cancelled) setGlobalDiscount(null);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const setPricingMode = useCallback((mode: PricingMode) => {
        setPricingModeState(mode);
    }, []);

    const value: PricingContextValue = {
        pricingMode,
        currency,
        currencySymbol,
        setPricingMode,
        isNational,
        isInternational,
        globalDiscount,
    };

    return (
        <PricingContext.Provider value={value}>
            {children}
        </PricingContext.Provider>
    );
}

export function usePricingMode(): PricingContextValue {
    const context = useContext(PricingContext);
    if (context === undefined) {
        throw new Error('usePricingMode must be used within a PricingProvider');
    }
    return context;
}

// Helper function to get the correct price based on pricing mode.
// Delegates to the centralized pricing authority (src/lib/pricing.ts) so every
// surface agrees. `globalDiscount` is optional; when omitted, only mode + the
// per-product discount apply (legacy behavior, now with discount-date enforcement).
export function getPrice(
    product: {
        base_price: number;
        national_price?: number | null;
        international_price?: number | null;
        discount_active?: boolean;
        discount_price?: number | null;
        discount_start_date?: string | null;
        discount_end_date?: string | null;
    },
    pricingMode: PricingMode,
    globalDiscount?: GlobalDiscount | null
): number {
    return computeEffectivePrice(product, undefined, { pricingMode, globalDiscount });
}

// Helper function to get the correct variation price based on pricing mode.
export function getVariationPrice(
    variation: {
        price: number;
        national_price?: number | null;
        international_price?: number | null;
    },
    pricingMode: PricingMode,
    globalDiscount?: GlobalDiscount | null
): number {
    // The product fields are unused on the variation path; the stub keeps the
    // single-function contract without forcing callers to pass a full product.
    return computeEffectivePrice(
        { base_price: variation.price },
        variation,
        { pricingMode, globalDiscount }
    );
}

// Format price with currency symbol
export function formatPrice(price: number, pricingMode: PricingMode): string {
    const symbol = pricingMode === 'national' ? '₱' : '$';
    return `${symbol}${price.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

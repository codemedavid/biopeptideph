import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { PricingMode } from '../types';

const PRICING_MODE_KEY = 'peptide_pricing_mode';

interface PricingContextValue {
    pricingMode: PricingMode;
    currency: 'PHP' | 'USD';
    currencySymbol: string;
    setPricingMode: (mode: PricingMode) => void;
    isNational: boolean;
    isInternational: boolean;
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

    useEffect(() => {
        localStorage.setItem(PRICING_MODE_KEY, pricingMode);
    }, [pricingMode]);

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

// Helper function to get the correct price based on pricing mode
export function getPrice(
    product: {
        base_price: number;
        national_price?: number | null;
        international_price?: number | null;
        discount_active?: boolean;
        discount_price?: number | null;
    },
    pricingMode: PricingMode
): number {
    if (pricingMode === 'international') {
        return product.international_price ?? product.base_price;
    }

    if (product.discount_active && product.discount_price) {
        return product.discount_price;
    }

    return product.national_price ?? product.base_price;
}

// Helper function to get the correct variation price based on pricing mode
export function getVariationPrice(
    variation: {
        price: number;
        national_price?: number | null;
        international_price?: number | null;
    },
    pricingMode: PricingMode
): number {
    if (pricingMode === 'international') {
        return variation.international_price ?? variation.price;
    }
    return variation.national_price ?? variation.price;
}

// Format price with currency symbol
export function formatPrice(price: number, pricingMode: PricingMode): string {
    const symbol = pricingMode === 'national' ? '₱' : '$';
    return `${symbol}${price.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

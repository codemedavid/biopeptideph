// Peptide Product Types

// Pricing Mode Type
export type PricingMode = 'national' | 'international';

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  base_price: number;
  national_price: number | null;
  international_price: number | null;
  discount_price: number | null;
  discount_start_date: string | null;
  discount_end_date: string | null;
  discount_active: boolean;

  // Peptide-specific fields
  concentration: string | null;
  purity_percentage: number;
  molecular_weight: string | null;
  cas_number: string | null;
  sequence: string | null;
  storage_conditions: string;
  inclusions: string[] | null;

  // Stock and availability
  stock_quantity: number;
  available: boolean;
  featured: boolean;

  // Images and metadata
  image_url: string | null;
  safety_sheet_url: string | null;

  // Group Buy assignment (the preorder "round" a product belongs to). Nullable.
  group_buy_id?: string | null;

  created_at: string;
  updated_at: string;

  // Relations
  variations?: ProductVariation[];
}

export interface ProductVariation {
  id: string;
  product_id: string;
  name: string;
  quantity_mg: number;
  price: number;
  national_price: number | null;
  international_price: number | null;
  stock_quantity: number;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  account_number: string;
  account_name: string;
  qr_code_url: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}



export interface SiteSetting {
  id: string;
  value: string;
  type: string;
  description: string | null;
  updated_at: string;
}

// Group Buy ("round") — see supabase/migrations/*_add_group_buys.sql
export type GroupBuyStatus = 'upcoming' | 'active' | 'closed';

export interface GroupBuy {
  id: string;
  gb_number: number;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: GroupBuyStatus;
  created_at: string;
  updated_at: string;
}

// Hero Carousel slide — see supabase/migrations/*_add_hero_carousel.sql
export interface HeroSlide {
  id: string;
  image_url: string;
  title: string | null;
  subtitle: string | null;
  button_text: string | null;
  button_link: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Cart Types
//
// Two shapes, on purpose:
//  - CartItemRef is what we PERSIST (localStorage). It stores identity + quantity
//    ONLY. Prices are deliberately never persisted, so a cart can't carry a stale
//    price across a price change or a browser session. (Fixes the cart-price bug.)
//  - CartItem is the RESOLVED line the UI consumes. product/variation/price are
//    always live, re-derived from the menu on every change.
export interface CartItemRef {
  product_id: string;
  variation_id?: string;
  quantity: number;
  pricing_mode: PricingMode;
  currency: 'PHP' | 'USD';
  added_at: number;
  // Resilient display-only snapshot — used solely so a deleted/not-yet-loaded
  // product still renders a name/image. NEVER used to compute totals or charge.
  snapshot?: {
    name: string;
    image_url: string | null;
    variation_name?: string | null;
    purity_percentage?: number | null;
  };
}

export interface CartItem {
  product: Product;
  variation?: ProductVariation;
  quantity: number;
  price: number;
  pricing_mode: PricingMode;
  currency: 'PHP' | 'USD';
  // Live state, set by the cart resolver:
  available: boolean;      // product (and variation, if any) currently exists & is available
  availableStock: number;  // current live stock for this line
  lineTotal: number;       // price * quantity (live)
}

// Order Types
export interface OrderDetails {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  payment_method: string;
  notes?: string;
}

export interface SiteSettings {
  site_name: string;
  site_logo: string;
  site_description: string;
  currency: string;
  currency_code: string;

  // Courier Delay Notices
  jnt_delay_active: boolean;
  lalamove_delay_active: boolean;
  jnt_delay_message: string;
  lalamove_delay_message: string;

  // Currency Exchange
  usd_php_rate: number;

  // Admin Fee
  admin_fee_php: number;
  admin_fee_usd: number;

  // Homepage Settings
  home_hero_badge: string;
  home_hero_title_prefix: string;
  home_hero_title_highlight: string;
  home_hero_title_suffix: string;
  home_hero_subtext: string;
  home_hero_tagline: string;
  home_hero_description: string;
  home_hero_image_url: string;
  home_hero_cta_text: string;
  home_hero_cta_link: string;

  // Global Discount (#7)
  global_discount_active: boolean;
  global_discount_type: 'percentage' | 'fixed';
  global_discount_value: number;
  global_discount_start: string;
  global_discount_end: string;

  // Terms & Conditions (#8)
  terms_and_conditions_content: string;
}

// Assessment Types
export interface AssessmentResponse {
  id: string;
  full_name: string;
  email: string;
  phone?: string;

  // Demographics
  age_range: string;
  date_of_birth?: string;
  sex_assigned?: 'male' | 'female' | 'other';
  location: string;

  // Physical Metrics
  height_cm?: number;
  weight_kg?: number;
  waist_inches?: number;
  hip_inches?: number;

  // Goals & Motivators
  goals: string[];
  emotional_motivators?: string[];
  weight_goal_kg?: number;

  // Experience
  experience_level: string;
  peptide_experience_first_time?: boolean;
  current_prescription_glp1?: boolean;

  // Medical History
  medical_conditions?: string[];
  family_history_conditions?: string[];
  current_medications?: string;
  previous_surgeries?: boolean;
  drug_allergies?: boolean;
  smoking_status?: 'smoker' | 'non_smoker' | 'other';

  // Pregnancy/Reproductive
  pregnancy_status?: string[];

  // Preferences
  preferences: {
    budget?: string;
    frequency?: string;
    [key: string]: any;
  };

  // System
  consent_agreed: boolean;
  recommendation_generated?: any;
  created_at: string;
  status: 'new' | 'reviewed' | 'contacted';
}

export interface RecommendationRule {
  id: string;
  rule_name: string;
  target_goal: string;
  target_experience: string;
  primary_product_id: string | null;
  secondary_product_ids: string[] | null;
  educational_note: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
}

// Smart Guide System
export interface SmartGuide {
  id: string;
  title: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  files?: SmartGuideFile[]; // For UI convenience
}

export interface SmartGuideFile {
  id: string;
  guide_id: string;
  display_name: string;
  file_url: string;
  file_type: string;
  sort_order: number;
  created_at: string;
}

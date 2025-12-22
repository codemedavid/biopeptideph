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

// Cart Types
export interface CartItem {
  product: Product;
  variation?: ProductVariation;
  quantity: number;
  price: number;
  pricing_mode: PricingMode;
  currency: 'PHP' | 'USD';
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

  // Homepage Settings
  home_hero_badge: string;
  home_hero_title_prefix: string;
  home_hero_title_highlight: string;
  home_hero_title_suffix: string;
  home_hero_subtext: string;
  home_hero_tagline: string;
  home_hero_description: string;
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

/**
 * Admin dashboard sections a staff account can be granted, with the labels the
 * owner sees when ticking them. The keys must match api/_lib/adminFeatures.js —
 * the server enforces them on its routes; tests/admin-staff.test.mjs checks the
 * two lists stay identical.
 */

export type AdminFeature =
  | 'products'
  | 'categories'
  | 'inventory'
  | 'orders'
  | 'group-buys'
  | 'analytics'
  | 'hero'
  | 'discounts'
  | 'terms'
  | 'access-code'
  | 'payments'
  | 'shipping'
  | 'journey'
  | 'assessment'
  | 'guides'
  | 'fees';

export interface AdminFeatureInfo {
  key: AdminFeature;
  label: string;
  description: string;
}

export const ADMIN_FEATURE_INFO: readonly AdminFeatureInfo[] = [
  { key: 'products', label: 'Products', description: 'Add, edit and price products' },
  { key: 'categories', label: 'Categories', description: 'Organize products' },
  { key: 'inventory', label: 'Inventory', description: 'Track raw materials' },
  { key: 'orders', label: 'Orders', description: 'View and update customer orders' },
  { key: 'group-buys', label: 'Group Buys', description: 'GB rounds, kits and Bunuan access' },
  { key: 'analytics', label: 'Sales Analytics', description: 'Revenue and best sellers' },
  { key: 'hero', label: 'Hero Section', description: 'Homepage banner' },
  { key: 'discounts', label: 'Discounts', description: 'Sitewide promo pricing' },
  { key: 'terms', label: 'Terms', description: 'Checkout terms & conditions' },
  { key: 'access-code', label: 'Access Code', description: 'Change the site entry code' },
  { key: 'payments', label: 'Payments', description: 'Payment accounts' },
  { key: 'shipping', label: 'Shipping', description: 'Shipping rates' },
  { key: 'journey', label: 'Journey Page', description: '"Our Journey" content' },
  { key: 'assessment', label: 'Assessment System', description: 'Responses and rules' },
  { key: 'guides', label: 'Smart Guides', description: 'QR / files pages' },
  { key: 'fees', label: 'Fee Settings', description: 'Admin fee per order' },
];

export type AdminRole = 'owner' | 'staff';

export interface AdminSession {
  role: AdminRole;
  /** null for the owner, who signs in with the admin password only. */
  email: string | null;
  permissions: AdminFeature[];
}

export function canAccess(session: AdminSession | null, feature: AdminFeature): boolean {
  if (!session) return false;
  return session.role === 'owner' || session.permissions.includes(feature);
}

# 🎉 Peptivate.ph - Complete Setup Guide

## ✅ What's Been Completed

Your professional peptide e-commerce platform is ready with a **cute and aesthetic blue & white theme**!

---

## 🎨 **New Aesthetic Features**

### **Color Theme:**
- ✨ **Soft Sky Blue** (#f0f9ff, #e0f2fe) - Pastel backgrounds
- 💙 **Playful Blue** (#38bdf8, #0ea5e9) - Bright, cheerful accents
- 🌊 **Rich Blue** (#0284c7) - Primary elements
- 💗 **Pink Accents** (#f9a8d4) - Cart badges & hearts
- 🌸 **Soft Purple** (#c4b5fd) - Additional cute accent

### **Design Updates:**
- ✅ Super rounded corners (rounded-2xl, rounded-3xl)
- ✅ Soft glow effects and cute shadows
- ✅ Gradient backgrounds everywhere
- ✅ Playful animations and hover effects
- ✅ Emoji accents for extra cuteness
- ✅ Pink heart animations
- ✅ Sparkle effects

---

## 🔬 **COA Lab Reports Feature** (NEW!)

### **Customer COA Page** (`/coa`)
Beautiful showcase page displaying:
- ✅ Janoshik lab test reports
- ✅ Verification links
- ✅ Purity percentages
- ✅ Full report images (click to enlarge)
- ✅ Professional trust badges

### **Admin COA Manager** (`/admin`)
Full CRUD interface to manage lab reports:
- ✅ Add new lab reports
- ✅ Edit existing reports
- ✅ Delete reports
- ✅ Mark reports as featured
- ✅ All fields editable (purity, quantity, verification keys, etc.)

---

## 📋 **Database Setup Required**

Run these 2 SQL scripts in your Supabase SQL Editor:

### **1. Create All Tables & Add Products**

```sql
-- ===================================================================
-- PEPTIVATE.PH - COMPLETE DATABASE SETUP
-- Creates all tables and adds your 9 products
-- ===================================================================

-- Drop existing tables (if any)
DROP TABLE IF EXISTS product_variations CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS payment_methods CASCADE;
DROP TABLE IF EXISTS site_settings CASCADE;

-- Create categories table
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create products table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL REFERENCES categories(id),
  base_price DECIMAL(10,2) NOT NULL,
  discount_price DECIMAL(10,2),
  discount_start_date TIMESTAMPTZ,
  discount_end_date TIMESTAMPTZ,
  discount_active BOOLEAN DEFAULT false,
  purity_percentage DECIMAL(5,2) DEFAULT 99.00,
  molecular_weight TEXT,
  cas_number TEXT,
  sequence TEXT,
  storage_conditions TEXT DEFAULT 'Store at -20°C',
  stock_quantity INTEGER DEFAULT 0,
  available BOOLEAN DEFAULT true,
  featured BOOLEAN DEFAULT false,
  image_url TEXT,
  safety_sheet_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create product variations table
CREATE TABLE product_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity_mg DECIMAL(10,2) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create payment methods table
CREATE TABLE payment_methods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  qr_code_url TEXT,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create site settings table
CREATE TABLE site_settings (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_available ON products(available);
CREATE INDEX idx_products_featured ON products(featured);
CREATE INDEX idx_product_variations_product_id ON product_variations(product_id);
CREATE INDEX idx_categories_active ON categories(active);

-- Create triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_site_settings_updated_at BEFORE UPDATE ON site_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert categories
INSERT INTO categories (id, name, icon, sort_order, active) VALUES
('all', 'All Products', 'Grid', 0, true),
('weight-management', 'Weight Management', 'Scale', 1, true),
('anti-aging', 'Anti-Aging & Longevity', 'Sparkles', 2, true),
('recovery', 'Recovery & Healing', 'Heart', 3, true),
('wellness', 'Wellness & Support', 'Leaf', 4, true);

-- Insert your 9 products
INSERT INTO products (
  name, description, category, base_price,
  purity_percentage, molecular_weight, cas_number, sequence,
  storage_conditions, stock_quantity, available, featured
) VALUES
('Tirzepatide 15mg', 'Tirzepatide is a dual GIP/GLP-1 receptor agonist. Premium peptide for metabolic support. 15mg formulation.', 'weight-management', 8500.00, 99.5, '4813.5 g/mol', '2023788-19-2', 'Proprietary', 'Store at -20°C for long-term storage. Reconstituted solution should be stored at 2-8°C for up to 30 days.', 50, true, true),
('Tirzepatide 30mg', 'Tirzepatide is a dual GIP/GLP-1 receptor agonist. Premium peptide for metabolic support. 30mg formulation.', 'weight-management', 15000.00, 99.5, '4813.5 g/mol', '2023788-19-2', 'Proprietary', 'Store at -20°C for long-term storage. Reconstituted solution should be stored at 2-8°C for up to 30 days.', 50, true, true),
('NAD+ 500mg', 'Nicotinamide Adenine Dinucleotide (NAD+) is a coenzyme essential for cellular energy metabolism.', 'anti-aging', 3500.00, 99.0, '663.43 g/mol', '53-84-9', 'C21H27N7O14P2', 'Store at -20°C. Protect from light and moisture.', 100, true, true),
('Cagrilintide 5mg', 'Cagrilintide is a long-acting amylin analogue. Premium peptide for appetite regulation support.', 'weight-management', 6500.00, 98.5, '3896.4 g/mol', '2381089-83-2', 'Proprietary', 'Store lyophilized at -20°C. Reconstituted solution at 2-8°C for up to 14 days.', 50, true, false),
('Epithalon 10mg', 'Epithalon (Epitalon) is a synthetic tetrapeptide for longevity support.', 'anti-aging', 2500.00, 99.0, '390.35 g/mol', '307297-39-8', 'Ala-Glu-Asp-Gly', 'Store at -20°C in dry state. Reconstituted at 2-8°C for up to 14 days.', 100, true, true),
('Bacteriostatic Water 10ml', 'Sterile bacteriostatic water for injection, USP. Contains 0.9% benzyl alcohol as preservative.', 'wellness', 350.00, NULL, NULL, NULL, 'Sterile Water + 0.9% Benzyl Alcohol', 'Store at room temperature (20-25°C). Do not freeze.', 200, true, false),
('SS-31 (Elamipretide) 10mg', 'SS-31 is a mitochondrial-targeted peptide for cellular energy support.', 'recovery', 4500.00, 98.0, '640.78 g/mol', '736992-21-5', 'D-Arg-Dmt-Lys-Phe-NH2', 'Store lyophilized at -20°C. Reconstituted solution at 2-8°C for up to 7 days.', 50, true, false),
('KPV 10mg', 'KPV is a tripeptide with anti-inflammatory properties.', 'recovery', 2800.00, 99.0, '357.42 g/mol', '23404-68-4', 'Lys-Pro-Val', 'Store at -20°C. Reconstituted solution at 2-8°C for up to 14 days.', 75, true, false),
('GHK-Cu 50mg', 'GHK-Cu is a copper peptide complex for tissue repair and skin regeneration.', 'recovery', 3200.00, 98.5, '404.98 g/mol', '49557-75-7', 'Gly-His-Lys + Cu2+', 'Store at -20°C protected from light. Reconstituted at 2-8°C for up to 21 days.', 80, true, true);

-- Add product variations
INSERT INTO product_variations (product_id, name, quantity_mg, price, stock_quantity)
SELECT id, '5mg Vial', 5, 3500.00, 50 FROM products WHERE name = 'Tirzepatide 15mg'
UNION ALL
SELECT id, '10mg Vial', 10, 6500.00, 50 FROM products WHERE name = 'Tirzepatide 15mg'
UNION ALL
SELECT id, '15mg Vial', 15, 8500.00, 50 FROM products WHERE name = 'Tirzepatide 15mg'
UNION ALL
SELECT id, '30mg Vial', 30, 15000.00, 50 FROM products WHERE name = 'Tirzepatide 30mg';

-- Insert payment methods (update with your actual details)
INSERT INTO payment_methods (id, name, account_number, account_name, qr_code_url, active, sort_order) VALUES
('gcash', 'GCash', '0949 505 ****', 'Renalyn De Vera', '/qr-codes/gcash-qr.jpg', true, 1),
('maribank', 'MariBank', '****3491', 'Renalyn De Vera', '/qr-codes/maribank-qr.jpg', true, 2),
('gotyme', 'GoTyme Bank', '****2759', 'Renalyn De Vera', '/qr-codes/gotyme-qr.jpg', true, 3);

-- Insert site settings
INSERT INTO site_settings (id, value, type, description) VALUES
('site_name', 'Peptivate.ph', 'text', 'Website name'),
('site_tagline', 'Premium Peptide Solutions', 'text', 'Website tagline'),
('contact_email', 'support@peptivate.ph', 'email', 'Contact email'),
('contact_phone', '+63-XXX-XXX-XXXX', 'text', 'Contact phone number'),
('min_order_amount', '1000.00', 'number', 'Minimum order amount'),
('free_shipping_threshold', '10000.00', 'number', 'Free shipping threshold');
```

### **2. Create COA Table**

```sql
-- Create COA (Certificate of Analysis) table
CREATE TABLE IF NOT EXISTS coa_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  batch TEXT,
  test_date DATE NOT NULL,
  purity_percentage DECIMAL(5,3) NOT NULL,
  quantity TEXT NOT NULL,
  task_number TEXT NOT NULL,
  verification_key TEXT NOT NULL,
  image_url TEXT NOT NULL,
  featured BOOLEAN DEFAULT false,
  manufacturer TEXT DEFAULT 'Peptivate.ph',
  laboratory TEXT DEFAULT 'Janoshik Analytical',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_coa_reports_product_name ON coa_reports(product_name);
CREATE INDEX IF NOT EXISTS idx_coa_reports_featured ON coa_reports(featured);

-- Add trigger
CREATE TRIGGER update_coa_reports_updated_at BEFORE UPDATE ON coa_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert your 2 existing COA reports
INSERT INTO coa_reports (
  product_name, batch, test_date, purity_percentage,
  quantity, task_number, verification_key, image_url, featured
) VALUES
('Tirzepatide 15mg', 'Unknown', '2025-06-20', 99.658, '16.80 mg', '#68396', '9AUYT3EZV9Y9', '/coa/tirzepatide-15mg-coa.jpg', true),
('Tirzepatide 30mg', 'Unknown', '2025-06-19', 99.683, '31.21 mg', '#68397', 'ZW6YWJ55MXK9', '/coa/tirzepatide-30mg-coa.jpg', true);
```

---

## 📁 **File Setup Required**

### **1. Save QR Code Images**

Save your payment QR codes to:
```
/Users/ynadonaire/Desktop/putangina-gumana-ka-na/public/qr-codes/gcash-qr.jpg
/Users/ynadonaire/Desktop/putangina-gumana-ka-na/public/qr-codes/maribank-qr.jpg
/Users/ynadonaire/Desktop/putangina-gumana-ka-na/public/qr-codes/gotyme-qr.jpg
```

### **2. Save COA Lab Report Images**

Save your Janoshik test reports to:
```
/Users/ynadonaire/Desktop/putangina-gumana-ka-na/public/coa/tirzepatide-15mg-coa.jpg
/Users/ynadonaire/Desktop/putangina-gumana-ka-na/public/coa/tirzepatide-30mg-coa.jpg
```

---

## 🚀 **Launch Checklist**

- [ ] **Run SQL Script 1** (Create tables & add products)
- [ ] **Run SQL Script 2** (Create COA table)
- [ ] **Save QR codes** (3 payment methods)
- [ ] **Save COA images** (2 lab reports)
- [ ] **Create .env file** with Supabase credentials
- [ ] **Run `npm run dev`** to test
- [ ] **Test all pages**: Home, /coa, /admin
- [ ] **Replace logo.jpg** with your actual logo
- [ ] **Update Facebook Messenger** (already set to renalyndv)

---

## 🌐 **Your Site Structure**

### **Customer Pages:**
- **/** - Homepage with products
- **/coa** - Lab reports & certificates
- **Cart** - Shopping cart
- **Checkout** - Send orders via Messenger

### **Admin Pages:**
- **/admin** - Admin dashboard
  - Password: `Peptivate@Admin!2025`
  - Manage Products
  - Manage Categories
  - Payment Methods
  - **Lab Reports (COA)** ← NEW!
  - Site Settings

---

## 💳 **Payment Methods**

Customers can pay via:
1. **GCash** - Renalyn De Vera (0949 505 ****)
2. **MariBank** - Renalyn De Vera (****3491)  
3. **GoTyme Bank** - Renalyn De Vera (****2759)

All show QR codes at checkout!

---

## 📦 **Your 9 Products**

1. Tirzepatide 15mg - ₱8,500
2. Tirzepatide 30mg - ₱15,000
3. NAD+ 500mg - ₱3,500
4. Cagrilintide 5mg - ₱6,500
5. Epithalon 10mg - ₱2,500
6. Bacteriostatic Water 10ml - ₱350
7. SS-31 10mg - ₱4,500
8. KPV 10mg - ₱2,800
9. GHK-Cu 50mg - ₱3,200

---

## 🎯 **Key Features**

### **Aesthetic Cute Design:**
- ✨ Soft sky blue & white color scheme
- 💙 Rounded corners everywhere
- 🌟 Glow effects and cute shadows
- 💗 Pink heart animations
- ✨ Sparkle accents
- 🎨 Gradient backgrounds

### **Customer Features:**
- ✅ Product catalog with categories
- ✅ Shopping cart
- ✅ Messenger checkout
- ✅ Lab report verification page
- ✅ Responsive mobile design

### **Admin Features:**
- ✅ Product management
- ✅ Category management
- ✅ Payment method configuration
- ✅ **COA/Lab report management** (NEW!)
- ✅ Site settings

---

## 📱 **Social Media Integration**

All orders and messages go to:
**Facebook**: https://www.facebook.com/renalyndv

---

## 🎨 **Customization**

### **Colors:**
Edit `tailwind.config.js` for theme colors

### **Content:**
Use Admin Dashboard to manage:
- Products
- Lab reports
- Categories
- Payment methods

---

## ⚠️ **Important Notes**

### **Disclaimer Added:**
Homepage shows:
> "RESEARCH USE ONLY: ALWAYS CONSULT A LICENSED HEALTHCARE PROFESSIONAL FOR PERSONALISED MEDICAL GUIDANCE"

### **Security:**
- Admin password: `TopNotch2026`
- Change password in code if needed

---

## 🆘 **Support**

If you need help:
1. Check `COA_SETUP.md` for COA page details
2. Check `TRANSFORMATION_SUMMARY.md` for all changes
3. All code is well-commented

---

## ✅ **You're All Set!**

Your cute & aesthetic Peptivate.ph platform is ready to launch! 🎉💙✨

**Just complete the checklist above and you're good to go!** 🚀


# Peptivate.ph - Premium Peptide E-commerce Platform

A modern, professional e-commerce platform for selling research-grade peptides. Built with React, TypeScript, Vite, and Supabase.

## 🎨 Design Theme

- **Primary Colors:** Dark Blue (#2563eb), Light Blue (#60a5fa), and White (#ffffff)
- **Accent Colors:** Indigo (#6366f1) and Sky Blue (#0ea5e9)
- **Typography:** Inter font family for clean, professional look
- **Style:** Professional medical/pharmaceutical aesthetic with corporate blue theme

## 🧪 Features

### Customer Features
- 🔬 **Product Catalog** - Browse research-grade peptides by category
- 📊 **Scientific Details** - View purity percentage, molecular weight, CAS number, and sequence
- 🛒 **Shopping Cart** - Add products with different sizes/variations
- 🔍 **Search & Filter** - Find products by name, description, or CAS number
- 💰 **Discount Pricing** - Support for promotional pricing
- 📦 **Checkout System** - Secure checkout with research use agreement
- 💳 **Multiple Payment Methods** - Flexible payment options
- 📱 **Responsive Design** - Works on all devices

### Product Categories
- Research Peptides
- Cosmetic Peptides
- Performance Enhancement
- Healing & Recovery
- Cognitive Enhancement

### Admin Dashboard (`/admin`)
- 📝 **Product Management** - Full CRUD operations for peptides
- 🏷️ **Category Management** - Organize products
- 💳 **Payment Methods** - Configure payment options
- ⚙️ **Site Settings** - Customize site information
- 📊 **Dashboard Analytics** - View product statistics
- 🔐 **Secure Access** - Password protected (default: `Peptide@Admin!2025`)

## 🗄️ Database Schema

### Products Table
```sql
- id (UUID, Primary Key)
- name (TEXT) - Product name
- description (TEXT) - Detailed description
- category (TEXT) - Product category
- base_price (DECIMAL) - Regular price
- discount_price (DECIMAL) - Sale price
- discount_active (BOOLEAN) - Discount status
- purity_percentage (DECIMAL) - Purity level
- molecular_weight (TEXT) - Chemical property
- cas_number (TEXT) - Chemical registry number
- sequence (TEXT) - Amino acid sequence
- storage_conditions (TEXT) - Storage requirements
- stock_quantity (INTEGER) - Inventory level
- available (BOOLEAN) - Availability status
- featured (BOOLEAN) - Featured product flag
- image_url (TEXT) - Product image
- safety_sheet_url (TEXT) - Safety documentation
```

### Product Variations Table
```sql
- id (UUID, Primary Key)
- product_id (UUID, Foreign Key)
- name (TEXT) - Variation name (e.g., "5mg", "10mg")
- quantity_mg (DECIMAL) - Quantity in milligrams
- price (DECIMAL) - Variation price
- stock_quantity (INTEGER) - Stock level
```

### Categories Table
```sql
- id (TEXT, Primary Key)
- name (TEXT) - Category name
- icon (TEXT) - Lucide icon name
- sort_order (INTEGER) - Display order
- active (BOOLEAN) - Visibility status
```

### Payment Methods Table
```sql
- id (TEXT, Primary Key)
- name (TEXT) - Payment method name
- account_number (TEXT) - Account details
- account_name (TEXT) - Account holder
- qr_code_url (TEXT) - QR code for payment
- active (BOOLEAN) - Enabled status
- sort_order (INTEGER) - Display order
```

### Site Settings Table
```sql
- id (TEXT, Primary Key)
- value (TEXT) - Setting value
- type (TEXT) - Data type
- description (TEXT) - Setting description
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account

### Installation

1. **Clone the repository**
   ```bash
   cd template-web-1-6
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Run database migrations**
   
   Apply the migration file in `supabase/migrations/20250110000000_convert_to_peptide_business.sql` to your Supabase project.

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Access the application**
   - Frontend: `http://localhost:5173`
   - Admin Panel: `http://localhost:5173/admin`

## 📁 Project Structure

```
src/
├── components/          # React components
│   ├── Header.tsx       # Navigation header
│   ├── Hero.tsx         # Landing page hero
│   ├── SubNav.tsx       # Category navigation
│   ├── Menu.tsx         # Product listing
│   ├── MenuItemCard.tsx # Product card component
│   ├── Cart.tsx         # Shopping cart
│   ├── Checkout.tsx     # Checkout process
│   ├── AdminDashboard.tsx # Admin interface
│   ├── CategoryManager.tsx
│   ├── PaymentMethodManager.tsx
│   └── SiteSettingsManager.tsx
├── hooks/               # Custom React hooks
│   ├── useCart.ts       # Cart state management
│   ├── useMenu.ts       # Product data fetching
│   ├── useCategories.ts # Category management
│   ├── usePaymentMethods.ts
│   └── useSiteSettings.ts
├── types/               # TypeScript type definitions
│   └── index.ts
├── lib/                 # External services
│   └── supabase.ts      # Supabase client
├── App.tsx              # Main application
├── main.tsx             # Application entry
└── index.css            # Global styles

supabase/
└── migrations/          # Database migrations
    └── 20250110000000_convert_to_peptide_business.sql
```

## 🎯 Key Changes from Original

### From Cafe Business → Peptide Business

1. **Database Schema**
   - `menu_items` → `products`
   - Removed: `variations` (food sizes), `add_ons` (toppings)
   - Added: peptide-specific fields (purity, molecular weight, CAS, sequence)
   - Added: `product_variations` for different sizes (mg quantities)

2. **UI/UX Changes**
   - Color theme: Red/Cream → Blue/White
   - Icons: Coffee/Food → Beaker/Flask (scientific)
   - Terminology: "Menu" → "Products", "Order" → "Research Purchase"
   - Added research use disclaimers and safety information

3. **Product Display**
   - Scientific properties prominently displayed
   - Purity badges and certifications
   - Chemical information (MW, CAS, Sequence)
   - Storage requirements

4. **Checkout Process**
   - Research use agreement requirement
   - Shipping address (vs dine-in/pickup/delivery)
   - Temperature-controlled shipping note
   - Legal disclaimers

## ⚙️ Configuration

### Admin Access
- URL: `/admin`
- Default Password: `Peptide@Admin!2025`
- Change password in: `src/components/AdminDashboard.tsx` (line 235)

### Site Settings (Configurable in Admin)
- Site Name
- Tagline
- Contact Information
- Minimum Order Amount
- Free Shipping Threshold
- Legal Disclaimer

### Adding Sample Data

The migration includes 10 sample peptides:
- BPC-157
- TB-500
- Ipamorelin
- CJC-1295
- Melanotan II
- GHK-Cu
- Semax
- Selank
- PT-141
- Epithalon

## 🛡️ Legal Compliance

⚠️ **IMPORTANT DISCLAIMERS:**

This platform includes built-in disclaimers stating:
- "All peptides are sold for research purposes only"
- "Not for human consumption"
- Checkout requires explicit research use agreement

**Ensure compliance with your local laws and regulations regarding peptide sales.**

## 🔒 Security

- Password-protected admin panel
- Environment variables for sensitive data
- Row Level Security (RLS) should be configured in Supabase
- Input validation on all forms
- Secure payment processing

## 📱 Responsive Design

Fully responsive design with breakpoints:
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

## 🎨 Customization

### Colors
Edit `tailwind.config.js` and `src/index.css` to change the color scheme.

### Categories
Modify categories in the database or via Admin Dashboard.

### Payment Methods
Configure payment options via Admin Dashboard `/admin`.

## 🚢 Deployment

### Vercel (Recommended)
```bash
npm run build
# Deploy the dist/ folder to Vercel
```

Configuration file included: `vercel.json`

### Other Platforms
Build the production bundle:
```bash
npm run build
```
Deploy the `dist/` folder to your hosting provider.

## 🐛 Troubleshooting

### Database Connection Issues
- Verify `.env` variables are correct
- Check Supabase project is active
- Ensure migrations are applied

### Build Errors
```bash
npm run lint  # Check for code issues
npm install   # Reinstall dependencies
```

### Admin Access Issues
- Clear browser localStorage
- Verify password in `AdminDashboard.tsx`

## 📄 License

This project is proprietary. All rights reserved.

## 🤝 Support

For technical support or questions:
- Email: info@premiumpeptides.com
- Documentation: See inline code comments

## 🔄 Updates & Maintenance

- Regular security updates recommended
- Keep dependencies updated: `npm update`
- Monitor Supabase usage and limits
- Backup database regularly

---

**Version:** 2.0.0  
**Last Updated:** January 10, 2025  
**Framework:** React 18 + TypeScript + Vite + Supabase  
**Theme:** Blue & White Professional Medical Aesthetic
# MyPeptideJourney
# kaedra
# Kaedraa2
# kaedraa4
# peptide-kaedra
# putangina-gumana-ka-na
# peptivate
# HP-GLOW
# peptalkph
# peptologyPh
# biopeptideph

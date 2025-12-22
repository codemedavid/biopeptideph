import React, { useState } from 'react';
import { Plus, Edit, Trash2, Save, X, ArrowLeft, Package, CreditCard, Sparkles, Layers, Shield, RefreshCw, Warehouse, ShoppingCart, MapPin, Check, ClipboardList, FileText } from 'lucide-react';
import type { Product } from '../types';
import { useMenu } from '../hooks/useMenu';
import { useCategories } from '../hooks/useCategories';
import ImageUpload from './ImageUpload';
import CategoryManager from './CategoryManager';
import PaymentMethodManager from './PaymentMethodManager';
import VariationManager from './VariationManager';
import PeptideInventoryManager from './PeptideInventoryManager';
import OrdersManager from './OrdersManager';
import ShippingManager from './ShippingManager';
import JourneyManager from './admin/JourneyManager';
import AssessmentManager from './admin/AssessmentManager';
import SmartGuideManager from './admin/SmartGuideManager';


const AdminDashboard: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('peptide_admin_auth') === 'true';
  });
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const { products, loading, addProduct, updateProduct, deleteProduct, refreshProducts } = useMenu();
  const { categories } = useCategories();
  const [currentView, setCurrentView] = useState<'dashboard' | 'products' | 'add' | 'edit' | 'categories' | 'payments' | 'inventory' | 'orders' | 'shipping' | 'journey' | 'assessment' | 'guides'>('dashboard');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [managingVariationsProductId, setManagingVariationsProductId] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);


  const variationManagerProduct = managingVariationsProductId
    ? products.find((product) => product.id === managingVariationsProductId) || null
    : null;

  const variationManagerModal = variationManagerProduct ? (
    <VariationManager
      product={variationManagerProduct}
      onClose={() => setManagingVariationsProductId(null)}
    />
  ) : null;

  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    description: '',
    base_price: 0,
    category: 'research',
    featured: false,
    available: true,
    purity_percentage: 99.0,
    molecular_weight: '',
    cas_number: '',
    sequence: '',
    storage_conditions: 'Store at -20°C',
    stock_quantity: 0,
    image_url: null,
    discount_active: false,
    inclusions: null
  });

  const handleAddProduct = () => {
    setCurrentView('add');
    setSelectedProducts(new Set());
    setManagingVariationsProductId(null);
    const defaultCategory = categories.length > 0 ? categories[0].id : 'research';
    setFormData({
      name: '',
      description: '',
      base_price: 0,
      category: defaultCategory,
      featured: false,
      available: true,
      purity_percentage: 99.0,
      molecular_weight: '',
      cas_number: '',
      sequence: '',
      storage_conditions: 'Store at -20°C',
      stock_quantity: 0,
      image_url: null,
      discount_active: false,
      inclusions: null
    });
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setFormData(product);
    setCurrentView('edit');
    setSelectedProducts(new Set());
    setManagingVariationsProductId(null);
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
      setManagingVariationsProductId(null);
      try {
        setIsProcessing(true);
        const result = await deleteProduct(id);
        if (!result.success) {
          alert(result.error || 'Failed to delete product');
        }
      } catch (error) {
        alert('Failed to delete product. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedProducts.size === 0) {
      alert('Please select products to delete');
      return;
    }

    if (confirm(`Are you sure you want to delete ${selectedProducts.size} product(s)? This action cannot be undone.`)) {
      try {
        setIsProcessing(true);
        let successCount = 0;
        let failedCount = 0;

        for (const productId of selectedProducts) {
          const result = await deleteProduct(productId);
          if (result.success) {
            successCount++;
          } else {
            failedCount++;
          }
        }

        if (failedCount > 0) {
          alert(`Deleted ${successCount} product(s). ${failedCount} failed.`);
        } else {
          alert(`Successfully deleted ${successCount} product(s)`);
        }

        setSelectedProducts(new Set());
        setManagingVariationsProductId(null);
      } catch (error) {
        alert('Failed to delete products. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const toggleSelectProduct = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
      setManagingVariationsProductId(null);
    } else {
      setSelectedProducts(new Set(products.map(p => p.id)));
    }
  };

  const handleSaveProduct = async () => {
    if (!formData.name || !formData.description || !formData.base_price) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setIsProcessing(true);

      // Prepare data for saving - convert undefined to null for nullable fields
      const prepareData = (data: Partial<Product>) => {
        const prepared = { ...data };
        // Convert undefined to null for nullable fields
        if (prepared.image_url === undefined) prepared.image_url = null;
        if (prepared.safety_sheet_url === undefined) prepared.safety_sheet_url = null;
        if (prepared.discount_price === undefined) prepared.discount_price = null;
        if (prepared.molecular_weight === undefined) prepared.molecular_weight = null;
        if (prepared.cas_number === undefined) prepared.cas_number = null;
        if (prepared.sequence === undefined) prepared.sequence = null;
        if (prepared.inclusions === undefined) prepared.inclusions = null;
        return prepared;
      };

      // Only send columns that actually exist in the `products` table
      const pickProductDbFields = (data: Partial<Product>) => {
        const allowedKeys: (keyof Product)[] = [
          'name',
          'description',
          'category',
          'base_price',
          'national_price',
          'international_price',
          'discount_price',
          'discount_active',
          'purity_percentage',
          'molecular_weight',
          'cas_number',
          'sequence',
          'storage_conditions',
          'stock_quantity',
          'available',
          'featured',
          'image_url',
          'safety_sheet_url',
        ];

        const dbPayload: Partial<Product> = {};
        for (const key of allowedKeys) {
          if (key in data) {
            // @ts-expect-error index by key
            dbPayload[key] = data[key];
          }
        }
        return dbPayload;
      };

      if (editingProduct) {
        // Remove read-only fields and relations before updating
        const { id, created_at, updated_at, variations, ...updateData } = formData as Product;

        // EXPLICITLY ensure image_url is included (even if it's null/undefined)
        // Get image_url directly from formData to ensure we have the latest value
        const imageUrlValue = formData.image_url !== undefined ? formData.image_url : null;

        // Create update payload - ensure image_url is always included
        const updatePayload: any = {
          ...updateData,
        };

        // ALWAYS explicitly set image_url, even if it's null
        updatePayload.image_url = imageUrlValue;

        const preparedData = prepareData(updatePayload);

        // Triple-check: Force image_url to be in the payload
        preparedData.image_url = imageUrlValue;

        // Strip out any fields that don't exist on the products table
        const dbPayload = pickProductDbFields(preparedData);

        // Log to verify it's included
        console.log('🔍 Final payload check:', {
          has_image_url: 'image_url' in dbPayload,
          image_url_value: dbPayload.image_url,
          image_url_type: typeof dbPayload.image_url,
          all_keys: Object.keys(dbPayload)
        });

        console.log('💾 Saving product update:', {
          id: editingProduct.id,
          image_url: dbPayload.image_url,
          image_url_type: typeof dbPayload.image_url,
          image_url_length: dbPayload.image_url?.length || 0,
          fullPayload: dbPayload
        });

        const result = await updateProduct(editingProduct.id, dbPayload);
        if (!result.success) {
          console.error('❌ Update failed:', result.error);
          throw new Error(result.error || 'Failed to update product');
        }

        // Verify the image was saved
        if (result.data && result.data.image_url !== preparedData.image_url) {
          console.warn('⚠️ Image URL mismatch after save:', {
            sent: preparedData.image_url,
            received: result.data.image_url
          });
        }

        console.log('✅ Product updated successfully', {
          saved_image_url: result.data?.image_url
        });
      } else {
        // Remove non-creatable fields for new products
        const { variations, ...createData } = formData as any;

        // EXPLICITLY ensure image_url is included
        const createPayload = {
          ...createData,
          image_url: formData.image_url !== undefined ? formData.image_url : null,
        };

        const preparedData = prepareData(createPayload);

        // Strip out any fields that don't exist on the products table for insert
        const dbPayload = pickProductDbFields(preparedData);
        console.log('💾 Creating new product:', {
          name: dbPayload.name,
          image_url: dbPayload.image_url,
          fullPayload: dbPayload
        });

        const result = await addProduct(dbPayload as Omit<Product, 'id' | 'created_at' | 'updated_at'>);
        if (!result.success) {
          throw new Error(result.error);
        }
        console.log('✅ Product created successfully');
      }

      // Refresh products to ensure UI is updated
      console.log('🔄 Refreshing products after save...');
      await refreshProducts();
      console.log('✅ Products refreshed');

      // If we were editing, verify the image was saved
      if (editingProduct && formData.image_url) {
        console.log('🔍 Verifying saved image URL:', formData.image_url);
        // The refresh should have updated the products list with the new image
      }

      setCurrentView('products');
      setEditingProduct(null);
      setManagingVariationsProductId(null);
    } catch (error) {
      console.error('❌ Error saving product:', error);
      alert(`Failed to save product: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setCurrentView(currentView === 'add' || currentView === 'edit' ? 'products' : 'dashboard');
    setEditingProduct(null);
    setManagingVariationsProductId(null);
  };

  // Dashboard Stats
  const totalProducts = products.length;
  const featuredProducts = products.filter(p => p.featured).length;
  const availableProducts = products.filter(p => p.available).length;


  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'Peptology@Admin!2025') {
      setIsAuthenticated(true);
      localStorage.setItem('peptide_admin_auth', 'true');
      setLoginError('');
    } else {
      setLoginError('Invalid password');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('peptide_admin_auth');
    setPassword('');
    setCurrentView('dashboard');
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshProducts();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-theme-bg flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-soft p-6 md:p-8 w-full max-w-md border border-gray-200">
          <div className="text-center mb-6">
            <div className="relative mx-auto w-16 h-16 rounded-full overflow-hidden mb-4 border-2 border-theme-accent/30">
              <img
                src="/logo.jpeg"
                alt="peptology.ph"
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-2xl font-bold text-theme-text mb-1">Admin Access</h1>
            <p className="text-sm text-gray-500">
              Enter password to continue
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme-accent focus:border-theme-accent transition-colors"
                placeholder="Enter admin password"
                required
              />
              {loginError && (
                <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                  ❌ {loginError}
                </p>
              )}
            </div>

            <button type="submit" className="w-full bg-theme-accent hover:bg-theme-accent/90 text-white py-3 rounded-lg font-semibold transition-all">
              Access Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-bg flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-theme-accent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // Form View (Add/Edit)
  if (currentView === 'add' || currentView === 'edit') {
    return (
      <>

        {variationManagerModal}
        <div className="min-h-screen bg-theme-bg">
          <div className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center space-x-4">
                  <button
                    onClick={handleCancel}
                    className="text-gray-600 hover:text-theme-accent transition-colors flex items-center gap-2 group"
                  >
                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-medium">Back</span>
                  </button>
                  <div className="h-6 w-px bg-gray-200"></div>
                  <h1 className="text-lg font-bold text-theme-text">
                    {currentView === 'add' ? 'Add New Product' : 'Edit Product'}
                  </h1>
                </div>
                <div className="flex space-x-3">
                  <button onClick={handleCancel} className="px-4 py-2 border border-gray-300 hover:border-gray-400 rounded-lg hover:bg-gray-50 transition-all text-sm font-medium text-gray-700">
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProduct}
                    disabled={isProcessing}
                    className="bg-theme-accent hover:bg-theme-accent/90 text-white px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {isProcessing ? 'Saving...' : 'Save Product'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="bg-white rounded-xl shadow-soft p-6 space-y-8 border border-gray-100">
              {/* Basic Information */}
              <div>
                <h3 className="text-base font-bold text-theme-text mb-4 flex items-center gap-2">
                  <div className="w-1 h-5 bg-theme-secondary rounded-full"></div>
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Product Name *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input-field text-sm"
                      placeholder="e.g., BPC-157 5mg"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Description *</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="input-field text-sm"
                      placeholder="Detailed product description..."
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Category *</label>
                    <select
                      value={formData.category || ''}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="input-field text-sm"
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Pricing Section - National & International */}
                  <div className="md:col-span-2 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-3 md:p-4 border border-blue-200">
                    <h4 className="text-xs md:text-sm font-bold text-gray-800 mb-2 md:mb-3 flex items-center gap-2">
                      💰 Product Pricing (Multi-Currency)
                    </h4>

                    {/* Base Price - Full Width */}
                    <div className="mb-3">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Base Price (₱) *</label>
                      <input
                        type="number"
                        step="1"
                        value={formData.base_price || ''}
                        onChange={(e) => setFormData({ ...formData, base_price: Number(e.target.value) })}
                        className="input-field text-sm"
                        placeholder="0"
                      />
                      <p className="text-[10px] text-gray-500 mt-0.5">Fallback price</p>
                    </div>

                    {/* National & International - Side by Side */}
                    <div className="grid grid-cols-2 gap-2 md:gap-3">
                      <div className="bg-green-50/50 rounded-lg p-2 border border-green-100">
                        <label className="block text-[10px] md:text-xs font-semibold text-green-700 mb-1">
                          🇵🇭 National (PHP) *
                        </label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-green-600 font-bold text-sm">₱</span>
                          <input
                            type="number"
                            step="1"
                            value={formData.national_price || ''}
                            onChange={(e) => setFormData({ ...formData, national_price: Number(e.target.value) || null })}
                            className="input-field text-sm pl-6 border-green-200 focus:border-green-500 focus:ring-green-500"
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <div className="bg-blue-50/50 rounded-lg p-2 border border-blue-100">
                        <label className="block text-[10px] md:text-xs font-semibold text-blue-700 mb-1">
                          🌎 International (USD) *
                        </label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-blue-600 font-bold text-sm">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.international_price || ''}
                            onChange={(e) => setFormData({ ...formData, international_price: Number(e.target.value) || null })}
                            className="input-field text-sm pl-6 border-blue-200 focus:border-blue-500 focus:ring-blue-500"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>

                    {editingProduct && editingProduct.variations && editingProduct.variations.length > 0 && (
                      <p className="text-[10px] md:text-xs text-orange-600 mt-2 flex items-start gap-1 bg-orange-50 p-2 rounded border border-orange-200">
                        <span>⚠️</span>
                        <span>Has <strong>{editingProduct.variations.length} variation(s)</strong> - use "Manage Sizes" for those prices.</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Scientific Details */}
              <div>
                <h3 className="text-sm md:text-base font-bold text-gray-900 mb-2 md:mb-3 flex items-center gap-1.5">
                  <span className="text-base md:text-lg">🧪</span>
                  Scientific Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Purity (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.purity_percentage || ''}
                      onChange={(e) => setFormData({ ...formData, purity_percentage: Number(e.target.value) })}
                      className="input-field text-sm"
                      placeholder="99.0"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Molecular Weight</label>
                    <input
                      type="text"
                      value={formData.molecular_weight || ''}
                      onChange={(e) => setFormData({ ...formData, molecular_weight: e.target.value })}
                      className="input-field text-sm"
                      placeholder="e.g., 1419.55 g/mol"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">CAS Number</label>
                    <input
                      type="text"
                      value={formData.cas_number || ''}
                      onChange={(e) => setFormData({ ...formData, cas_number: e.target.value })}
                      className="input-field text-sm"
                      placeholder="e.g., 137525-51-0"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Storage Conditions</label>
                    <input
                      type="text"
                      value={formData.storage_conditions || ''}
                      onChange={(e) => setFormData({ ...formData, storage_conditions: e.target.value })}
                      className="input-field text-sm"
                      placeholder="Store at -20°C"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Sequence</label>
                    <input
                      type="text"
                      value={formData.sequence || ''}
                      onChange={(e) => setFormData({ ...formData, sequence: e.target.value })}
                      className="input-field text-sm"
                      placeholder="e.g., GEPPPGKPADDAGLV"
                    />
                  </div>
                </div>
              </div>

              {/* Complete Set Inclusions */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Package className="w-4 h-4 text-theme-secondary" />
                    Complete Set Inclusions
                  </h3>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.inclusions !== null && formData.inclusions !== undefined}
                      onChange={(e) => {
                        if (!e.target.checked) {
                          setFormData({ ...formData, inclusions: null });
                        } else {
                          setFormData({ ...formData, inclusions: formData.inclusions || [] });
                        }
                      }}
                      className="w-4 h-4 text-theme-accent rounded focus:ring-theme-accent"
                    />
                    <span className="text-sm font-medium text-gray-700">This is a SET product</span>
                  </label>
                </div>
                {formData.inclusions !== null && formData.inclusions !== undefined ? (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      What's included in this set? (One item per line)
                    </label>
                    <textarea
                      value={formData.inclusions?.join('\n') || ''}
                      onChange={(e) => {
                        const items = e.target.value.split('\n').filter(item => item.trim() !== '');
                        setFormData({ ...formData, inclusions: items.length > 0 ? items : null });
                      }}
                      className="input-field text-sm min-h-[80px]"
                      placeholder="Example:&#10;Syringe for Reconstitution&#10;6 Insulin Syringes (7pcs for 30mg)&#10;10pcs Alcohol Pads&#10;Tirzepatide Printed Guide&#10;Transparent vial case and vial cap&#10;Peptide Injection and Inventory Spreadsheet tracker"
                      rows={6}
                    />
                    <p className="text-xs text-gray-500 mt-2 flex items-start gap-1.5">
                      <span className="text-theme-secondary font-bold">💡</span>
                      <span>Enter each item on a new line. These will be displayed as a checklist on the product detail page. Check "This is a SET product" above to enable this feature.</span>
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500 mb-2">Enable "This is a SET product" to add inclusions</p>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, inclusions: [] })}
                      className="text-sm text-theme-accent hover:text-theme-text font-medium"
                    >
                      Enable SET feature
                    </button>
                  </div>
                )}
              </div>

              {/* Inventory */}
              <div>
                <h3 className="text-sm md:text-base font-bold text-gray-900 mb-2 md:mb-3 flex items-center gap-1.5">
                  <span className="text-base md:text-lg">📦</span>
                  Inventory & Availability
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Stock Quantity</label>
                    <input
                      type="number"
                      value={formData.stock_quantity || ''}
                      onChange={(e) => setFormData({ ...formData, stock_quantity: Number(e.target.value) })}
                      className="input-field text-sm"
                      placeholder="0"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 pt-0 sm:pt-6">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.featured || false}
                        onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                        className="w-4 h-4 text-theme-secondary rounded focus:ring-theme-secondary"
                      />
                      <span className="text-xs font-semibold text-gray-700">⭐ Featured</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.available ?? true}
                        onChange={(e) => setFormData({ ...formData, available: e.target.checked })}
                        className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                      />
                      <span className="text-xs font-semibold text-gray-700">✅ Available</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Discount */}
              <div>
                <h3 className="text-sm md:text-base font-bold text-gray-900 mb-2 md:mb-3 flex items-center gap-1.5">
                  <span className="text-base md:text-lg">💰</span>
                  Discount Pricing
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Discount Price (₱)</label>
                    <input
                      type="number"
                      step="1"
                      value={formData.discount_price || ''}
                      onChange={(e) => setFormData({ ...formData, discount_price: Number(e.target.value) || null })}
                      className="input-field text-sm"
                      placeholder="0"
                    />
                  </div>

                  <div className="flex items-center pt-0 md:pt-6">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.discount_active || false}
                        onChange={(e) => setFormData({ ...formData, discount_active: e.target.checked })}
                        className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                      />
                      <span className="text-xs font-semibold text-gray-700">🏷️ Enable Discount</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Product Image */}
              <div>
                <h3 className="text-sm md:text-base font-bold text-gray-900 mb-2 md:mb-3 flex items-center gap-1.5">
                  <span className="text-base md:text-lg">🖼️</span>
                  Product Image
                </h3>
                <p className="text-xs text-gray-500 mb-2">
                  Upload a product image (optional). This will appear on the customer-facing site.
                </p>
                <ImageUpload
                  currentImage={formData.image_url || undefined}
                  onImageChange={(imageUrl) => {
                    // Normalize value: undefined/null → null, non-empty string → trimmed URL
                    let newImageUrl: string | null = null;
                    if (imageUrl) {
                      const trimmed = imageUrl.trim();
                      newImageUrl = trimmed === '' ? null : trimmed;
                    }

                    setFormData((prev) => ({
                      ...prev,
                      image_url: newImageUrl,
                    }));

                    console.log('🖼️ Product image updated in formData:', {
                      original: imageUrl,
                      saved: newImageUrl,
                    });
                  }}
                />
              </div>

            </div>
          </div>
        </div>
      </>
    );
  }

  // Products List View
  if (currentView === 'products') {
    return (
      <>
        {variationManagerModal}
        <div className="min-h-screen bg-theme-bg">
          <div className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => setCurrentView('dashboard')}
                    className="text-gray-600 hover:text-theme-accent transition-colors flex items-center gap-2 group"
                  >
                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-medium">Dashboard</span>
                  </button>
                  <div className="h-6 w-px bg-gray-200"></div>
                  <h1 className="text-lg font-bold text-theme-text">Products</h1>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="p-2 text-gray-500 hover:text-theme-accent hover:bg-gray-50 rounded-lg transition-all"
                    title="Refresh data"
                  >
                    <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                  {selectedProducts.size > 0 && (
                    <button
                      onClick={handleBulkDelete}
                      disabled={isProcessing}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Delete ({selectedProducts.size})</span>
                      <span className="sm:hidden">Delete</span>
                    </button>
                  )}
                  <button
                    onClick={handleAddProduct}
                    className="bg-theme-accent hover:bg-theme-accent/90 text-white px-2 md:px-3 py-1 rounded-md font-medium text-xs shadow-sm hover:shadow transition-all flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span className="hidden sm:inline">Add New</span>
                    <span className="sm:hidden">Add</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 md:py-4">
            {/* Selection Info Banner */}
            {selectedProducts.size > 0 && (
              <div className="mb-3 bg-theme-accent/10 border border-theme-accent/20 rounded-lg p-2 md:p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs md:text-sm font-semibold text-gray-900">
                    {selectedProducts.size} product{selectedProducts.size !== 1 ? 's' : ''} selected
                  </span>
                </div>
                <button
                  onClick={() => setSelectedProducts(new Set())}
                  className="text-xs text-theme-accent hover:text-theme-accent/80 font-medium underline"
                >
                  Clear Selection
                </button>
              </div>
            )}

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {products.map((product) => (
                <div key={product.id} className="bg-white rounded-xl shadow-lg border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(product.id)}
                        onChange={() => toggleSelectProduct(product.id)}
                        className="mt-0.5 w-4 h-4 text-theme-accent rounded focus:ring-theme-accent cursor-pointer shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 truncate">{product.name}</h3>
                        <p className="text-xs text-gray-500 line-clamp-2">{product.description}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('🟣 Layers button clicked (mobile) for:', product.name);
                          setManagingVariationsProductId(product.id);
                        }}
                        disabled={isProcessing}
                        className={`p-1.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${product.variations && product.variations.length > 0
                          ? 'bg-theme-secondary text-white hover:bg-theme-secondary/90 shadow-md cursor-pointer'
                          : 'text-theme-secondary hover:bg-theme-secondary/10 cursor-pointer'
                          }`}
                        title="Manage Sizes - Click to edit prices!"
                      >
                        <Layers className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEditProduct(product)}
                        disabled={isProcessing}
                        className="p-1.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        disabled={isProcessing}
                        className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="text-[10px] text-gray-500">Price</div>
                        <div className="text-sm font-bold text-gray-900">
                          ₱{product.base_price.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500">Stock</div>
                        <div className="text-sm font-semibold text-gray-900">{product.stock_quantity}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500">Sizes</div>
                        <div className="text-sm font-semibold text-theme-secondary">{product.variations?.length || 0}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {product.featured && (
                        <span className="text-xs">⭐</span>
                      )}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${product.available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                        {product.available ? '✅' : '❌'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block bg-white rounded-lg md:rounded-xl shadow-lg overflow-hidden border border-gray-200">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">
                        <input
                          type="checkbox"
                          checked={selectedProducts.size === products.length && products.length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 text-theme-accent rounded focus:ring-theme-accent cursor-pointer"
                          title="Select All"
                        />
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800">Product</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800 hidden lg:table-cell">Category</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800">Price</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800">Sizes</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800">Purity</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800">Stock</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800 hidden xl:table-cell">Status</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-800">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {products.map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => toggleSelectProduct(product.id)}
                            className="w-4 h-4 text-theme-accent rounded focus:ring-theme-accent cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-xs font-semibold text-gray-900">{product.name}</div>
                          <div className="text-[10px] text-gray-500 truncate max-w-xs">{product.description}</div>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600 hidden lg:table-cell">
                          {categories.find(cat => cat.id === product.category)?.name}
                        </td>
                        <td className="px-4 py-2 text-xs font-bold text-gray-900">
                          ₱{product.base_price.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          {product.variations && product.variations.length > 0 && (
                            <div className="text-[9px] text-theme-secondary font-medium mt-0.5">
                              Not used (has sizes)
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {product.variations && product.variations.length > 0 ? (
                            <div>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-theme-secondary/10 text-theme-secondary">
                                {product.variations.length} {product.variations.length === 1 ? 'size' : 'sizes'}
                              </span>
                              <div className="text-[9px] text-gray-500 mt-0.5">
                                Click <Layers className="w-2.5 h-2.5 inline text-theme-secondary" /> to edit
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-400">No sizes</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
                            {product.purity_percentage}%
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs font-medium text-gray-900">
                          {product.stock_quantity}
                        </td>
                        <td className="px-4 py-2 hidden xl:table-cell">
                          <div className="flex flex-col gap-0.5">
                            {product.featured && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-theme-secondary/10 text-theme-secondary">
                                ⭐ Featured
                              </span>
                            )}
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${product.available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                              {product.available ? '✅' : '❌'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('🟣 Layers button clicked for:', product.name);
                                setManagingVariationsProductId(product.id);
                              }}
                              disabled={isProcessing}
                              className={`p-1.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${product.variations && product.variations.length > 0
                                ? 'bg-theme-secondary text-white hover:bg-theme-secondary/90 shadow-md hover:shadow-lg cursor-pointer'
                                : 'text-theme-secondary hover:bg-theme-secondary/10 cursor-pointer'
                                }`}
                              title="Manage Sizes - Click here to edit prices!"
                            >
                              <Layers className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleEditProduct(product)}
                              disabled={isProcessing}
                              className="p-1.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(product.id)}
                              disabled={isProcessing}
                              className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Categories View
  if (currentView === 'categories') {
    return <CategoryManager onBack={() => setCurrentView('dashboard')} />;
  }

  // Payment Methods View
  if (currentView === 'payments') {
    return <PaymentMethodManager onBack={() => setCurrentView('dashboard')} />;
  }



  // Inventory View
  if (currentView === 'inventory') {
    return <PeptideInventoryManager onBack={() => setCurrentView('dashboard')} />;
  }

  // Orders View
  if (currentView === 'orders') {
    return <OrdersManager onBack={() => setCurrentView('dashboard')} />;
  }



  // Shipping View
  if (currentView === 'shipping') {
    return <ShippingManager onBack={() => setCurrentView('dashboard')} />;
  }



  // Journey Manager View
  if (currentView === 'journey') {
    return (
      <div className="min-h-screen bg-theme-bg">
        <JourneyManager onBack={() => setCurrentView('dashboard')} />
      </div>
    );
  }

  // Assessment Manager View
  if (currentView === 'assessment') {
    return (
      <div className="min-h-screen bg-gray-50">
        <AssessmentManager onBack={() => setCurrentView('dashboard')} />
      </div>
    );
  }

  // Smart Guide View
  if (currentView === 'guides') {
    return (
      <div className="min-h-screen bg-theme-bg p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <button onClick={() => setCurrentView('dashboard')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
          </div>
          <SmartGuideManager />
        </div>
      </div>
    );
  }

  // Dashboard View
  if (currentView === 'dashboard') {
    return (
      <div className="min-h-screen bg-theme-bg">
        {/* Admin Header */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-3">
                <div className="bg-theme-accent/10 p-2 rounded-lg">
                  <Shield className="w-6 h-6 text-theme-accent" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-theme-text">Admin Dashboard</h1>
                  <p className="text-xs text-gray-500">Manage your store</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => window.open('/', '_blank')}
                  className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-theme-accent transition-colors hidden md:flex"
                >
                  <ArrowLeft className="w-4 h-4" />
                  View Store
                </button>
                <div className="h-8 w-px bg-gray-200 hidden md:block"></div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                >
                  <span className="hidden md:inline">Logout</span>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            <div className="bg-white rounded-xl shadow-soft p-4 md:p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-2 md:mb-4">
                <div className="p-2 md:p-3 bg-theme-accent/10 rounded-lg">
                  <Package className="w-4 h-4 md:w-6 md:h-6 text-theme-accent" />
                </div>
                <span className="text-[10px] md:text-xs font-medium text-gray-400">Total</span>
              </div>
              <h3 className="text-lg md:text-2xl font-bold text-theme-text">{totalProducts}</h3>
              <p className="text-xs md:text-sm text-gray-500 mt-0.5 md:mt-1 truncate">Active Items</p>
            </div>

            <div className="bg-white rounded-xl shadow-soft p-4 md:p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-2 md:mb-4">
                <div className="p-2 md:p-3 bg-theme-secondary/10 rounded-lg">
                  <Sparkles className="w-4 h-4 md:w-6 md:h-6 text-theme-secondary" />
                </div>
                <span className="text-[10px] md:text-xs font-medium text-gray-400">Featured</span>
              </div>
              <h3 className="text-lg md:text-2xl font-bold text-theme-text">{featuredProducts}</h3>
              <p className="text-xs md:text-sm text-gray-500 mt-0.5 md:mt-1 truncate">Highlighted</p>
            </div>

            <div className="bg-white rounded-xl shadow-soft p-4 md:p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-2 md:mb-4">
                <div className="p-2 md:p-3 bg-green-50 rounded-lg">
                  <Check className="w-4 h-4 md:w-6 md:h-6 text-green-600" />
                </div>
                <span className="text-[10px] md:text-xs font-medium text-gray-400">Stock</span>
              </div>
              <h3 className="text-lg md:text-2xl font-bold text-theme-text">{availableProducts}</h3>
              <p className="text-xs md:text-sm text-gray-500 mt-0.5 md:mt-1 truncate">Available</p>
            </div>

            <div className="bg-white rounded-xl shadow-soft p-4 md:p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-2 md:mb-4">
                <div className="p-2 md:p-3 bg-blue-50 rounded-lg">
                  <Layers className="w-4 h-4 md:w-6 md:h-6 text-blue-600" />
                </div>
                <span className="text-[10px] md:text-xs font-medium text-gray-400">Types</span>
              </div>
              <h3 className="text-lg md:text-2xl font-bold text-theme-text">{categories.length}</h3>
              <p className="text-xs md:text-sm text-gray-500 mt-0.5 md:mt-1 truncate">Categories</p>
            </div>
          </div>

          <h2 className="text-lg font-bold text-theme-text mb-4 flex items-center gap-2">
            <span className="w-1.5 h-6 bg-theme-accent rounded-full"></span>
            Management Tools
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-8 md:mb-12">

            {/* Products Management Card */}
            <button
              onClick={() => setCurrentView('products')}
              className="bg-white p-4 md:p-6 rounded-xl shadow-soft border border-gray-100 hover:shadow-medium transition-all group text-left relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-16 h-16 md:w-24 md:h-24 bg-theme-accent/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <div className="p-2 md:p-3 bg-theme-accent/10 rounded-lg w-fit mb-3 md:mb-4 group-hover:bg-theme-accent group-hover:text-white transition-colors">
                <Package className="w-4 h-4 md:w-6 md:h-6 text-theme-accent group-hover:text-white" />
              </div>
              <h3 className="text-sm md:text-lg font-bold text-theme-text mb-1 md:mb-2 group-hover:text-theme-accent transition-colors">Products</h3>
              <p className="text-xs md:text-sm text-gray-500 line-clamp-2">Manage store inventory.</p>
            </button>

            {/* Categories Management Card */}
            <button
              onClick={() => setCurrentView('categories')}
              className="bg-white p-4 md:p-6 rounded-xl shadow-soft border border-gray-100 hover:shadow-medium transition-all group text-left relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-16 h-16 md:w-24 md:h-24 bg-theme-secondary/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <div className="p-2 md:p-3 bg-theme-secondary/10 rounded-lg w-fit mb-3 md:mb-4 group-hover:bg-theme-secondary group-hover:text-white transition-colors">
                <Layers className="w-4 h-4 md:w-6 md:h-6 text-theme-secondary group-hover:text-white" />
              </div>
              <h3 className="text-sm md:text-lg font-bold text-theme-text mb-1 md:mb-2 group-hover:text-theme-secondary transition-colors">Categories</h3>
              <p className="text-xs md:text-sm text-gray-500 line-clamp-2">Organize products.</p>
            </button>

            {/* Inventory Management Card */}
            <button
              onClick={() => setCurrentView('inventory')}
              className="bg-white p-4 md:p-6 rounded-xl shadow-soft border border-gray-100 hover:shadow-medium transition-all group text-left relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-16 h-16 md:w-24 md:h-24 bg-blue-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <div className="p-2 md:p-3 bg-blue-50 rounded-lg w-fit mb-3 md:mb-4 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                <Warehouse className="w-4 h-4 md:w-6 md:h-6 text-blue-600 group-hover:text-white" />
              </div>
              <h3 className="text-sm md:text-lg font-bold text-theme-text mb-1 md:mb-2 group-hover:text-blue-600 transition-colors">Inventory</h3>
              <p className="text-xs md:text-sm text-gray-500 line-clamp-2">Track raw materials.</p>
            </button>

            {/* Orders Management Card */}
            <button
              onClick={() => setCurrentView('orders')}
              className="bg-white p-4 md:p-6 rounded-xl shadow-soft border border-gray-100 hover:shadow-medium transition-all group text-left relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-16 h-16 md:w-24 md:h-24 bg-green-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <div className="p-2 md:p-3 bg-green-50 rounded-lg w-fit mb-3 md:mb-4 group-hover:bg-green-500 group-hover:text-white transition-colors">
                <ShoppingCart className="w-4 h-4 md:w-6 md:h-6 text-green-600 group-hover:text-white" />
              </div>
              <h3 className="text-sm md:text-lg font-bold text-theme-text mb-1 md:mb-2 group-hover:text-green-600 transition-colors">Orders</h3>
              <p className="text-xs md:text-sm text-gray-500 line-clamp-2">Manage orders.</p>
            </button>

            {/* Payment Methods Card */}
            <button
              onClick={() => setCurrentView('payments')}
              className="bg-white p-4 md:p-6 rounded-xl shadow-soft border border-gray-100 hover:shadow-medium transition-all group text-left relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-16 h-16 md:w-24 md:h-24 bg-purple-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <div className="p-2 md:p-3 bg-purple-50 rounded-lg w-fit mb-3 md:mb-4 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                <CreditCard className="w-4 h-4 md:w-6 md:h-6 text-purple-600 group-hover:text-white" />
              </div>
              <h3 className="text-sm md:text-lg font-bold text-theme-text mb-1 md:mb-2 group-hover:text-purple-600 transition-colors">Payments</h3>
              <p className="text-xs md:text-sm text-gray-500 line-clamp-2">Setup accounts.</p>
            </button>

            {/* Shipping Rates Card */}
            <button
              onClick={() => setCurrentView('shipping')}
              className="bg-white p-4 md:p-6 rounded-xl shadow-soft border border-gray-100 hover:shadow-medium transition-all group text-left relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-16 h-16 md:w-24 md:h-24 bg-orange-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <div className="p-2 md:p-3 bg-orange-50 rounded-lg w-fit mb-3 md:mb-4 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                <MapPin className="w-4 h-4 md:w-6 md:h-6 text-orange-600 group-hover:text-white" />
              </div>
              <h3 className="text-sm md:text-lg font-bold text-theme-text mb-1 md:mb-2 group-hover:text-orange-600 transition-colors">Shipping</h3>
              <p className="text-xs md:text-sm text-gray-500 line-clamp-2">Manage shipping.</p>
            </button>







            {/* Journey Manager Card */}
            <div
              onClick={() => setCurrentView('journey')}
              className="bg-white p-6 rounded-xl shadow-soft border border-gray-100 hover:shadow-lg transition-all cursor-pointer group"
            >
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 mb-4 group-hover:scale-110 transition-transform">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Journey Page</h3>
              <p className="text-sm text-gray-500">Edit content for "Our Journey"</p>
            </div>

            {/* Assessment System Card */}
            <div
              onClick={() => setCurrentView('assessment')}
              className="bg-white p-6 rounded-xl shadow-soft border border-gray-100 hover:shadow-lg transition-all cursor-pointer group"
            >
              <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center text-teal-600 mb-4 group-hover:scale-110 transition-transform">
                <ClipboardList className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Assessment System</h3>
              <p className="text-sm text-gray-500">Manage responses & rules</p>
            </div>

            {/* Smart Guide System Card */}
            <div
              onClick={() => setCurrentView('guides')}
              className="bg-white p-6 rounded-xl shadow-soft border border-gray-100 hover:shadow-lg transition-all cursor-pointer group"
            >
              <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center text-pink-600 mb-4 group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Smart Guides</h3>
              <p className="text-sm text-gray-500">Manage QR/files pages</p>
            </div>

          </div>
        </div>
      </div>
    );
  }

};

export default AdminDashboard;

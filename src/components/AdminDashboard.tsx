import React, { useState } from 'react';
import { Plus, Edit, Trash2, Save, X, ArrowLeft, Beaker, TrendingUp, Package, Users, Lock, FolderOpen, CreditCard, Sparkles, Heart, Layers, Shield, RefreshCw, Warehouse, ShoppingCart, HelpCircle, MapPin } from 'lucide-react';
import type { Product } from '../types';
import { useMenu } from '../hooks/useMenu';
import { useCategories } from '../hooks/useCategories';
import ImageUpload from './ImageUpload';
import CategoryManager from './CategoryManager';
import PaymentMethodManager from './PaymentMethodManager';
import VariationManager from './VariationManager';
import COAManager from './COAManager';
import PeptideInventoryManager from './PeptideInventoryManager';
import OrdersManager from './OrdersManager';
import FAQManager from './FAQManager';
import ShippingManager from './ShippingManager';

const AdminDashboard: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('peptide_admin_auth') === 'true';
  });
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const { products, loading, addProduct, updateProduct, deleteProduct, refreshProducts } = useMenu();
  const { categories } = useCategories();
  const [currentView, setCurrentView] = useState<'dashboard' | 'products' | 'add' | 'edit' | 'categories' | 'payments' | 'coa' | 'inventory' | 'orders' | 'faq' | 'shipping'>('dashboard');
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
  const categoryCounts = categories.map(cat => ({
    ...cat,
    count: products.filter(p => p.category === cat.id).length
  }));

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'HPGlow@Admin!2025') {
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
      <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white flex items-center justify-center px-4">
        <div className="bg-white rounded-lg md:rounded-xl shadow-lg p-4 md:p-6 w-full max-w-md border border-gold-300/30">
          <div className="text-center mb-4 md:mb-6">
            <div className="relative mx-auto w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-black to-gray-900 rounded-lg md:rounded-xl flex items-center justify-center mb-3 md:mb-4 shadow-lg overflow-hidden border-2 border-gold-500/30">
              <img
                src="/assets/logo.jpg"
                alt="peptalk.ph"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <Lock className="h-6 w-6 md:h-8 md:w-8 text-gold-500" />
              </div>
            </div>
            <h1 className="text-xl md:text-2xl font-bold mb-1.5 bg-gradient-to-r from-black via-gray-900 to-black bg-clip-text text-transparent">Admin Access</h1>
            <p className="text-xs md:text-sm text-gray-600 flex items-center justify-center gap-1.5">
              Enter password to continue
              <Sparkles className="w-3 h-3 text-gold-500" />
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="mb-3 md:mb-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field text-sm"
                placeholder="Enter admin password"
                required
              />
              {loginError && (
                <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                  ❌ {loginError}
                </p>
              )}
            </div>

            <button type="submit" className="w-full bg-gradient-to-r from-black to-gray-900 hover:from-gray-900 hover:to-black text-white py-2 rounded-lg font-bold text-sm shadow-md hover:shadow-lg hover:shadow-gold-glow border border-gold-500/20 transition-all">
              Access Dashboard ✨
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-12 h-12 md:w-16 md:h-16 border-4 border-gray-200 border-t-gold-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm md:text-base text-gray-600 font-medium">Loading... ✨</p>
        </div>
      </div>
    );
  }

  // Form View (Add/Edit)
  if (currentView === 'add' || currentView === 'edit') {
    return (
      <>
        {variationManagerModal}
        <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white">
          <div className="bg-white shadow-md border-b border-gold-300/30">
            <div className="max-w-6xl mx-auto px-3 sm:px-4">
              <div className="flex items-center justify-between h-12 md:h-14 gap-2">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleCancel}
                    className="text-gray-700 hover:text-gold-600 transition-colors flex items-center gap-1 group"
                  >
                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-xs md:text-sm">Back</span>
                  </button>
                  <h1 className="text-sm md:text-base font-bold bg-gradient-to-r from-black to-gray-900 bg-clip-text text-transparent">
                    {currentView === 'add' ? '✨ Add New' : '✏️ Edit Product'}
                  </h1>
                </div>
                <div className="flex space-x-1.5">
                  <button onClick={handleCancel} className="px-2 py-1 border border-gray-300 hover:border-gray-400 rounded-md hover:bg-gray-50 transition-all flex items-center gap-1 text-xs">
                    <X className="h-3 w-3" />
                    <span className="hidden sm:inline">Cancel</span>
                  </button>
                  <button
                    onClick={handleSaveProduct}
                    disabled={isProcessing}
                    className="bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-black px-2 md:px-3 py-1 rounded-md transition-all flex items-center gap-1 shadow-sm hover:shadow disabled:opacity-50 text-xs"
                  >
                    <Save className="h-3 w-3" />
                    {isProcessing ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 md:py-4">
            <div className="bg-white rounded-lg md:rounded-xl shadow-lg p-3 md:p-4 lg:p-5 space-y-3 md:space-y-4 border border-gold-300/30">
              {/* Basic Information */}
              <div>
                <h3 className="text-sm md:text-base font-bold text-gray-900 mb-2 md:mb-3 flex items-center gap-1.5">
                  <span className="text-base md:text-lg">📝</span>
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

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Base Price (₱) *</label>
                    <input
                      type="number"
                      step="1"
                      value={formData.base_price || ''}
                      onChange={(e) => setFormData({ ...formData, base_price: Number(e.target.value) })}
                      className="input-field text-sm"
                      placeholder="0"
                    />
                    {editingProduct && editingProduct.variations && editingProduct.variations.length > 0 && (
                      <p className="text-xs text-orange-600 mt-2 flex items-start gap-1.5 bg-orange-50 p-2 rounded border border-orange-200">
                        <span className="text-base">⚠️</span>
                        <span>This product has <strong>{editingProduct.variations.length} size variation(s)</strong>. Customers will see those prices instead of this base price. Use the <strong>"Manage Sizes"</strong> button to update the prices shown on the website.</span>
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
              <div className="bg-gradient-to-r from-gold-50 to-gray-50 border border-gold-300/30 rounded-lg p-3 md:p-4">
                <div className="flex items-center justify-between mb-2 md:mb-3">
                  <h3 className="text-sm md:text-base font-bold text-gray-900 flex items-center gap-1.5">
                    <span className="text-base md:text-lg">📦</span>
                    Complete Set Inclusions
                  </h3>
                  <label className="flex items-center gap-1.5 cursor-pointer">
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
                      className="w-4 h-4 text-gold-600 rounded focus:ring-gold-500"
                    />
                    <span className="text-xs font-semibold text-gray-700">This is a SET product</span>
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
                      <span className="text-gold-600 font-bold">💡</span>
                      <span>Enter each item on a new line. These will be displayed as a checklist on the product detail page. Check "This is a SET product" above to enable this feature.</span>
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-xs text-gray-500 mb-2">Enable "This is a SET product" to add inclusions</p>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, inclusions: [] })}
                      className="text-xs text-gold-600 hover:text-gold-700 font-medium"
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
                        className="w-4 h-4 text-gold-600 rounded focus:ring-gold-500"
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
        <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white">
          <div className="bg-white shadow-md border-b border-gold-300/30">
            <div className="max-w-6xl mx-auto px-3 sm:px-4">
              <div className="flex items-center justify-between h-12 md:h-14">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentView('dashboard')}
                    className="text-gray-700 hover:text-gold-600 transition-colors flex items-center gap-1 group"
                  >
                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-xs md:text-sm">Dashboard</span>
                  </button>
                  <h1 className="text-sm md:text-base font-bold bg-gradient-to-r from-black to-gray-900 bg-clip-text text-transparent">Products</h1>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="bg-gradient-to-r from-black to-gray-900 hover:from-gray-900 hover:to-black text-white px-2 py-1 rounded-md font-medium text-xs shadow-sm hover:shadow transition-all flex items-center gap-1 disabled:opacity-50 border border-gold-500/20"
                    title="Refresh data"
                  >
                    <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                  {selectedProducts.size > 0 && (
                    <button
                      onClick={handleBulkDelete}
                      disabled={isProcessing}
                      className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-2 md:px-3 py-1 rounded-md font-medium text-xs shadow-sm hover:shadow transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span className="hidden sm:inline">Delete ({selectedProducts.size})</span>
                      <span className="sm:hidden">Delete</span>
                    </button>
                  )}
                  <button
                    onClick={handleAddProduct}
                    className="bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-black px-2 md:px-3 py-1 rounded-md font-medium text-xs shadow-sm hover:shadow transition-all flex items-center gap-1"
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
              <div className="mb-3 bg-gold-50 border border-gold-300 rounded-lg p-2 md:p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs md:text-sm font-semibold text-gray-900">
                    {selectedProducts.size} product{selectedProducts.size !== 1 ? 's' : ''} selected
                  </span>
                </div>
                <button
                  onClick={() => setSelectedProducts(new Set())}
                  className="text-xs text-gold-600 hover:text-gold-700 font-medium underline"
                >
                  Clear Selection
                </button>
              </div>
            )}

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {products.map((product) => (
                <div key={product.id} className="bg-white rounded-xl shadow-lg border border-gold-300/30 p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(product.id)}
                        onChange={() => toggleSelectProduct(product.id)}
                        className="mt-0.5 w-4 h-4 text-gold-600 rounded focus:ring-gold-500 cursor-pointer shrink-0"
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
                          ? 'bg-gold-500 text-black hover:bg-gold-600 shadow-md cursor-pointer'
                          : 'text-gold-600 hover:bg-gold-100 cursor-pointer'
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
                        <div className="text-sm font-semibold text-gold-600">{product.variations?.length || 0}</div>
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
            <div className="hidden md:block bg-white rounded-lg md:rounded-xl shadow-lg overflow-hidden border border-gold-300/30">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-gray-50 to-white border-b border-gold-300/30">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">
                        <input
                          type="checkbox"
                          checked={selectedProducts.size === products.length && products.length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 text-gold-600 rounded focus:ring-gold-500 cursor-pointer"
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
                      <tr key={product.id} className="hover:bg-gold-50/50 transition-colors">
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => toggleSelectProduct(product.id)}
                            className="w-4 h-4 text-gold-600 rounded focus:ring-gold-500 cursor-pointer"
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
                            <div className="text-[9px] text-gold-600 font-medium mt-0.5">
                              Not used (has sizes)
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {product.variations && product.variations.length > 0 ? (
                            <div>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gold-100 text-gold-900">
                                {product.variations.length} {product.variations.length === 1 ? 'size' : 'sizes'}
                              </span>
                              <div className="text-[9px] text-gray-500 mt-0.5">
                                Click <Layers className="w-2.5 h-2.5 inline text-gold-600" /> to edit
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
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gold-100 text-gold-900">
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
                                ? 'bg-gold-500 text-black hover:bg-gold-600 shadow-md hover:shadow-lg cursor-pointer'
                                : 'text-gold-600 hover:bg-gold-100 cursor-pointer'
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

  // COA Lab Reports View
  if (currentView === 'coa') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white">
        <div className="bg-white shadow-md border-b border-gold-300/30">
          <div className="max-w-6xl mx-auto px-3 sm:px-4">
            <div className="flex items-center justify-between h-12 md:h-14">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentView('dashboard')}
                  className="text-gray-700 hover:text-gold-600 transition-colors flex items-center gap-1 group"
                >
                  <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                  <span className="text-xs md:text-sm">Dashboard</span>
                </button>
                <h1 className="text-sm md:text-base font-bold bg-gradient-to-r from-black to-gray-900 bg-clip-text text-transparent">🔬 Lab Reports (COA)</h1>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 md:py-4">
          <COAManager />
        </div>
      </div>
    );
  }

  // Inventory View
  if (currentView === 'inventory') {
    return <PeptideInventoryManager onBack={() => setCurrentView('dashboard')} />;
  }

  // Orders View
  if (currentView === 'orders') {
    return <OrdersManager onBack={() => setCurrentView('dashboard')} />;
  }

  // FAQ View
  if (currentView === 'faq') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white">
        <div className="bg-white shadow-md border-b border-gold-300/30">
          <div className="max-w-6xl mx-auto px-3 sm:px-4">
            <div className="flex items-center justify-between h-12 md:h-14">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentView('dashboard')}
                  className="text-gray-700 hover:text-gold-600 transition-colors flex items-center gap-1 group"
                >
                  <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                  <span className="text-xs md:text-sm">Dashboard</span>
                </button>
                <h1 className="text-sm md:text-base font-bold bg-gradient-to-r from-black to-gray-900 bg-clip-text text-transparent">❓ FAQ Management</h1>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 md:py-4">
          <FAQManager />
        </div>
      </div>
    );
  }

  // Shipping View
  if (currentView === 'shipping') {
    return <ShippingManager onBack={() => setCurrentView('dashboard')} />;
  }

  // Dashboard View
  return (
    <>
      {variationManagerModal}
      <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white">
        <div className="bg-white shadow-md border-b border-gold-300/30">
          <div className="max-w-6xl mx-auto px-3 sm:px-4">
            <div className="flex items-center justify-between h-12 md:h-14">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-black to-gray-900 rounded-lg flex items-center justify-center shadow-lg overflow-hidden border-2 border-gold-500/30">
                  <img
                    src="/assets/logo.jpg"
                    alt="peptalk.ph"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h1 className="text-sm md:text-base font-bold bg-gradient-to-r from-black via-gray-900 to-black bg-clip-text text-transparent">
                    peptalk.ph
                  </h1>
                  <p className="text-[9px] md:text-[10px] text-gray-600 font-medium flex items-center gap-0.5">
                    <Sparkles className="w-2 h-2 text-gold-500" />
                    Admin Dashboard
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-gold-600 transition-colors font-medium text-xs hidden sm:block"
                >
                  View Website
                </a>
                <button
                  onClick={handleLogout}
                  className="bg-gradient-to-r from-red-400 to-red-500 hover:from-red-500 hover:to-red-600 text-white px-2 md:px-3 py-1 rounded-md transition-all font-medium text-xs shadow-sm hover:shadow"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 md:py-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-3 md:mb-4">
            <button
              onClick={() => setCurrentView('products')}
              className="bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg transition-all p-2 md:p-3 border border-gold-300/30 transform hover:-translate-y-0.5 text-left cursor-pointer"
            >
              <div className="flex items-center">
                <div className="p-1.5 md:p-2 bg-gradient-to-br from-black to-gray-900 rounded-md md:rounded-lg shadow-sm">
                  <Package className="h-3 w-3 md:h-4 md:w-4 text-gold-500" />
                </div>
                <div className="ml-2">
                  <p className="text-[9px] md:text-xs font-medium text-gray-600">Total Products</p>
                  <p className="text-lg md:text-xl font-bold bg-gradient-to-r from-black to-gray-900 bg-clip-text text-transparent">{totalProducts}</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setCurrentView('products')}
              className="bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg transition-all p-2 md:p-3 border border-gold-300/30 transform hover:-translate-y-0.5 text-left cursor-pointer"
            >
              <div className="flex items-center">
                <div className="p-1.5 md:p-2 bg-gradient-to-br from-gold-500 to-gold-600 rounded-md md:rounded-lg shadow-sm">
                  <TrendingUp className="h-3 w-3 md:h-4 md:w-4 text-black" />
                </div>
                <div className="ml-2">
                  <p className="text-[9px] md:text-xs font-medium text-gray-600">Available</p>
                  <p className="text-lg md:text-xl font-bold bg-gradient-to-r from-gold-600 to-gold-500 bg-clip-text text-transparent">{availableProducts}</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setCurrentView('products')}
              className="bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg transition-all p-2 md:p-3 border border-gold-300/30 transform hover:-translate-y-0.5 text-left cursor-pointer"
            >
              <div className="flex items-center">
                <div className="p-1.5 md:p-2 bg-gradient-to-br from-gray-800 to-black rounded-md md:rounded-lg shadow-sm">
                  <Sparkles className="h-3 w-3 md:h-4 md:w-4 text-gold-500" />
                </div>
                <div className="ml-2">
                  <p className="text-[9px] md:text-xs font-medium text-gray-600">Featured</p>
                  <p className="text-lg md:text-xl font-bold bg-gradient-to-r from-black to-gray-700 bg-clip-text text-transparent">{featuredProducts}</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setCurrentView('categories')}
              className="bg-white rounded-lg md:rounded-xl shadow-md hover:shadow-lg transition-all p-2 md:p-3 border border-gold-300/30 transform hover:-translate-y-0.5 text-left cursor-pointer"
            >
              <div className="flex items-center">
                <div className="p-1.5 md:p-2 bg-gradient-to-br from-gold-400 to-gold-600 rounded-md md:rounded-lg shadow-sm">
                  <Users className="h-3 w-3 md:h-4 md:w-4 text-black" />
                </div>
                <div className="ml-2">
                  <p className="text-[9px] md:text-xs font-medium text-gray-600">Categories</p>
                  <p className="text-lg md:text-xl font-bold bg-gradient-to-r from-gold-600 to-gold-700 bg-clip-text text-transparent">{categories.length}</p>
                </div>
              </div>
            </button>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <div className="bg-white rounded-lg md:rounded-xl shadow-lg p-3 md:p-4 border border-gold-300/30">
              <h3 className="text-sm md:text-base font-bold text-gray-900 mb-2 md:mb-3 flex items-center gap-1.5">
                Quick Actions
                <Sparkles className="w-3 h-3 md:w-4 md:h-4 text-gold-500" />
              </h3>
              <div className="space-y-1 md:space-y-1.5">
                <button
                  onClick={handleAddProduct}
                  className="w-full flex items-center gap-2 p-1.5 md:p-2 text-left hover:bg-gradient-to-r hover:from-gold-50 hover:to-gray-50 rounded-md md:rounded-lg transition-all group"
                >
                  <div className="p-1 md:p-1.5 bg-gradient-to-br from-black to-gray-900 rounded-md text-gold-500">
                    <Plus className="h-3 w-3 md:h-4 md:w-4" />
                  </div>
                  <span className="text-xs font-medium text-gray-900">Add New Product</span>
                </button>
                <button
                  onClick={() => setCurrentView('products')}
                  className="w-full flex items-center gap-2 p-1.5 md:p-2 text-left hover:bg-gradient-to-r hover:from-gold-50 hover:to-gray-50 rounded-md md:rounded-lg transition-all group"
                >
                  <div className="p-1 md:p-1.5 bg-gradient-to-br from-gray-800 to-black rounded-md text-gold-500">
                    <Package className="h-3 w-3 md:h-4 md:w-4" />
                  </div>
                  <span className="text-xs font-medium text-gray-900">Manage Products</span>
                </button>
                <button
                  onClick={() => setCurrentView('categories')}
                  className="w-full flex items-center gap-2 p-1.5 md:p-2 text-left hover:bg-gradient-to-r hover:from-gold-50 hover:to-gray-50 rounded-md md:rounded-lg transition-all group"
                >
                  <div className="p-1 md:p-1.5 bg-gradient-to-br from-gold-500 to-gold-600 rounded-md text-black">
                    <FolderOpen className="h-3 w-3 md:h-4 md:w-4" />
                  </div>
                  <span className="text-xs font-medium text-gray-900">Manage Categories</span>
                </button>
                <button
                  onClick={() => setCurrentView('payments')}
                  className="w-full flex items-center gap-2 p-1.5 md:p-2 text-left hover:bg-gradient-to-r hover:from-gold-50 hover:to-gray-50 rounded-md md:rounded-lg transition-all group"
                >
                  <div className="p-1 md:p-1.5 bg-gradient-to-br from-black to-gray-900 rounded-md text-gold-500">
                    <CreditCard className="h-3 w-3 md:h-4 md:w-4" />
                  </div>
                  <span className="text-xs font-medium text-gray-900">Payment Methods</span>
                </button>
                <button
                  onClick={() => setCurrentView('coa')}
                  className="w-full flex items-center gap-2 p-1.5 md:p-2 text-left hover:bg-gradient-to-r hover:from-gold-50 hover:to-gray-50 rounded-md md:rounded-lg transition-all group"
                >
                  <div className="p-1 md:p-1.5 bg-gradient-to-br from-gray-800 to-black rounded-md text-gold-500">
                    <Shield className="h-3 w-3 md:h-4 md:w-4" />
                  </div>
                  <span className="text-xs font-medium text-gray-900">Lab Reports (COA)</span>
                </button>
                <button
                  onClick={() => setCurrentView('inventory')}
                  className="w-full flex items-center gap-2 p-1.5 md:p-2 text-left hover:bg-gradient-to-r hover:from-gold-50 hover:to-gray-50 rounded-md md:rounded-lg transition-all group"
                >
                  <div className="p-1 md:p-1.5 bg-gradient-to-br from-gold-400 to-gold-600 rounded-md text-black">
                    <Warehouse className="h-3 w-3 md:h-4 md:w-4" />
                  </div>
                  <span className="text-xs font-medium text-gray-900">Peptide Inventory</span>
                </button>
                <button
                  onClick={() => setCurrentView('orders')}
                  className="w-full flex items-center gap-2 p-1.5 md:p-2 text-left hover:bg-gradient-to-r hover:from-gold-50 hover:to-gray-50 rounded-md md:rounded-lg transition-all group"
                >
                  <div className="p-1 md:p-1.5 bg-gradient-to-br from-black to-gray-900 rounded-md text-gold-500">
                    <ShoppingCart className="h-3 w-3 md:h-4 md:w-4" />
                  </div>
                  <span className="text-xs font-medium text-gray-900">Orders Management</span>
                </button>
                <button
                  onClick={() => setCurrentView('faq')}
                  className="w-full flex items-center gap-2 p-1.5 md:p-2 text-left hover:bg-gradient-to-r hover:from-gold-50 hover:to-gray-50 rounded-md md:rounded-lg transition-all group"
                >
                  <div className="p-1 md:p-1.5 bg-gradient-to-br from-gold-400 to-gold-600 rounded-md text-black">
                    <HelpCircle className="h-3 w-3 md:h-4 md:w-4" />
                  </div>
                  <span className="text-xs font-medium text-gray-900">FAQ Management</span>
                </button>
                <button
                  onClick={() => setCurrentView('shipping')}
                  className="w-full flex items-center gap-2 p-1.5 md:p-2 text-left hover:bg-gradient-to-r hover:from-gold-50 hover:to-gray-50 rounded-md md:rounded-lg transition-all group"
                >
                  <div className="p-1 md:p-1.5 bg-gradient-to-br from-green-400 to-green-600 rounded-md text-white">
                    <MapPin className="h-3 w-3 md:h-4 md:w-4" />
                  </div>
                  <span className="text-xs font-medium text-gray-900">Shipping Locations</span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg md:rounded-xl shadow-lg p-3 md:p-4 border border-gold-300/30">
              <h3 className="text-sm md:text-base font-bold text-gray-900 mb-2 md:mb-3 flex items-center gap-1.5">
                Categories Overview
                <Heart className="w-3 h-3 md:w-4 md:h-4 text-gold-500 animate-pulse" />
              </h3>
              <div className="space-y-1 md:space-y-1.5">
                {categoryCounts.map((category, index) => {
                  const colors = [
                    'from-black to-gray-900',
                    'from-gray-800 to-black',
                    'from-gold-500 to-gold-600',
                    'from-gold-400 to-gold-600',
                    'from-gray-700 to-gray-900',
                    'from-black to-gray-800'
                  ];
                  return (
                    <div key={category.id} className="flex items-center justify-between py-1 md:py-1.5 hover:bg-gradient-to-r hover:from-gold-50 hover:to-gray-50 rounded-md md:rounded-lg px-2 transition-all">
                      <span className="text-xs font-semibold text-gray-900">{category.name}</span>
                      <span className={`text-[10px] md:text-xs font-bold ${index % 3 === 0 ? 'text-white bg-gradient-to-r from-black to-gray-900' :
                        index % 3 === 1 ? 'text-black bg-gradient-to-r from-gold-500 to-gold-600' :
                          'text-white bg-gradient-to-r from-gray-800 to-black'
                        } px-2 py-0.5 rounded-full shadow-sm`}>
                        {category.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminDashboard;

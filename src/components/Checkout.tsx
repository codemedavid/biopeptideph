import React, { useState } from 'react';
import { ArrowLeft, ShieldCheck, Package, CreditCard, Sparkles, Heart, Copy, Check, MessageCircle } from 'lucide-react';
import type { CartItem } from '../types';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { useShippingLocations } from '../hooks/useShippingLocations';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { supabase } from '../lib/supabase';
import ImageUpload from './ImageUpload';

interface CheckoutProps {
  cartItems: CartItem[];
  totalPrice: number;
  onBack: () => void;
}

const Checkout: React.FC<CheckoutProps> = ({ cartItems, totalPrice, onBack }) => {
  const { paymentMethods } = usePaymentMethods();
  const { locations: shippingLocations, getShippingFee } = useShippingLocations();
  const { siteSettings } = useSiteSettings();
  const [step, setStep] = useState<'details' | 'payment' | 'confirmation'>('details');

  // Customer Details
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Shipping Details
  const [address, setAddress] = useState('');
  const [barangay, setBarangay] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [shippingLocation, setShippingLocation] = useState<'NCR' | 'LUZON' | 'VISAYAS_MINDANAO' | ''>('');
  const [courier, setCourier] = useState<'jnt' | 'lalamove'>('jnt');

  // Payment
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [contactMethod, setContactMethod] = useState<'whatsapp' | ''>('whatsapp');
  const [notes, setNotes] = useState('');
  const [paymentProof, setPaymentProof] = useState<string | null>(null);

  // Order message for copying
  const [orderMessage, setOrderMessage] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [contactOpened, setContactOpened] = useState(false);

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  React.useEffect(() => {
    if (paymentMethods.length > 0 && !selectedPaymentMethod) {
      setSelectedPaymentMethod(paymentMethods[0].id);
    }
  }, [paymentMethods, selectedPaymentMethod]);

  // Calculate shipping fee based on location (uses dynamic fees from database)
  const shippingFee = shippingLocation ? getShippingFee(shippingLocation) : 0;
  const finalTotal = totalPrice + shippingFee;

  const isDetailsValid =
    fullName.trim() !== '' &&
    email.trim() !== '' &&
    phone.trim() !== '' &&
    address.trim() !== '' &&
    barangay.trim() !== '' &&
    city.trim() !== '' &&
    state.trim() !== '' &&
    zipCode.trim() !== '' &&
    shippingLocation !== '';

  const handleProceedToPayment = () => {
    if (isDetailsValid) {
      setStep('payment');
    }
  };


  const handlePlaceOrder = async () => {
    if (!contactMethod) {
      alert('Please select your preferred contact method (WhatsApp).');
      return;
    }

    if (!shippingLocation) {
      alert('Please select your shipping location.');
      return;
    }

    if (!paymentProof) {
      alert('Please upload a proof of payment screenshot.');
      return;
    }

    const paymentMethod = paymentMethods.find(pm => pm.id === selectedPaymentMethod);

    try {
      // Prepare order items for database
      const orderItems = cartItems.map(item => ({
        product_id: item.product.id,
        product_name: item.product.name,
        variation_id: item.variation?.id || null,
        variation_name: item.variation?.name || null,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
        purity_percentage: item.product.purity_percentage
      }));

      // Save order to database
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert([{
          customer_name: fullName,
          customer_email: email,
          customer_phone: phone,
          shipping_address: address,
          shipping_barangay: barangay,
          shipping_city: city,
          shipping_state: state,
          shipping_zip_code: zipCode,
          order_items: orderItems,
          total_price: totalPrice,
          shipping_fee: shippingFee,
          shipping_location: shippingLocation,
          payment_method_id: paymentMethod?.id || null,
          payment_method_name: paymentMethod?.name || null,
          payment_proof_url: paymentProof,
          contact_method: contactMethod || null,
          notes: `Courier Preference: ${courier === 'jnt' ? 'J&T Express' : 'Lalamove'}\n${notes.trim() || ''}`.trim(),
          order_status: 'new',
          payment_status: 'pending'
        }])
        .select()
        .single();

      if (orderError) {
        console.error('❌ Error saving order:', orderError);

        // Provide helpful error message if table doesn't exist
        let errorMessage = orderError.message;
        if (orderError.message?.includes('Could not find the table') ||
          orderError.message?.includes('relation "public.orders" does not exist') ||
          orderError.message?.includes('schema cache')) {
          errorMessage = `The orders table doesn't exist in the database. Please run the migration: supabase/migrations/20250117000000_ensure_orders_table.sql in your Supabase SQL Editor.`;
        }

        alert(`Failed to save order: ${errorMessage}\n\nPlease contact support if this issue persists.`);
        return;
      }

      console.log('✅ Order saved to database:', orderData);

      // Get current date and time
      const now = new Date();
      const dateTimeStamp = now.toLocaleString('en-PH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      const orderDetails = `
✨PeptalkPH - NEW ORDER

📅 ORDER DATE & TIME
${dateTimeStamp}

👤 CUSTOMER INFORMATION
Name: ${fullName}
Email: ${email}
Phone: ${phone}

📦 SHIPPING ADDRESS
${address}
${barangay}
${city}, ${state} ${zipCode}

🚚 COURIER PREFERENCE
${courier === 'jnt' ? 'J&T Express' : 'Lalamove'}

🛒 ORDER DETAILS
${cartItems.map(item => {
        let line = `• ${item.product.name}`;
        if (item.variation) {
          line += ` (${item.variation.name})`;
        }
        line += ` x${item.quantity} - ₱${(item.price * item.quantity).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
        if (item.product.purity_percentage && item.product.purity_percentage > 0) {
          line += `\n  Purity: ${item.product.purity_percentage}%`;
        }
        return line;
      }).join('\n\n')}

💰 PRICING
Product Total: ₱${totalPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
Shipping Fee: ₱${shippingFee.toLocaleString('en-PH', { minimumFractionDigits: 0 })} (${shippingLocation.replace('_', ' & ')})
Grand Total: ₱${finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 0 })}

💳 PAYMENT METHOD
${paymentMethod?.name || 'N/A'}
${paymentMethod ? `Account: ${paymentMethod.account_number}` : ''}

📸 PROOF OF PAYMENT
${paymentProof}
(Please also attach the screenshot image)

📱 CONTACT METHOD
WhatsApp: https://wa.me/639062349763

📋 ORDER ID: ${orderData.id}

Please confirm this order. Thank you!
      `.trim();

      // Store order message for copying
      setOrderMessage(orderDetails);

      // Open contact method based on selection
      const contactUrl = contactMethod === 'whatsapp'
        ? `https://wa.me/639062349763?text=${encodeURIComponent(orderDetails)}`
        : null;

      if (contactUrl) {
        try {
          const contactWindow = window.open(contactUrl, '_blank');

          if (!contactWindow || contactWindow.closed || typeof contactWindow.closed === 'undefined') {
            console.warn('⚠️ Popup blocked or contact method failed to open');
            setContactOpened(false);
          } else {
            setContactOpened(true);
            setTimeout(() => {
              if (contactWindow.closed) {
                setContactOpened(false);
              }
            }, 1000);
          }
        } catch (error) {
          console.error('❌ Error opening contact method:', error);
          setContactOpened(false);
        }
      }

      // Show confirmation
      setStep('confirmation');
    } catch (error) {
      console.error('❌ Error placing order:', error);
      alert(`Failed to place order: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
    }
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(orderMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (error) {
      console.error('Failed to copy:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = orderMessage;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } catch (err) {
        alert('Failed to copy. Please manually select and copy the message below.');
      }
      document.body.removeChild(textArea);
    }
  };

  const handleOpenContact = () => {
    const contactUrl = contactMethod === 'whatsapp'
      ? `https://wa.me/639062349763?text=${encodeURIComponent(orderMessage)}`
      : null;

    if (contactUrl) {
      window.open(contactUrl, '_blank');
    }
  };

  if (step === 'confirmation') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white flex items-center justify-center px-4 py-12">
        <div className="max-w-2xl w-full">
          <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 text-center border-2 border-gray-100">
            <div className="bg-theme-secondary w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl animate-bounce border-4 border-white">
              <ShieldCheck className="w-14 h-14 text-black" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-4 flex items-center justify-center gap-2 flex-wrap">
              <span className="bg-gradient-to-r from-black to-gray-900 bg-clip-text text-transparent">COMPLETE YOUR ORDER</span>
              <Sparkles className="w-7 h-7 text-theme-secondary" />
            </h1>
            <p className="text-gray-600 mb-8 text-base md:text-lg leading-relaxed">
              Copy the order message below and send it via WhatsApp along with your payment screenshot.
            </p>

            {/* Order Message Display */}
            <div className="bg-gray-50 rounded-2xl p-6 mb-6 text-left border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-theme-secondary" />
                  Your Order Message
                </h3>
                <button
                  onClick={handleCopyMessage}
                  className="flex items-center gap-2 px-4 py-2 bg-black hover:bg-black/90 text-white rounded-lg font-medium transition-all text-sm shadow-md hover:shadow-lg"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-300">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                  {orderMessage}
                </pre>
              </div>
              {copied && (
                <p className="text-green-600 text-sm mt-2 flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  Message copied to clipboard! Paste it in WhatsApp along with your payment screenshot.
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 mb-8">
              <button
                onClick={handleOpenContact}
                className="w-full bg-black hover:bg-black/90 text-white py-3 md:py-4 rounded-2xl font-bold text-base md:text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                Open WhatsApp
              </button>

              {!contactOpened && (
                <p className="text-sm text-gray-600">
                  💡 If WhatsApp doesn't open, copy the message above and paste it manually
                </p>
              )}
            </div>

            <div className="bg-theme-secondary/5 rounded-2xl p-6 mb-8 text-left border border-theme-secondary/20">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                What Happens Next?
                <Sparkles className="w-5 h-5 text-theme-secondary" />
              </h3>
              <ul className="space-y-3 text-sm md:text-base text-gray-700">
                <li className="flex items-start gap-3">
                  <span className="text-2xl">1️⃣</span>
                  <span>Send your order details and payment screenshot — we'll confirm within 24 hours or less.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-2xl">2️⃣</span>
                  <span>Your products are carefully packed and prepared for shipping.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-2xl">3️⃣</span>
                  <span>Payments made before 11 AM are shipped the same day.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-2xl">4️⃣</span>
                  <span>Tracking numbers are sent via WhatsApp from 11 PM onwards.</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                window.location.href = '/';
              }}
              className="w-full bg-theme-accent hover:bg-theme-accent/90 text-white py-3 md:py-4 rounded-2xl font-bold text-base md:text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
            >
              <Heart className="w-5 h-5 animate-pulse" />
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'details') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white py-6 md:py-8">
        <div className="container mx-auto px-3 md:px-4 max-w-6xl">
          <button
            onClick={onBack}
            className="text-gray-700 hover:text-theme-accent font-medium mb-4 md:mb-6 flex items-center gap-2 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm md:text-base">Back to Cart</span>
          </button>

          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-black to-gray-900 bg-clip-text text-transparent mb-6 md:mb-8 flex items-center gap-2">
            Checkout
            <Sparkles className="w-6 h-6 md:w-7 md:h-7 text-theme-secondary" />
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-4 md:space-y-6">
              {/* Customer Information */}
              <div className="bg-white rounded-2xl shadow-lg p-5 md:p-6 border border-gray-200">
                <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4 md:mb-6 flex items-center gap-2">
                  <div className="bg-theme-secondary/10 p-2 rounded-xl">
                    <Package className="w-5 h-5 md:w-6 md:h-6 text-theme-secondary" />
                  </div>
                  Customer Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="input-field"
                      placeholder="Juan Dela Cruz"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-field"
                      placeholder="juan@gmail.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="input-field"
                      placeholder="09XX XXX XXXX"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Shipping Address */}
              <div className="bg-white rounded-2xl shadow-lg p-5 md:p-6 border border-gray-200">
                <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4 md:mb-6 flex items-center gap-2">
                  <div className="bg-theme-secondary/10 p-2 rounded-xl">
                    <Package className="w-5 h-5 md:w-6 md:h-6 text-theme-secondary" />
                  </div>
                  Shipping Address
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Street Address *
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="input-field"
                      placeholder="123 Rizal Street"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Barangay *
                    </label>
                    <input
                      type="text"
                      value={barangay}
                      onChange={(e) => setBarangay(e.target.value)}
                      className="input-field"
                      placeholder="Brgy. San Antonio"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        City *
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="input-field"
                        placeholder="Quezon City"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Province *
                      </label>
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="input-field"
                        placeholder="Metro Manila"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ZIP/Postal Code *
                    </label>
                    <input
                      type="text"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      className="input-field"
                      placeholder="1100"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Shipping Location Selection */}
              <div className="bg-white rounded-2xl shadow-lg p-5 md:p-6 border border-gray-200">
                <h2 className="text-lg md:text-xl font-bold text-theme-text mb-2 md:mb-3 flex items-center gap-2">
                  <div className="bg-theme-secondary/10 p-2 rounded-xl">
                    <Package className="w-5 h-5 md:w-6 md:h-6 text-theme-secondary" />
                  </div>
                  Choose Shipping Location *
                </h2>
                <p className="text-xs md:text-sm text-gray-600 mb-4 md:mb-6">
                  Shipping rates apply to small pouches (4.1 × 9.5 inches) with a capacity of up to 3 pens. For bulk orders exceeding this size, our team will contact you for the adjusted shipping fees.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {shippingLocations.map((loc) => (
                    <button
                      key={loc.id}
                      onClick={() => {
                        setShippingLocation(loc.id as 'NCR' | 'LUZON' | 'VISAYAS_MINDANAO');
                        // Reset to J&T if not NCR
                        if (loc.id !== 'NCR') {
                          setCourier('jnt');
                        }
                      }}
                      className={`p-3 rounded-lg border-2 transition-all ${shippingLocation === loc.id
                        ? 'border-theme-accent bg-theme-accent/5'
                        : 'border-gray-200 hover:border-theme-accent/50'
                        }`}
                    >
                      <p className="font-semibold text-gray-900 text-sm">{loc.id.replace('_', ' & ')}</p>
                      <p className="text-xs text-gray-500">₱{loc.fee.toLocaleString()}</p>
                    </button>
                  ))}
                </div>

                {/* Courier Selection */}
                {shippingLocation && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Select Courier</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setCourier('jnt')}
                        className={`p-3 rounded-lg border transition-all flex items-center justify-center gap-2 ${courier === 'jnt'
                          ? 'border-theme-accent bg-theme-accent/5 text-theme-text'
                          : 'border-gray-200 hover:border-theme-accent/50'
                          }`}
                      >
                        <span className="text-sm font-medium">J&T Express</span>
                      </button>

                      <button
                        onClick={() => setCourier('lalamove')}
                        disabled={shippingLocation !== 'NCR'}
                        className={`p-3 rounded-lg border transition-all flex items-center justify-center gap-2 ${shippingLocation !== 'NCR'
                          ? 'opacity-50 cursor-not-allowed bg-gray-50'
                          : courier === 'lalamove'
                            ? 'border-orange-500 bg-orange-50 text-orange-900'
                            : 'border-gray-200 hover:border-orange-300'
                          }`}
                      >
                        <span className="text-sm font-medium">Lalamove</span>
                      </button>
                    </div>

                    {shippingLocation !== 'NCR' && (
                      <p className="text-xs text-gray-500 mt-2">Lalamove is only available for NCR delivery.</p>
                    )}
                  </div>
                )}

                {/* Courier Delay Notices */}
                {shippingLocation && (
                  <div className="mt-4 space-y-3">
                    {/* J&T Notice */}
                    {siteSettings?.jnt_delay_active && courier === 'jnt' && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
                        <span className="text-lg">📢</span>
                        <div>
                          <p className="text-sm text-red-800 font-medium">Courier Notice (J&T)</p>
                          <p className="text-xs text-red-700 mt-0.5">{siteSettings.jnt_delay_message}</p>
                        </div>
                      </div>
                    )}

                    {/* Lalamove Notice */}
                    {siteSettings?.lalamove_delay_active && courier === 'lalamove' && (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
                        <span className="text-lg">📢</span>
                        <div>
                          <p className="text-sm text-orange-800 font-medium">Courier Notice (Lalamove)</p>
                          <p className="text-xs text-orange-700 mt-0.5">{siteSettings.lalamove_delay_message}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={handleProceedToPayment}
                disabled={!isDetailsValid}
                className={`w-full py-3 md:py-4 rounded-2xl font-bold text-base md:text-lg transition-all transform shadow-lg ${isDetailsValid
                  ? 'bg-theme-accent hover:bg-theme-accent/90 text-white hover:scale-[1.02] hover:shadow-xl'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
              >
                Proceed to Payment ✨
              </button>
            </div>

            {/* Order Summary Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-xl p-5 md:p-6 sticky top-24 border-2 border-gray-100">
                <h2 className="text-lg md:text-xl font-bold text-theme-text mb-4 md:mb-6 flex items-center gap-2">
                  Order Summary
                  <Sparkles className="w-5 h-5 text-theme-secondary" />
                </h2>

                <div className="space-y-4 mb-6">
                  {cartItems.map((item, index) => (
                    <div key={index} className="pb-4 border-b border-gray-200">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 text-sm">{item.product.name}</h4>
                          {item.variation && (
                            <p className="text-xs text-theme-secondary mt-1">{item.variation.name}</p>
                          )}
                          {item.product.purity_percentage && item.product.purity_percentage > 0 ? (
                            <p className="text-xs text-gray-500 mt-1">
                              {item.product.purity_percentage}% Purity
                            </p>
                          ) : null}
                        </div>
                        <span className="font-semibold text-gray-900 text-sm">
                          ₱{(item.price * item.quantity).toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span className="font-medium">₱{totalPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</span>
                  </div>
                  <div className="flex justify-between text-gray-600 text-xs">
                    <span>Shipping</span>
                    <span className="font-medium text-theme-secondary">
                      {shippingLocation ? `₱${shippingFee.toLocaleString('en-PH', { minimumFractionDigits: 0 })}` : 'Select location'}
                    </span>
                  </div>
                  <div className="border-t-2 border-gray-200 pt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-900">Total</span>
                      <span className="text-2xl font-bold text-theme-secondary">
                        ₱{finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                      </span>
                    </div>
                    {!shippingLocation && (
                      <p className="text-xs text-red-500 mt-1 text-right">Please select shipping location</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Payment Step
  const paymentMethodInfo = paymentMethods.find(pm => pm.id === selectedPaymentMethod);

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white py-6 md:py-8">
      <div className="container mx-auto px-3 md:px-4 max-w-6xl">
        <button
          onClick={() => setStep('details')}
          className="text-gray-700 hover:text-theme-accent font-medium mb-4 md:mb-6 flex items-center gap-2 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm md:text-base">Back to Details</span>
        </button>

        <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-black to-gray-900 bg-clip-text text-transparent mb-6 md:mb-8 flex items-center gap-2">
          Payment
          <CreditCard className="w-6 h-6 md:w-7 md:h-7 text-theme-secondary" />
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
          {/* Payment Form */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            {/* Shipping Location Selection */}
            <div className="bg-white rounded-2xl shadow-lg p-5 md:p-6 border border-gray-200">
              <h2 className="text-lg md:text-xl font-bold text-theme-text mb-2 md:mb-3 flex items-center gap-2">
                <Package className="w-5 h-5 md:w-6 md:h-6 text-theme-secondary" />
                Choose Shipping Location *
              </h2>
              <p className="text-xs md:text-sm text-gray-600 mb-4 md:mb-6">
                Shipping rates apply to small pouches (4.1 × 9.5 inches) with a capacity of up to 3 pens. For bulk orders exceeding this size, our team will contact you for the adjusted shipping fees.
              </p>
              <div className="grid grid-cols-1 gap-3">
                {shippingLocations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => setShippingLocation(loc.id as 'NCR' | 'LUZON' | 'VISAYAS_MINDANAO')}
                    className={`p-4 rounded-lg border-2 transition-all flex items-center justify-between ${shippingLocation === loc.id
                      ? 'border-theme-accent bg-theme-accent/5'
                      : 'border-gray-200 hover:border-theme-accent/50'
                      }`}
                  >
                    <div className="text-left">
                      <p className="font-semibold text-gray-900">{loc.id.replace('_', ' & ')}</p>
                      <p className="text-sm text-gray-500">₱{loc.fee.toLocaleString()}</p>
                    </div>
                    {shippingLocation === loc.id && (
                      <div className="w-6 h-6 bg-theme-accent rounded-full flex items-center justify-center">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Method Selection */}
            <div className="bg-white rounded-2xl shadow-lg p-5 md:p-6 border border-gray-200">
              <h2 className="text-lg md:text-xl font-bold text-theme-text mb-4 md:mb-6 flex items-center gap-2">
                <div className="bg-theme-secondary/10 p-2 rounded-xl">
                  <CreditCard className="w-5 h-5 md:w-6 md:h-6 text-theme-secondary" />
                </div>
                Payment Method
              </h2>

              <div className="grid grid-cols-1 gap-4 mb-6">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setSelectedPaymentMethod(method.id)}
                    className={`p-4 rounded-lg border-2 transition-all flex items-center justify-between ${selectedPaymentMethod === method.id
                      ? 'border-theme-accent bg-theme-accent/5'
                      : 'border-gray-200 hover:border-theme-accent/50'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-theme-secondary/10 rounded-lg flex items-center justify-center">
                        <CreditCard className="w-6 h-6 text-theme-secondary" />
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-gray-900">{method.name}</p>
                        <p className="text-sm text-gray-500">{method.account_name}</p>
                      </div>
                    </div>
                    {selectedPaymentMethod === method.id && (
                      <div className="w-6 h-6 bg-theme-accent rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">✓</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Payment Proof Upload */}
              {selectedPaymentMethod && (
                <div className="mt-6 border-t border-gray-100 pt-6 animate-fadeIn">
                  <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="text-xl">📸</span>
                    Upload Proof of Payment *
                  </h3>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
                    Please upload a screenshot of your payment confirmation (GCash receipt, Bank transfer slip, etc.).
                  </div>

                  <ImageUpload
                    currentImage={paymentProof}
                    onImageChange={(url) => setPaymentProof(url || null)}
                    folder="payment-proofs"
                    skipBucketCheck={true}
                    className="max-w-md mx-auto"
                  />
                </div>
              )}
            </div>   {paymentMethodInfo && (
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-4">Payment Details</h3>
                <div className="space-y-2 text-sm text-gray-700 mb-4">
                  <p><strong>Account Number:</strong> {paymentMethodInfo.account_number}</p>
                  <p><strong>Account Name:</strong> {paymentMethodInfo.account_name}</p>
                  <p><strong>Amount to Pay:</strong> <span className="text-xl font-bold text-theme-secondary">₱{finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</span></p>
                </div>

                {paymentMethodInfo.qr_code_url && (
                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-lg">
                      <img
                        src={paymentMethodInfo.qr_code_url}
                        alt="Payment QR Code"
                        className="w-48 h-48 object-contain"
                      />
                      <p className="text-xs text-center text-gray-500 mt-2">Scan to pay</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Contact Method Selection */}
          <div className="bg-white rounded-2xl shadow-lg p-5 md:p-6 border border-gray-200">
            <h2 className="text-lg md:text-xl font-bold text-theme-text mb-4 md:mb-6 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 md:w-6 md:h-6 text-theme-secondary" />
              Preferred Contact Method *
            </h2>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => setContactMethod('whatsapp')}
                className={`p-4 rounded-lg border-2 transition-all flex items-center justify-between ${contactMethod === 'whatsapp'
                  ? 'border-theme-accent bg-theme-accent/5'
                  : 'border-gray-200 hover:border-theme-accent/50'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <MessageCircle className="w-6 h-6 text-theme-secondary" />
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">WhatsApp</p>
                    <p className="text-sm text-gray-500">+63 906 234 9763</p>
                  </div>
                </div>
                {contactMethod === 'whatsapp' && (
                  <div className="w-6 h-6 bg-theme-accent rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">✓</span>
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Additional Notes */}
          <div className="bg-white rounded-2xl shadow-lg p-5 md:p-6 border border-gray-200">
            <h2 className="text-lg md:text-xl font-bold text-theme-text mb-4 flex items-center gap-2">
              <div className="bg-theme-secondary/10 p-2 rounded-xl">
                <MessageCircle className="w-5 h-5 text-theme-secondary" />
              </div>
              Order Notes (Optional)
            </h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field"
              rows={4}
              placeholder="Any special instructions or notes for your order..."
            />
          </div>

          <button
            onClick={handlePlaceOrder}
            disabled={!contactMethod || !shippingLocation}
            className={`w-full py-3 md:py-4 rounded-2xl font-bold text-base md:text-lg shadow-lg transition-all flex items-center justify-center gap-2 ${contactMethod && shippingLocation
              ? 'bg-theme-accent hover:bg-theme-accent/90 text-white hover:shadow-xl transform hover:scale-[1.02]'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
          >
            <ShieldCheck className="w-5 h-5 md:w-6 md:h-6" />
            Complete Order
          </button>
        </div>

        {/* Order Summary Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-xl p-5 md:p-6 sticky top-24 border-2 border-gray-100">
            <h2 className="text-lg md:text-xl font-bold text-theme-text mb-4 md:mb-6 flex items-center gap-2">
              Final Summary
              <Sparkles className="w-5 h-5 text-theme-secondary" />
            </h2>

            {/* Customer Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm">
              <p className="font-semibold text-gray-900 mb-2">{fullName}</p>
              <p className="text-gray-600">{email}</p>
              <p className="text-gray-600">{phone}</p>
              <div className="mt-3 pt-3 border-t border-gray-200 text-gray-600">
                <p>{address}</p>
                <p>{barangay}</p>
                <p>{city}, {state} {zipCode}</p>
              </div>
            </div>

            {/* Pricing */}
            <div className="space-y-3">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span className="font-medium">₱{totalPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between text-gray-600 text-xs">
                <span>Shipping</span>
                <span className="font-medium text-theme-secondary">
                  {shippingLocation ? `₱${shippingFee.toLocaleString('en-PH', { minimumFractionDigits: 0 })} (${shippingLocation.replace('_', ' & ')})` : 'Select location'}
                </span>
              </div>
              <div className="border-t-2 border-gray-200 pt-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="text-2xl font-bold text-theme-secondary">
                    ₱{finalTotal.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                  </span>
                </div>
                {!shippingLocation && (
                  <p className="text-xs text-red-500 mt-1 text-right">Please select shipping location</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;

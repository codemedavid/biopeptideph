import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FlaskConical, Package, CreditCard, Truck, ArrowLeft, MessageCircle, HelpCircle } from 'lucide-react';
import { useFAQs } from '../hooks/useFAQs';

const categoryIcons: { [key: string]: React.ReactElement } = {
    'PRODUCT & USAGE': <FlaskConical className="w-5 h-5" />,
    'ORDERING & PACKAGING': <Package className="w-5 h-5" />,
    'PAYMENT METHODS': <CreditCard className="w-5 h-5" />,
    'SHIPPING & DELIVERY': <Truck className="w-5 h-5" />,
};

const categoryColors: { [key: string]: string } = {
    'PRODUCT & USAGE': 'text-theme-accent border-theme-accent/20 bg-theme-accent/5',
    'ORDERING & PACKAGING': 'text-theme-secondary border-theme-secondary/20 bg-theme-secondary/5',
    'PAYMENT METHODS': 'text-blue-600 border-blue-200 bg-blue-50',
    'SHIPPING & DELIVERY': 'text-green-600 border-green-200 bg-green-50',
};

const FAQ: React.FC = () => {
    const { faqs, categories, loading } = useFAQs();
    const [openItems, setOpenItems] = useState<Set<string>>(new Set());
    const [activeCategory, setActiveCategory] = useState<string | null>(null);

    const toggleItem = (id: string) => {
        setOpenItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const filteredFAQs = activeCategory
        ? faqs.filter(faq => faq.category === activeCategory)
        : faqs;

    const whatsappUrl = `https://api.whatsapp.com/send?phone=639458990239&text=${encodeURIComponent('Hi! I have a question about your products.')}`;

    if (loading) {
        return (
            <div className="min-h-screen bg-theme-bg flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-theme-accent border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-theme-bg">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center gap-4">
                        <a
                            href="/"
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-theme-text" />
                        </a>
                        <div className="flex items-center gap-2">
                            <HelpCircle className="w-6 h-6 text-theme-accent" />
                            <h1 className="text-xl md:text-2xl font-bold text-theme-text">Frequently Asked Questions</h1>
                        </div>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 py-8 max-w-4xl">
                {/* Category Filter */}
                <div className="flex flex-wrap gap-2 mb-8">
                    <button
                        onClick={() => setActiveCategory(null)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeCategory === null
                            ? 'bg-theme-accent text-white'
                            : 'bg-white text-gray-600 border border-gray-200 hover:border-theme-accent'
                            }`}
                    >
                        All
                    </button>
                    {categories.map(category => (
                        <button
                            key={category}
                            onClick={() => setActiveCategory(category)}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${activeCategory === category
                                ? 'bg-theme-accent text-white'
                                : 'bg-white text-gray-600 border border-gray-200 hover:border-theme-accent'
                                }`}
                        >
                            {categoryIcons[category]}
                            {category}
                        </button>
                    ))}
                </div>

                {/* FAQ Items by Category */}
                {(activeCategory ? [activeCategory] : categories).map(category => (
                    <div key={category} className="mb-8">
                        <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-lg border ${categoryColors[category] || 'text-gray-600 border-gray-200 bg-gray-50'}`}>
                            {categoryIcons[category] || <HelpCircle className="w-5 h-5" />}
                            <h2 className="font-bold text-sm uppercase tracking-wide">{category}</h2>
                        </div>

                        <div className="space-y-3">
                            {filteredFAQs
                                .filter(faq => faq.category === category)
                                .map(faq => (
                                    <div
                                        key={faq.id}
                                        className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                                    >
                                        <button
                                            onClick={() => toggleItem(faq.id)}
                                            className="w-full px-5 py-4 flex items-center justify-between text-left"
                                        >
                                            <span className="font-medium text-theme-text pr-4">{faq.question}</span>
                                            {openItems.has(faq.id) ? (
                                                <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                            ) : (
                                                <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                            )}
                                        </button>
                                        {openItems.has(faq.id) && (
                                            <div className="px-5 pb-4 border-t border-gray-50">
                                                <p className="text-gray-600 whitespace-pre-line leading-relaxed pt-4">
                                                    {faq.answer}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}

                {/* Contact CTA */}
                <div className="mt-12 bg-white rounded-2xl border border-gray-100 p-6 md:p-8 text-center shadow-sm">
                    <h3 className="text-lg md:text-xl font-bold text-theme-text mb-2">
                        Still have questions?
                    </h3>
                    <p className="text-gray-600 mb-6">
                        We're here to help! Reach out to us via WhatsApp for quick assistance.
                    </p>
                    <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-theme-accent text-white px-6 py-3 rounded-lg font-medium hover:bg-theme-accent/90 transition-colors"
                    >
                        <MessageCircle className="w-5 h-5" />
                        Chat on WhatsApp
                    </a>
                </div>
            </div>
        </div>
    );
};

export default FAQ;

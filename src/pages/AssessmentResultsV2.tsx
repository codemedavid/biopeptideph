import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Info, ArrowRight, Shield, CheckCircle } from 'lucide-react';
import type { AssessmentResponse, Product } from '../types';

interface Recommendation {
    product: Product;
    reason: string;
    priority: 'primary' | 'supporting';
}

const AssessmentResultsV2 = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [assessment, setAssessment] = useState<AssessmentResponse | null>(null);
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

    useEffect(() => {
        const init = async () => {
            const assessData = location.state?.assessmentData as AssessmentResponse;

            if (!assessData) {
                navigate('/assessment');
                return;
            }

            try {
                setAssessment(assessData);
                const recs: Recommendation[] = [];

                // Map goals to peptides
                const goalMappings: Record<string, { product: string; reason: string; priority: 'primary' | 'supporting' }[]> = {
                    // Weight Management
                    weight_5_10kg: [
                        { product: 'Semaglutide', reason: 'Proven GLP-1 agonist for moderate weight loss (5-10kg)', priority: 'primary' },
                        { product: 'Lipo-C', reason: 'Lipotropic support for enhanced fat metabolism', priority: 'supporting' }
                    ],
                    weight_10_20kg: [
                        { product: 'Tirzepatide 15mg', reason: 'Dual GIP/GLP-1 agonist for significant weight loss (10-20kg)', priority: 'primary' },
                        { product: 'AOD-9604', reason: 'HGH fragment for targeted fat metabolism', priority: 'supporting' }
                    ],
                    weight_20plus: [
                        { product: 'Tirzepatide 30mg', reason: 'Maximum strength for aggressive weight loss (20+ kg)', priority: 'primary' },
                        { product: 'Retatrutide', reason: 'Triple agonist for maximum metabolic impact', priority: 'supporting' }
                    ],
                    weight_maintain: [
                        { product: 'CJC-1295 (No DAC) + Ipamorelin', reason: 'Metabolic support and body composition maintenance', priority: 'primary' }
                    ],

                    // Energy & Recovery
                    energy_mild: [
                        { product: 'BPC-157', reason: 'Supports mitochondrial function and cellular energy', priority: 'primary' },
                        { product: 'NAD+ 100mg', reason: 'Essential coenzyme for cellular energy production', priority: 'supporting' }
                    ],
                    energy_chronic: [
                        { product: 'TB-500', reason: 'Promotes cellular healing for chronic fatigue recovery', priority: 'primary' },
                        { product: 'MOTS-C', reason: 'Mitochondrial peptide for enhanced energy metabolism', priority: 'supporting' }
                    ],
                    recovery_athletic: [
                        { product: 'BPC-157', reason: 'Accelerates tissue repair and reduces inflammation', priority: 'primary' },
                        { product: 'TB-500', reason: 'Promotes cell migration and healing', priority: 'supporting' }
                    ],

                    // Body Composition
                    muscle_building: [
                        { product: 'CJC-1295 (No DAC) + Ipamorelin', reason: 'Stimulates growth hormone for muscle development', priority: 'primary' },
                        { product: 'Ipamorelin', reason: 'Selective GH secretagogue with minimal side effects', priority: 'supporting' }
                    ],
                    body_recomposition: [
                        { product: 'CJC-1295 (No DAC) + Ipamorelin', reason: 'Enhances fat metabolism while preserving lean muscle', priority: 'primary' },
                        { product: 'AOD-9604', reason: 'Targets fat loss without affecting muscle mass', priority: 'supporting' }
                    ],

                    // Anti-Aging & Longevity
                    anti_aging: [
                        { product: 'Epithalon', reason: 'Telomerase activator for cellular longevity', priority: 'primary' },
                        { product: 'NAD+ 500mg', reason: 'High-dose NAD+ for anti-aging and DNA repair', priority: 'supporting' }
                    ],

                    // Cognitive
                    cognitive_function: [
                        { product: 'Semax', reason: 'Nootropic peptide for mental clarity and focus', priority: 'primary' },
                        { product: 'Selank', reason: 'Anxiolytic and cognitive enhancer', priority: 'supporting' }
                    ],

                    // Aesthetic (merged with anti_aging)
                    /* aesthetic: [
                        { product: 'GHK-Cu', reason: 'Copper peptide for skin regeneration and collagen synthesis', priority: 'primary' },
                        { product: 'Glutathione', reason: 'Master antioxidant for skin brightening', priority: 'supporting' }
                    ] */
                };

                // Collect recommendations for ALL user's goals
                const seen = new Set<string>();

                assessData.goals?.forEach(goal => {
                    const mappings = goalMappings[goal];
                    if (mappings) {
                        mappings.forEach(mapping => {
                            // Avoid duplicates
                            if (!seen.has(mapping.product)) {
                                recs.push({
                                    product: {} as Product,
                                    reason: mapping.reason,
                                    priority: mapping.priority
                                });
                                seen.add(mapping.product);
                            }
                        });
                    }
                });

                // Fetch all product details
                if (recs.length > 0) {
                    const productNames = Array.from(seen);
                    const { data: products } = await supabase
                        .from('products')
                        .select('*')
                        .or(productNames.map(name => `name.ilike.%${name}%`).join(','));

                    if (products) {
                        recs.forEach((rec, index) => {
                            const productName = Array.from(seen)[index];
                            const matchedProduct = products.find(p => p.name.toLowerCase().includes(productName.toLowerCase()));
                            if (matchedProduct) {
                                rec.product = matchedProduct;
                            }
                        });
                    }
                }

                // Filter out any recommendations without products
                const validRecs = recs.filter(r => r.product.id);

                // Sort: primary first, then supporting
                validRecs.sort((a, b) => a.priority === 'primary' ? -1 : 1);

                setRecommendations(validRecs);

            } catch (err) {
                console.error('Error generating results:', err);
            } finally {
                setLoading(false);
            }
        };

        init();
    }, [location.state, navigate]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-medium">Analyzing your profile...</p>
                </div>
            </div>
        );
    }

    if (!assessment) return null;

    const primaryRec = recommendations.find(r => r.priority === 'primary');
    const supportingRecs = recommendations.filter(r => r.priority === 'supporting');

    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="max-w-4xl mx-auto px-4">
                {/* Header */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
                    <div className="flex items-center gap-3 mb-4">
                        <CheckCircle className="w-8 h-8 text-green-600" />
                        <h1 className="text-3xl font-bold text-gray-900">Your Personalized Protocol</h1>
                    </div>
                    <p className="text-gray-600">
                        Based on your goals and health profile, we've created a comprehensive peptide protocol tailored to your needs.
                    </p>
                </div>

                {/* Recommendations Header - Added spacing */}
                <div className="mt-12 mb-6">
                    <h2 className="text-xl font-bold text-gray-900 tracking-wide uppercase">RECOMMENDATIONS</h2>
                </div>

                {/* Primary Recommendation */}
                {primaryRec && (
                    <div className="bg-white rounded-lg shadow-sm border-2 border-blue-600 p-8 mb-6">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-semibold rounded-full">
                                PRIMARY RECOMMENDATION
                            </span>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">{primaryRec.product.name}</h2>
                        <p className="text-gray-600 mb-4">{primaryRec.reason}</p>
                        <div className="flex items-center justify-between">
                            <span className="text-3xl font-bold text-blue-600">
                                ₱{primaryRec.product.base_price?.toLocaleString()}
                            </span>
                            <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2">
                                Add to Cart
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Supporting Recommendations */}
                {supportingRecs.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
                        <h3 className="text-xl font-bold text-gray-900 mb-4">Supporting Peptides</h3>
                        <p className="text-gray-600 mb-6">
                            These peptides complement your primary recommendation for enhanced results.
                        </p>
                        <div className="space-y-4">
                            {supportingRecs.map((rec, index) => (
                                <div key={index} className="border border-gray-200 rounded-lg p-6 hover:border-blue-300 transition">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <h4 className="text-lg font-semibold text-gray-900 mb-2">{rec.product.name}</h4>
                                            <p className="text-gray-600 text-sm mb-3">{rec.reason}</p>
                                            <span className="text-xl font-bold text-gray-900">
                                                ₱{rec.product.base_price?.toLocaleString()}
                                            </span>
                                        </div>
                                        <button className="ml-4 px-4 py-2 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition">
                                            Add to Cart
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Safety Notice */}
                {assessment.medical_conditions && assessment.medical_conditions.length > 0 && (
                    <div className="bg-amber-50 border-l-4 border-amber-500 p-6 rounded-lg mb-6">
                        <div className="flex items-start gap-3">
                            <Shield className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                            <div>
                                <h4 className="font-semibold text-amber-900 mb-2">Important Safety Notice</h4>
                                <p className="text-amber-800 text-sm">
                                    Based on your medical history, please consult with a healthcare provider before starting any peptide therapy.
                                    Your submitted medical conditions will be reviewed by our team.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* No Recommendations */}
                {recommendations.length === 0 && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                        <Info className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">Consultation Recommended</h3>
                        <p className="text-gray-600 mb-6">
                            Based on your unique profile, we recommend a personalized consultation to determine the best protocol for you.
                        </p>
                        <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                            Book Consultation
                        </button>
                    </div>
                )}

                {/* Next Steps */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Next Steps</h3>
                    <ol className="space-y-3">
                        <li className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">1</span>
                            <span className="text-gray-700">Review your personalized protocol above</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">2</span>
                            <span className="text-gray-700">Add recommended products to your cart</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">3</span>
                            <span className="text-gray-700">Our team will review your order and medical profile</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">4</span>
                            <span className="text-gray-700">Receive your peptides with full instructions and support</span>
                        </li>
                    </ol>
                </div>
            </div>
        </div>
    );
};

export default AssessmentResultsV2;

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Info, ArrowRight, Shield, ArrowLeft } from 'lucide-react';
import type { AssessmentResponse, RecommendationRule, Product } from '../types';

const AssessmentResults = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [assessment, setAssessment] = useState<AssessmentResponse | null>(null);
    const [recommendation, setRecommendation] = useState<{
        product: Product | null;
        educational_note: string;
        rule_name: string;
    }[] | null>(null);

    useEffect(() => {
        const init = async () => {
            // 1. Get Assessment Data from State (Passed from Wizard)
            const assessData = location.state?.assessmentData as AssessmentResponse;

            if (!assessData) {
                // If accessed directly without state, try to redirect
                navigate('/assessment');
                return;
            }

            try {
                setAssessment(assessData);

                // 2. Fetch Active Rules
                const { data: rules, error: rulesError } = await supabase
                    .from('recommendation_rules')
                    .select('*')
                    .eq('is_active', true)
                    .order('priority', { ascending: false });

                if (rulesError) throw rulesError;

                // 3. Find ALL matching rules (not just the first one)
                const matchedRules: RecommendationRule[] = [];

                if (rules && rules.length > 0) {
                    rules.forEach(rule => {
                        const expMatch = rule.target_experience === 'All' || rule.target_experience === assessData.experience_level;
                        const goalMatch = assessData.goals.some(g => g === rule.target_goal);

                        if (expMatch && goalMatch && rule.primary_product_id) {
                            matchedRules.push(rule);
                        }
                    });
                }

                // 4. Fetch products for ALL matched rules
                if (matchedRules.length > 0) {
                    const productIds = matchedRules.map(r => r.primary_product_id);
                    const { data: products, error: prodError } = await supabase
                        .from('products')
                        .select('*')
                        .in('id', productIds);

                    if (!prodError && products) {
                        // Create recommendation objects for each matched rule
                        const recs = matchedRules.map(rule => {
                            const product = products.find(p => p.id === rule.primary_product_id);
                            return product ? {
                                product,
                                educational_note: rule.educational_note || 'Based on your goals, this option is often explored for its potential benefits.',
                                rule_name: rule.rule_name
                            } : null;
                        }).filter(Boolean);

                        // Set all matched recommendations
                        if (recs.length > 0) {
                            setRecommendation(recs as any);
                        }
                    }
                }

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
                    <div className="w-12 h-12 border-4 border-theme-blue/30 border-t-theme-blue rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-medium">Analyzing your profile...</p>
                </div>
            </div>
        );
    }

    if (!assessment) return null; // Should have redirected

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-theme-navy text-white pt-8 pb-24 px-4 relative">
                <div className="max-w-7xl mx-auto mb-8">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 text-blue-200 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={20} />
                        <span className="font-medium">Back to Home</span>
                    </button>
                </div>
                <div className="max-w-4xl mx-auto text-center">
                    <span className="inline-block px-3 py-1 bg-white/10 rounded-full text-sm font-medium mb-4 backdrop-blur-sm">
                        Assessment Complete
                    </span>
                    <h1 className="text-3xl md:text-4xl font-bold mb-4">Your Personalized Insight</h1>
                    <p className="text-blue-200 max-w-2xl mx-auto">
                        Based on your goal of <span className="text-white font-medium">{assessment.goals.map(g => g.replace('_', ' ')).join(' & ')}</span>
                    </p>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 -mt-16">
                <div className="grid md:grid-cols-3 gap-6">

                    {/* Main Recommendation Card(s) */}
                    <div className="md:col-span-2 space-y-6">
                        {recommendation && recommendation.length > 0 ? (
                            recommendation.map((rec, index) => (
                                <div key={index} className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                                    <div className="bg-theme-blue p-1 h-2 w-full"></div>
                                    <div className="p-8">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <p className="text-sm font-bold text-theme-blue uppercase tracking-wide mb-1">
                                                    {index === 0 ? 'Primary Recommendation' : 'Additional Recommendation'}
                                                </p>
                                                <h2 className="text-2xl font-bold text-gray-900">
                                                    {rec.product?.name || 'General Consultation'}
                                                </h2>
                                            </div>
                                            {rec.product && (
                                                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                                                    High Match
                                                </span>
                                            )}
                                        </div>

                                        {rec.product && (
                                            <div className="space-y-6">
                                                <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                                                    <h3 className="flex items-center gap-2 font-bold text-gray-900 mb-3">
                                                        <Info size={18} className="text-theme-blue" />
                                                        Why this matches you
                                                    </h3>
                                                    <p className="text-gray-700 leading-relaxed text-sm">
                                                        {rec.educational_note}
                                                    </p>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="p-4 bg-gray-50 rounded-xl">
                                                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Concentration</p>
                                                        <p className="font-medium text-gray-900">{rec.product.name}</p>
                                                    </div>
                                                    <div className="p-4 bg-gray-50 rounded-xl">
                                                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Price</p>
                                                        <p className="font-medium text-gray-900">₱{rec.product.base_price?.toLocaleString()}</p>
                                                    </div>
                                                </div>

                                                <div className="pt-4 flex flex-col sm:flex-row gap-4">
                                                    {rec.product.available && rec.product.stock_quantity > 0 ? (
                                                        <button className="flex-1 bg-theme-blue text-white px-6 py-3 rounded-xl hover:bg-theme-navy transition-colors font-bold shadow-lg shadow-blue-900/10 flex items-center justify-center gap-2">
                                                            Add to Cart
                                                            <ArrowRight size={18} />
                                                        </button>
                                                    ) : (
                                                        <button disabled className="flex-1 bg-gray-100 text-gray-400 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 cursor-not-allowed">
                                                            Out of Stock
                                                        </button>
                                                    )}
                                                    <button className="flex-1 bg-white border-2 border-theme-blue text-theme-blue px-6 py-3 rounded-xl hover:bg-blue-50 transition-colors font-bold flex items-center justify-center gap-2">
                                                        View Details
                                                        <ArrowRight size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                                <div className="bg-theme-blue p-1 h-2 w-full"></div>
                                <div className="p-8 text-center py-8">
                                    <p className="text-gray-600 mb-6">
                                        We have analyzed your goals but recommend a more general approach or consultation for your specific case.
                                    </p>
                                    <button
                                        onClick={() => navigate('/')}
                                        className="bg-theme-blue text-white px-6 py-3 rounded-xl hover:bg-blue-700 font-bold"
                                    >
                                        Explore All Options
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Disclaimer Box */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex gap-4">
                            <Shield className="w-6 h-6 text-gray-400 flex-shrink-0" />
                            <div>
                                <h4 className="font-bold text-gray-900 mb-1">Important Safety Information</h4>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    This assessment provides educational information only and does not constitute medical advice or diagnosis.
                                    Peptides are for research purposes. Always consult with a qualified healthcare professional before starting any new protocol.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">Your Profile Summary</h3>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-bold">Goal</p>
                                    <ul className="mt-1 space-y-1">
                                        {assessment.goals.map(g => (
                                            <li key={g} className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 bg-theme-blue rounded-full" />
                                                {g.replace('_', ' ')}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-bold">Experience Level</p>
                                    <p className="text-sm font-medium text-gray-900 mt-1 capitalize">{assessment.experience_level.replace('_', ' ')}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-bold">Preferences</p>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {assessment.preferences.frequency && (
                                            <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">{assessment.preferences.frequency}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => navigate('/assessment')}
                                className="w-full mt-6 text-sm text-gray-500 hover:text-theme-blue underline"
                            >
                                Retake Assessment
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default AssessmentResults;

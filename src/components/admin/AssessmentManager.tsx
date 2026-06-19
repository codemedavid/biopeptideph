import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { listAssessmentResponses } from '../../lib/adminOrdersApi';
import {
    Download,
    Plus,
    Edit2,
    Trash2,
    AlertCircle,
    X
} from 'lucide-react';
import type { AssessmentResponse, RecommendationRule } from '../../types';
import { useMenu } from '../../hooks/useMenu';

interface AssessmentManagerProps {
    onBack: () => void;
}

const AssessmentManager: React.FC<AssessmentManagerProps> = ({ onBack }) => {
    const [activeTab, setActiveTab] = useState<'responses' | 'rules'>('responses');

    const handleExport = async () => {
        try {
            const data = await listAssessmentResponses();
            if (!data || data.length === 0) {
                alert('No data to export');
                return;
            }

            const headers = ['ID', 'Name', 'Email', 'Age', 'Location', 'Goals', 'Experience', 'Date', 'Status'];
            const csvRows = [headers.join(',')];

            data.forEach(row => {
                const values = [
                    row.id,
                    `"${row.full_name}"`,
                    row.email,
                    row.age_range,
                    `"${row.location}"`,
                    `"${row.goals.join('; ')}"`,
                    row.experience_level,
                    new Date(row.created_at).toLocaleDateString(),
                    row.status
                ];
                csvRows.push(values.join(','));
            });

            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `assessments_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export data');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-12">
            {/* Header */}
            <div className="bg-white shadow-sm border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={onBack}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                            >
                                <X size={20} />
                            </button>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">Assessment System</h1>
                                <p className="text-sm text-gray-500">Manage responses and recommendation logic</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            {activeTab === 'responses' && (
                                <button
                                    onClick={handleExport}
                                    className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
                                >
                                    <Download size={16} />
                                    Export CSV
                                </button>
                            )}
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setActiveTab('responses')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'responses'
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                >
                                    Responses
                                </button>
                                <button
                                    onClick={() => setActiveTab('rules')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'rules'
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                >
                                    Rules Engine
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {activeTab === 'responses' ? <ResponsesView /> : <RulesView />}
            </div>
        </div>
    );
};

// Sub-component: Responses View
const ResponsesView = () => {
    const [responses, setResponses] = useState<AssessmentResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStats, setFilterStats] = useState({ total: 0, new: 0 });
    const [selectedResponse, setSelectedResponse] = useState<AssessmentResponse | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [recommendations, setRecommendations] = useState<Array<{ product: any; rule: any }>>([]);
    const [loadingRecs, setLoadingRecs] = useState(false);

    useEffect(() => {
        fetchResponses();
    }, []);

    const fetchResponses = async () => {
        try {
            const data = await listAssessmentResponses();
            setResponses(data || []);
            setFilterStats({
                total: data?.length || 0,
                new: data?.filter(r => r.status === 'new').length || 0
            });
        } catch (error) {
            console.error('Error fetching responses:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetails = async (response: AssessmentResponse) => {
        setSelectedResponse(response);
        setShowDetailModal(true);
        setLoadingRecs(true);

        // Fetch recommendations for this user's goals
        try {
            const { data: rules } = await supabase
                .from('recommendation_rules')
                .select('*')
                .eq('is_active', true)
                .in('target_goal', response.goals);

            if (rules && rules.length > 0) {
                const productIds = rules.map(r => r.primary_product_id);
                const { data: products } = await supabase
                    .from('products')
                    .select('*')
                    .in('id', productIds);

                if (products) {
                    const recs = rules.map(rule => {
                        const product = products.find(p => p.id === rule.primary_product_id);
                        return { product, rule };
                    }).filter(r => r.product);

                    setRecommendations(recs);
                }
            }
        } catch (error) {
            console.error('Error fetching recommendations:', error);
        } finally {
            setLoadingRecs(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading responses...</div>;

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex flex-col">
                        <span className="text-sm text-gray-500 font-medium">Total Assessments</span>
                        <span className="text-2xl font-bold text-gray-900 mt-2">{filterStats.total}</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex flex-col">
                        <span className="text-sm text-gray-500 font-medium">New Submissions</span>
                        <span className="text-2xl font-bold text-theme-blue mt-2">{filterStats.new}</span>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Goals</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Experience</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {responses.map((response) => (
                                <tr key={response.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <button
                                                onClick={() => handleViewDetails(response)}
                                                className="font-medium text-theme-blue hover:text-theme-navy cursor-pointer text-left underline"
                                            >
                                                {response.full_name}
                                            </button>
                                            <span className="text-sm text-gray-500">{response.email}</span>
                                            <span className="text-xs text-gray-400">{response.location} • {response.age_range}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {response.goals.map(g => (
                                                <span key={g} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                                                    {g.replace('_', ' ')}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm text-gray-700 capitalize">
                                            {response.experience_level.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {new Date(response.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${response.status === 'new' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                            }`}>
                                            {response.status.toUpperCase()}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {responses.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                        No assessments submitted yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detail Modal */}
            {showDetailModal && selectedResponse && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                        {/* Header */}
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">{selectedResponse.full_name}</h2>
                                <p className="text-sm text-gray-500">{selectedResponse.email} • {selectedResponse.phone}</p>
                            </div>
                            <button
                                onClick={() => setShowDetailModal(false)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6">
                            {/* Demographics */}
                            <div className="border-b border-gray-200 pb-4">
                                <h3 className="font-bold text-gray-900 mb-3">Demographics</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <p className="text-xs text-gray-500">Age Range</p>
                                        <p className="font-medium">{selectedResponse.age_range}</p>
                                    </div>
                                    {selectedResponse.date_of_birth && (
                                        <div>
                                            <p className="text-xs text-gray-500">Date of Birth</p>
                                            <p className="font-medium">{new Date(selectedResponse.date_of_birth).toLocaleDateString()}</p>
                                        </div>
                                    )}
                                    {selectedResponse.sex_assigned && (
                                        <div>
                                            <p className="text-xs text-gray-500">Sex</p>
                                            <p className="font-medium capitalize">{selectedResponse.sex_assigned}</p>
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-xs text-gray-500">Location</p>
                                        <p className="font-medium">{selectedResponse.location}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Physical Metrics */}
                            {(selectedResponse.height_cm || selectedResponse.weight_kg) && (
                                <div className="border-b border-gray-200 pb-4">
                                    <h3 className="font-bold text-gray-900 mb-3">Physical Metrics</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {selectedResponse.height_cm && (
                                            <div>
                                                <p className="text-xs text-gray-500">Height</p>
                                                <p className="font-medium">{selectedResponse.height_cm} cm</p>
                                            </div>
                                        )}
                                        {selectedResponse.weight_kg && (
                                            <div>
                                                <p className="text-xs text-gray-500">Weight</p>
                                                <p className="font-medium">{selectedResponse.weight_kg} kg</p>
                                            </div>
                                        )}
                                        {selectedResponse.waist_inches && (
                                            <div>
                                                <p className="text-xs text-gray-500">Waist</p>
                                                <p className="font-medium">{selectedResponse.waist_inches}"</p>
                                            </div>
                                        )}
                                        {selectedResponse.weight_goal_kg && (
                                            <div>
                                                <p className="text-xs text-gray-500">Goal Weight</p>
                                                <p className="font-medium">{selectedResponse.weight_goal_kg} kg</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Goals & Motivators */}
                            <div className="border-b border-gray-200 pb-4">
                                <h3 className="font-bold text-gray-900 mb-3">Goals & Experience</h3>
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">Primary Goals</p>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedResponse.goals.map(g => (
                                                <span key={g} className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-medium">
                                                    {g.replace(/_/g, ' ')}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    {selectedResponse.emotional_motivators && selectedResponse.emotional_motivators.length > 0 && (
                                        <div>
                                            <p className="text-xs text-gray-500 mb-1">Motivators</p>
                                            <div className="flex flex-wrap gap-2">
                                                {selectedResponse.emotional_motivators.map(m => (
                                                    <span key={m} className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 text-sm">
                                                        {m}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-xs text-gray-500">Experience Level</p>
                                        <p className="font-medium capitalize">{selectedResponse.experience_level.replace('_', ' ')}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Medical History */}
                            {selectedResponse.medical_conditions && selectedResponse.medical_conditions.length > 0 && (
                                <div className="border-b border-gray-200 pb-4">
                                    <h3 className="font-bold text-gray-900 mb-3">Medical Conditions</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedResponse.medical_conditions.map(condition => (
                                            <span key={condition} className="px-3 py-1 rounded-full bg-red-100 text-red-800 text-sm">
                                                {condition}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Medications */}
                            {selectedResponse.current_medications && (
                                <div className="border-b border-gray-200 pb-4">
                                    <h3 className="font-bold text-gray-900 mb-3">Current Medications</h3>
                                    <p className="text-gray-700">{selectedResponse.current_medications}</p>
                                </div>
                            )}

                            {/* Lifestyle */}
                            <div className="border-b border-gray-200 pb-4">
                                <h3 className="font-bold text-gray-900 mb-3">Lifestyle</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {selectedResponse.smoking_status && (
                                        <div>
                                            <p className="text-xs text-gray-500">Smoking Status</p>
                                            <p className="font-medium capitalize">{selectedResponse.smoking_status.replace('_', ' ')}</p>
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-xs text-gray-500">Peptide Experience</p>
                                        <p className="font-medium">{selectedResponse.peptide_experience_first_time ? 'First Time' : 'Experienced'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Recommendations */}
                            <div className="border-b border-gray-200 pb-4">
                                <h3 className="font-bold text-gray-900 mb-3">Recommended Peptides</h3>
                                {loadingRecs ? (
                                    <p className="text-gray-500 text-sm">Loading recommendations...</p>
                                ) : recommendations.length > 0 ? (
                                    <div className="space-y-3">
                                        {recommendations.map((rec, idx) => (
                                            <div key={idx} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <h4 className="font-semibold text-gray-900">{rec.product.name}</h4>
                                                        <p className="text-sm text-gray-600 mt-1">{rec.rule.educational_note}</p>
                                                        <p className="text-xs text-gray-500 mt-2">
                                                            For goal: <span className="font-medium">{rec.rule.target_goal.replace(/_/g, ' ')}</span>
                                                        </p>
                                                    </div>
                                                    <span className="ml-4 font-bold text-blue-600">₱{rec.product.base_price?.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-sm">No specific recommendations available for selected goals.</p>
                                )}
                            </div>

                            {/* Timestamp */}
                            <div className="text-sm text-gray-500">
                                <p>Submitted: {new Date(selectedResponse.created_at).toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Sub-component: Rules Engine View
const RulesView = () => {
    const [rules, setRules] = useState<RecommendationRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editingRule, setEditingRule] = useState<Partial<RecommendationRule>>({});
    const { products } = useMenu(); // Fetch products for dropdowns

    useEffect(() => {
        fetchRules();
    }, []);

    const fetchRules = async () => {
        try {
            const { data, error } = await supabase
                .from('recommendation_rules')
                .select('*')
                .order('priority', { ascending: false });

            if (error) throw error;
            setRules(data || []);
        } catch (error) {
            console.error('Error fetching rules:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveRule = async () => {
        try {
            if (!editingRule.target_goal) {
                alert('Target Goal is required');
                return;
            }

            const payload = {
                rule_name: editingRule.rule_name || 'New Rule',
                target_goal: editingRule.target_goal,
                target_experience: editingRule.target_experience || 'All',
                primary_product_id: editingRule.primary_product_id || null,
                secondary_product_ids: editingRule.secondary_product_ids || [],
                educational_note: editingRule.educational_note || '',
                priority: editingRule.priority || 0,
                is_active: editingRule.is_active ?? true
            };

            if (editingRule.id) {
                await supabase.from('recommendation_rules').update(payload).eq('id', editingRule.id);
            } else {
                await supabase.from('recommendation_rules').insert([payload]);
            }

            setIsEditing(false);
            setEditingRule({});
            fetchRules();
        } catch (error) {
            console.error('Error saving rule:', error);
            alert('Failed to save rule');
        }
    };

    const handleDeleteRule = async (id: string) => {
        if (!confirm('Are you sure you want to delete this rule?')) return;
        try {
            await supabase.from('recommendation_rules').delete().eq('id', id);
            fetchRules();
        } catch (error) {
            console.error('Error deleting rule:', error);
        }
    };

    if (isEditing) {
        return (
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 max-w-2xl mx-auto">
                <h2 className="text-xl font-bold mb-6">{editingRule.id ? 'Edit Rule' : 'Create New Logic Rule'}</h2>

                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
                            <input
                                value={editingRule.rule_name || ''}
                                onChange={e => setEditingRule({ ...editingRule, rule_name: e.target.value })}
                                className="w-full p-2 border rounded-lg"
                                placeholder="e.g. Weight Loss Beginner"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Priority (Higher runs first)</label>
                            <input
                                type="number"
                                value={editingRule.priority || 0}
                                onChange={e => setEditingRule({ ...editingRule, priority: Number(e.target.value) })}
                                className="w-full p-2 border rounded-lg"
                            />
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 mb-4">IF User Selects:</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Goal</label>
                                <select
                                    value={editingRule.target_goal || ''}
                                    onChange={e => setEditingRule({ ...editingRule, target_goal: e.target.value })}
                                    className="w-full p-2 border rounded-lg"
                                >
                                    <option value="">Select Goal...</option>
                                    <option value="weight_management">Weight Management</option>
                                    <option value="energy_recovery">Energy & Recovery</option>
                                    <option value="wellness_longevity">Wellness / Longevity</option>
                                    <option value="body_composition">Body Composition</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Experience Level</label>
                                <select
                                    value={editingRule.target_experience || 'All'}
                                    onChange={e => setEditingRule({ ...editingRule, target_experience: e.target.value })}
                                    className="w-full p-2 border rounded-lg"
                                >
                                    <option value="All">All Levels</option>
                                    <option value="first_time">First-time User</option>
                                    <option value="beginner">Beginner</option>
                                    <option value="experienced">Experienced</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                        <h3 className="text-sm font-bold text-gray-900 mb-4">THEN Recommend:</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Product</label>
                                <select
                                    value={editingRule.primary_product_id || ''}
                                    onChange={e => setEditingRule({ ...editingRule, primary_product_id: e.target.value })}
                                    className="w-full p-2 border rounded-lg"
                                >
                                    <option value="">Select Product...</option>
                                    {products.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Educational Note</label>
                                <textarea
                                    value={editingRule.educational_note || ''}
                                    onChange={e => setEditingRule({ ...editingRule, educational_note: e.target.value })}
                                    className="w-full p-2 border rounded-lg h-24"
                                    placeholder="Explain why this fits (non-medical)..."
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="px-4 py-2 text-gray-600 hover:text-gray-900"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveRule}
                            className="px-6 py-2 bg-theme-blue text-white rounded-lg hover:bg-blue-700 font-medium"
                        >
                            Save Rule
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900">Recommendation Logic</h2>
                <button
                    onClick={() => { setEditingRule({}); setIsEditing(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-theme-blue text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                    <Plus size={18} />
                    Add New Rule
                </button>
            </div>

            <div className="grid gap-4">
                {rules.map(rule => (
                    <div key={rule.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center group hover:border-blue-200 transition-all">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                                <h3 className="font-bold text-gray-900">{rule.rule_name}</h3>
                                <span className={`px - 2 py - 0.5 rounded text - xs font - medium ${rule.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'} `}>
                                    {rule.is_active ? 'Active' : 'Inactive'}
                                </span>
                                <span className="text-xs text-gray-400">Pri: {rule.priority}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-gray-600">
                                <span className="bg-gray-100 px-2 rounded">Goal: {rule.target_goal.replace('_', ' ')}</span>
                                <span>+</span>
                                <span className="bg-gray-100 px-2 rounded">Exp: {rule.target_experience}</span>
                                <span>→</span>
                                <span className="font-medium text-theme-blue">
                                    {products.find(p => p.id === rule.primary_product_id)?.name || 'Unknown Product'}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => { setEditingRule(rule); setIsEditing(true); }}
                                className="p-2 text-gray-400 hover:text-blue-600 rounded-full hover:bg-blue-50"
                            >
                                <Edit2 size={18} />
                            </button>
                            <button
                                onClick={() => handleDeleteRule(rule.id)}
                                className="p-2 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                ))}

                {rules.length === 0 && !loading && (
                    <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                        <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500 font-medium">No rules defined yet.</p>
                        <p className="text-sm text-gray-400">Create a rule to start recommending products based on user answers.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AssessmentManager;

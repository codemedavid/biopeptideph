import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Check, AlertCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePricingMode } from '../hooks/usePricingMode';

interface AssessmentState {
    full_name: string;
    email: string;
    age_range: string;
    location: string;
    goals: string[];
    other_goal: string;
    experience_level: string;
    preferences: {
        budget: string;
        frequency: string;
    };
    consent: {
        medical_advice: boolean;
        age_confirm: boolean;
        terms: boolean;
    };
}

const INITIAL_STATE: AssessmentState = {
    full_name: '',
    email: '',
    age_range: '',
    location: '',
    goals: [],
    other_goal: '',
    experience_level: '',
    preferences: {
        budget: '',
        frequency: ''
    },
    consent: {
        medical_advice: false,
        age_confirm: false,
        terms: false
    }
};

const AssessmentWizard = () => {
    const navigate = useNavigate();
    const { currencySymbol, isInternational } = usePricingMode();
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<AssessmentState>(INITIAL_STATE);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const totalSteps = 5;

    const updateField = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const updateNestedField = (parent: 'preferences' | 'consent', field: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [parent]: { ...prev[parent], [field]: value }
        }));
    };

    const toggleGoal = (goal: string) => {
        setFormData(prev => {
            const current = prev.goals;
            if (current.includes(goal)) {
                return { ...prev, goals: current.filter(g => g !== goal) };
            }
            return { ...prev, goals: [...current, goal] };
        });
    };

    const validateStep = (currentStep: number): boolean => {
        switch (currentStep) {
            case 1:
                return !!(formData.full_name && formData.email && formData.age_range && formData.location);
            case 2:
                return formData.goals.length > 0 || !!formData.other_goal;
            case 3:
                return !!formData.experience_level;
            case 4:
                return !!formData.preferences.frequency;
            case 5:
                return formData.consent.medical_advice && formData.consent.age_confirm && formData.consent.terms;
            default:
                return false;
        }
    };

    const handleNext = () => {
        if (validateStep(step)) {
            setStep(prev => Math.min(prev + 1, totalSteps));
            setError(null);
        } else {
            setError('Please complete all required fields to proceed.');
        }
    };

    const handleBack = () => {
        setStep(prev => Math.max(prev - 1, 1));
        setError(null);
    };

    const handleSubmit = async () => {
        if (!validateStep(5)) return;

        setIsSubmitting(true);
        try {
            // Combine "Other" goal into goals array for storage if present
            const finalGoals = [...formData.goals];
            if (formData.other_goal) {
                finalGoals.push(`other_${formData.other_goal}`);
            }

            const { data, error: dbError } = await supabase
                .from('assessment_responses')
                .insert([{
                    full_name: formData.full_name,
                    email: formData.email,
                    age_range: formData.age_range,
                    location: formData.location,
                    goals: finalGoals,
                    experience_level: formData.experience_level,
                    preferences: formData.preferences,
                    consent_agreed: true,
                    status: 'new'
                }]);

            if (dbError) throw dbError;

            // Navigate to results with form data since we can't select (RLS)
            // Include computed finalGoals in the data passed
            const assessmentData = {
                ...formData,
                goals: finalGoals
            };

            navigate('/assessment/results', { state: { assessmentData } });
        } catch (err) {
            console.error('Submission error:', err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(`Failed to submit: ${errorMessage}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                <div className="max-w-3xl mx-auto px-4 h-16 flex justify-between items-center">
                    <div>
                        <h1 className="font-bold text-gray-900 text-lg">Peptide Assessment</h1>
                        <p className="text-xs text-gray-500 hidden sm:block">Guide your journey. Not medical advice.</p>
                    </div>
                    <div className="text-sm text-gray-500 font-medium">Step {step} of {totalSteps}</div>
                </div>
                {/* Progress Bar */}
                <div className="w-full h-1 bg-gray-100">
                    <div
                        className="h-full bg-theme-blue transition-all duration-300 ease-out"
                        style={{ width: `${(step / totalSteps) * 100}%` }}
                    />
                </div>
            </header>

            <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
                <div className="text-center mb-10">
                    <h2 className="text-3xl font-bold text-theme-navy mb-2">Help us understand your goals</h2>
                    <p className="text-gray-500">This assessment helps guide your peptide journey.</p>
                </div>

                {error && (
                    <div className="mb-6 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl flex items-center gap-2 text-sm">
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 min-h-[400px]">
                    {/* Step 1: Basic Info */}
                    {step === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-gray-900 mb-1">Basic Information</h3>
                                <p className="text-sm text-gray-500">Tell us a bit about yourself.</p>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Full Name</label>
                                    <input
                                        type="text"
                                        value={formData.full_name}
                                        onChange={e => updateField('full_name', e.target.value)}
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-theme-blue/20 focus:border-theme-blue outline-none transition-all"
                                        placeholder="John Doe"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Email Address</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={e => updateField('email', e.target.value)}
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-theme-blue/20 focus:border-theme-blue outline-none transition-all"
                                        placeholder="john@example.com"
                                    />
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Age Range</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {['18-24', '25-34', '35-44', '45+'].map(bg => (
                                            <button
                                                key={bg}
                                                onClick={() => updateField('age_range', bg)}
                                                className={`p-3 rounded-xl border text-sm font-medium transition-all ${formData.age_range === bg
                                                    ? 'border-theme-blue bg-blue-50 text-theme-blue'
                                                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                                    }`}
                                            >
                                                {bg}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Location</label>
                                    <input
                                        type="text"
                                        value={formData.location}
                                        onChange={e => updateField('location', e.target.value)}
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-theme-blue/20 focus:border-theme-blue outline-none transition-all"
                                        placeholder="Country / City"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Goals */}
                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-gray-900 mb-1">Goals & Intent</h3>
                                <p className="text-sm text-gray-500">What is your primary goal? (Select all that apply)</p>
                            </div>

                            <div className="grid gap-3">
                                {[
                                    { id: 'weight_management', label: 'Weight management' },
                                    { id: 'energy_recovery', label: 'Energy & recovery' },
                                    { id: 'wellness_longevity', label: 'Wellness / longevity' },
                                    { id: 'body_composition', label: 'Body composition' }
                                ].map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => toggleGoal(item.id)}
                                        className={`flex items-center p-4 rounded-xl border text-left transition-all ${formData.goals.includes(item.id)
                                            ? 'border-theme-blue bg-blue-50 ring-1 ring-theme-blue'
                                            : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'
                                            }`}
                                    >
                                        <div className={`w-6 h-6 rounded-full border flex items-center justify-center mr-4 transition-colors ${formData.goals.includes(item.id) ? 'bg-theme-blue border-theme-blue' : 'border-gray-300'
                                            }`}>
                                            {formData.goals.includes(item.id) && <Check size={14} className="text-white" />}
                                        </div>
                                        <span className={`font-medium ${formData.goals.includes(item.id) ? 'text-theme-blue' : 'text-gray-900'}`}>
                                            {item.label}
                                        </span>
                                    </button>
                                ))}

                                {/* Other Field */}
                                <div className="pt-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Other</label>
                                    <input
                                        type="text"
                                        value={formData.other_goal}
                                        onChange={e => updateField('other_goal', e.target.value)}
                                        className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-theme-blue/20 focus:border-theme-blue outline-none transition-all bg-gray-50"
                                        placeholder="Please specify..."
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Experience */}
                    {step === 3 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-gray-900 mb-1">Experience Level</h3>
                                <p className="text-sm text-gray-500">What best describes your peptide experience?</p>
                            </div>

                            <div className="grid gap-3">
                                {[
                                    'First-time user',
                                    'Beginner',
                                    'Experienced',
                                    'Previously used GLP-1 / peptides'
                                ].map(label => {
                                    const id = label.toLowerCase().replace(/ /g, '_').replace(/\//g, '').replace(/_+/g, '_'); // simple slugify
                                    return (
                                        <button
                                            key={id}
                                            onClick={() => updateField('experience_level', id)}
                                            className={`flex items-center p-4 rounded-xl border text-left transition-all ${formData.experience_level === id
                                                ? 'border-theme-blue bg-blue-50 ring-1 ring-theme-blue'
                                                : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'
                                                }`}
                                        >
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center mr-4 transition-colors ${formData.experience_level === id ? 'border-theme-blue' : 'border-gray-300'
                                                }`}>
                                                {formData.experience_level === id && <div className="w-2.5 h-2.5 bg-theme-blue rounded-full" />}
                                            </div>
                                            <span className={`font-medium ${formData.experience_level === id ? 'text-theme-blue' : 'text-gray-900'}`}>
                                                {label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Step 4: Preferences */}
                    {step === 4 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-gray-900 mb-1">Preferences</h3>
                                <p className="text-sm text-gray-500">Help us tailor the recommendations.</p>
                            </div>

                            <div className="space-y-6">


                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-3">Budget Range (Optional)</label>
                                    <select
                                        value={formData.preferences.budget}
                                        onChange={e => updateNestedField('preferences', 'budget', e.target.value)}
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-theme-blue/20 focus:border-theme-blue outline-none"
                                    >
                                        <option value="">Select a range...</option>
                                        <option value="low">{isInternational ? 'Under $100' : 'Under ₱5,000'}</option>
                                        <option value="medium">{isInternational ? '$100 - $200' : '₱5,000 - ₱10,000'}</option>
                                        <option value="high">{isInternational ? '$200+' : '₱10,000+'}</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-3">Preferred frequency / consistency</label>
                                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                        {['Daily', 'Weekly', 'Monthly'].map(opt => (
                                            <button
                                                key={opt}
                                                onClick={() => updateNestedField('preferences', 'frequency', opt)}
                                                className={`p-3 rounded-xl border text-sm font-medium transition-all ${formData.preferences.frequency === opt
                                                    ? 'border-theme-blue bg-blue-50 text-theme-blue'
                                                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                                    }`}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                </div>


                            </div>
                        </div>
                    )}

                    {/* Step 5: Consent */}
                    {step === 5 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="text-center mb-8">
                                <div className="w-16 h-16 bg-blue-50 text-theme-blue rounded-full flex items-center justify-center mx-auto mb-4">
                                    <ShieldCheck size={32} />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900">One last thing</h2>
                                <p className="text-gray-500">Please confirm the following to view your guide.</p>
                            </div>

                            <div className="space-y-4 max-w-lg mx-auto">
                                {[
                                    { key: 'medical_advice', text: 'I understand this is not medical advice.' },
                                    { key: 'age_confirm', text: 'I confirm I am 18 years old or above.' },
                                    { key: 'terms', text: 'I agree to the Terms & Privacy Policy.' }
                                ].map(check => (
                                    <label key={check.key} className="flex items-start p-4 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                                        <div className={`w-5 h-5 rounded border mt-0.5 mr-3 flex items-center justify-center transition-colors ${(formData.consent as any)[check.key] ? 'bg-theme-blue border-theme-blue' : 'border-gray-300 bg-white'
                                            }`}>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={(formData.consent as any)[check.key]}
                                                onChange={e => updateNestedField('consent', check.key, e.target.checked)}
                                            />
                                            {(formData.consent as any)[check.key] && <Check size={14} className="text-white" />}
                                        </div>
                                        <span className="text-sm text-gray-700 font-medium leading-relaxed">{check.text}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Navigation */}
                <div className="max-w-3xl mx-auto mt-8 flex justify-between items-center">
                    <button
                        onClick={handleBack}
                        disabled={step === 1 || isSubmitting}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${step === 1 ? 'opacity-0 pointer-events-none' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                            }`}
                    >
                        <ArrowLeft size={18} />
                        Back
                    </button>

                    <button
                        onClick={step === totalSteps ? handleSubmit : handleNext}
                        disabled={isSubmitting}
                        className="flex items-center gap-2 px-8 py-3 bg-theme-blue text-white rounded-xl hover:bg-blue-700 transition-all font-medium shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed min-w-[140px] justify-center"
                    >
                        {isSubmitting ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                {step === totalSteps ? 'Submit Assessment' : 'Next Step'}
                                <ArrowRight size={18} />
                            </>
                        )}
                    </button>
                </div>
            </main>
        </div>
    );
};

export default AssessmentWizard;

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface FormData {
    // Step 1: Consent
    consent_agreed: boolean;

    // Step 2: Emotional Motivators
    emotional_motivators: string[];

    // Step 3: Specific Goals
    goals: string[];
    weight_goal_range?: string;
    energy_level?: string;
    body_composition_goal?: string;

    // Step 4: Physical Metrics
    height_cm: string;
    weight_kg: string;
    waist_inches: string;
    hip_inches: string;

    // Step 5: Demographics
    date_of_birth: string;
    sex_assigned: 'male' | 'female' | 'other' | '';
    age_range: string;
    location: string;

    // Step 6: Pregnancy/Reproductive
    pregnancy_status: string[];

    // Step 7: Medical History
    medical_conditions: string[];

    // Step 8: Family History
    family_history_conditions: string[];

    // Step 9: Current Medications
    current_medications: string;
    previous_surgeries: boolean | null;
    previous_surgeries_details?: string;
    drug_allergies: boolean | null;
    drug_allergies_details?: string;

    // Step 10: Lifestyle & Experience
    experience_level: string;
    peptide_experience_first_time: boolean | null;
    current_prescription_glp1: boolean | null;
    smoking_status: 'smoker' | 'non_smoker' | 'other' | '';

    // Step 11: Preferences
    preferences: {
        budget?: string;
        frequency?: string;
    };

    // Step 12: Contact
    full_name: string;
    email: string;
    phone: string;
    final_consent: boolean;
}

export default function AssessmentWizardV2() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const totalSteps = 12;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState<FormData>({
        consent_agreed: false,
        emotional_motivators: [],
        goals: [],
        height_cm: '',
        weight_kg: '',
        waist_inches: '',
        hip_inches: '',
        date_of_birth: '',
        sex_assigned: '',
        age_range: '',
        location: '',
        pregnancy_status: [],
        medical_conditions: [],
        family_history_conditions: [],
        current_medications: '',
        previous_surgeries: null,
        previous_surgeries_details: '',
        drug_allergies: null,
        drug_allergies_details: '',
        experience_level: '',
        peptide_experience_first_time: null,
        current_prescription_glp1: null,
        smoking_status: '',
        preferences: {},
        full_name: '',
        email: '',
        phone: '',
        final_consent: false,
    });

    const toggleArrayItem = (field: keyof FormData, value: string) => {
        const currentArray = formData[field] as string[];
        if (currentArray.includes(value)) {
            setFormData({
                ...formData,
                [field]: currentArray.filter((item) => item !== value),
            });
        } else {
            setFormData({
                ...formData,
                [field]: [...currentArray, value],
            });
        }
    };

    const validateStep = (currentStep: number): boolean => {
        setError(null);

        switch (currentStep) {
            case 1:
                if (!formData.consent_agreed) {
                    setError('Please agree to the terms to continue.');
                    return false;
                }
                break;
            case 2:
                if (formData.emotional_motivators.length === 0) {
                    setError('Please select at least one motivator.');
                    return false;
                }
                break;
            case 3:
                if (formData.goals.length === 0) {
                    setError('Please select at least one goal.');
                    return false;
                }
                break;
            case 4:
                if (!formData.height_cm || !formData.weight_kg) {
                    setError('Please enter your height and weight.');
                    return false;
                }
                break;
            case 5:
                if (!formData.date_of_birth || !formData.sex_assigned || !formData.location) {
                    setError('Please complete all required fields.');
                    return false;
                }
                // Validate age >= 18
                const age = new Date().getFullYear() - new Date(formData.date_of_birth).getFullYear();
                if (age < 18) {
                    setError('You must be at least 18 years old to continue.');
                    return false;
                }
                break;
            case 10:
                if (!formData.experience_level || !formData.smoking_status) {
                    setError('Please complete all required fields.');
                    return false;
                }
                break;
            case 12:
                if (!formData.full_name || !formData.email || !formData.final_consent) {
                    setError('Please complete all required fields and agree to final consent.');
                    return false;
                }
                break;
        }

        return true;
    };

    const handleNext = () => {
        if (validateStep(step)) {
            setStep((prev) => Math.min(prev + 1, totalSteps));
            setError(null);
        }
    };

    const handleBack = () => {
        setStep((prev) => Math.max(prev - 1, 1));
        setError(null);
    };

    const handleSubmit = async () => {
        if (!validateStep(12)) return;

        setIsSubmitting(true);
        try {
            // Calculate age_range from date_of_birth
            const age = new Date().getFullYear() - new Date(formData.date_of_birth).getFullYear();
            let age_range = '45+';
            if (age >= 18 && age <= 24) age_range = '18-24';
            else if (age >= 25 && age <= 34) age_range = '25-34';
            else if (age >= 35 && age <= 44) age_range = '35-44';

            // Prepare data for insertion
            const insertData = {
                full_name: formData.full_name,
                email: formData.email,
                phone: formData.phone || null,
                age_range,
                date_of_birth: formData.date_of_birth,
                sex_assigned: formData.sex_assigned,
                location: formData.location,
                height_cm: parseFloat(formData.height_cm),
                weight_kg: parseFloat(formData.weight_kg),
                waist_inches: formData.waist_inches ? parseFloat(formData.waist_inches) : null,
                hip_inches: formData.hip_inches ? parseFloat(formData.hip_inches) : null,
                goals: formData.goals,
                emotional_motivators: formData.emotional_motivators,
                experience_level: formData.experience_level,
                peptide_experience_first_time: formData.peptide_experience_first_time,
                current_prescription_glp1: formData.current_prescription_glp1,
                medical_conditions: formData.medical_conditions,
                family_history_conditions: formData.family_history_conditions,
                current_medications: formData.current_medications || null,
                previous_surgeries: formData.previous_surgeries,
                previous_surgeries_details: formData.previous_surgeries_details || null,
                drug_allergies: formData.drug_allergies,
                drug_allergies_details: formData.drug_allergies_details || null,
                smoking_status: formData.smoking_status,
                pregnancy_status: formData.pregnancy_status,
                preferences: formData.preferences,
                consent_agreed: true,
                status: 'new',
            };

            const { error: dbError } = await supabase
                .from('assessment_responses')
                .insert([insertData]);

            if (dbError) throw dbError;

            // Navigate to results with form data
            navigate('/assessment/results', { state: { assessmentData: insertData } });
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
                        <p className="text-xs text-gray-500 hidden sm:block">
                            Personalized recommendations for your health journey
                        </p>
                    </div>
                    <div className="text-sm text-gray-500 font-medium">
                        Step {step} of {totalSteps}
                    </div>
                </div>
            </header>

            {/* Progress Bar */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-3xl mx-auto px-4 py-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(step / totalSteps) * 100}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 md:p-8">
                    {renderStep()}
                </div>
            </div>

            {/* Footer Navigation */}
            <div className="bg-white border-t border-gray-200 sticky bottom-0">
                <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between items-center">
                    <button
                        type="button"
                        onClick={handleBack}
                        disabled={step === 1}
                        className="flex items-center gap-2 px-4 py-2 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 rounded-lg transition"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Back
                    </button>

                    {error && (
                        <p className="text-red-600 text-sm text-center max-w-md">{error}</p>
                    )}

                    {step < totalSteps ? (
                        <button
                            type="button"
                            onClick={handleNext}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                            Next
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                        >
                            {isSubmitting ? 'Submitting...' : 'Complete Assessment'}
                            <Check className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    function renderStep() {
        switch (step) {
            case 1:
                return renderStep1Consent();
            case 2:
                return renderStep2EmotionalMotivators();
            case 3:
                return renderStep3Goals();
            case 4:
                return renderStep4PhysicalMetrics();
            case 5:
                return renderStep5Demographics();
            case 6:
                return renderStep6Pregnancy();
            case 7:
                return renderStep7MedicalHistory();
            case 8:
                return renderStep8FamilyHistory();
            case 9:
                return renderStep9Medications();
            case 10:
                return renderStep10Lifestyle();
            case 11:
                return renderStep11Preferences();
            case 12:
                return renderStep12Contact();
            default:
                return null;
        }
    }

    // Step 1: Consent & Terms
    function renderStep1Consent() {
        return (
            <div className="space-y-6">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold text-xl mb-4">
                        1
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        Thank you for choosing Biopeptides!
                    </h2>
                    <p className="text-gray-600">
                        Let's start by reviewing our terms and consent
                    </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                    <p className="text-sm text-gray-700 leading-relaxed">
                        By clicking "I accept," you agree to our{' '}
                        <a href="/terms" className="text-blue-600 underline" target="_blank">
                            Terms and Conditions
                        </a>{', '}
                        <a href="/privacy" className="text-blue-600 underline" target="_blank">
                            Privacy Policy
                        </a>
                        , and consent to receive personalized peptide recommendations based on the information you provide.
                    </p>

                    <p className="text-sm text-gray-700 leading-relaxed">
                        <strong>Important:</strong> This assessment is for educational and informational purposes only.
                        It does not constitute medical advice. Always consult with a qualified healthcare provider
                        before starting any new health regimen.
                    </p>

                    <div className="pt-4">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.consent_agreed}
                                onChange={(e) =>
                                    setFormData({ ...formData, consent_agreed: e.target.checked })
                                }
                                className="mt-1 w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">
                                I accept the terms and conditions and understand that this is not medical advice
                            </span>
                        </label>
                    </div>
                </div>
            </div>
        );
    }

    // Step 2: Emotional Motivators
    function renderStep2EmotionalMotivators() {
        const motivators = [
            { value: 'energy', label: 'Having more energy' },
            { value: 'confidence', label: 'Feeling more confident' },
            { value: 'health', label: 'Improving overall health' },
            { value: 'body_image', label: 'Feeling better in my body' },
            { value: 'clothes', label: 'Feeling good in clothes' },
            { value: 'longevity', label: 'Living a longer, healthier life' },
        ];

        return (
            <div className="space-y-6">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold text-xl mb-4">
                        2
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        What would reaching your goal mean for you?
                    </h2>
                    <p className="text-gray-600">Choose as many as you like</p>
                </div>

                <div className="space-y-3">
                    {motivators.map((motivator) => (
                        <button
                            key={motivator.value}
                            type="button"
                            onClick={() => toggleArrayItem('emotional_motivators', motivator.value)}
                            className={`w-full text-left px-6 py-4 rounded-lg border-2 transition-all ${formData.emotional_motivators.includes(motivator.value)
                                ? 'border-blue-600 bg-blue-50 text-blue-900'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            {motivator.label}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // Step 3: Specific Goals
    function renderStep3Goals() {
        const weightGoals = [
            { value: 'weight_5_10kg', label: 'Lose 5-10 kg' },
            { value: 'weight_10_20kg', label: 'Lose 10-20 kg' },
            { value: 'weight_20plus', label: 'Lose 20+ kg' },
            { value: 'weight_maintain', label: 'Maintain current weight' },
        ];

        const otherGoals = [
            { value: 'energy_mild', label: 'Mild fatigue / Energy boost' },
            { value: 'energy_chronic', label: 'Chronic fatigue recovery' },
            { value: 'recovery_athletic', label: 'Athletic recovery' },
            { value: 'muscle_building', label: 'Build muscle mass' },
            { value: 'body_recomposition', label: 'Body recomposition' },
            { value: 'anti_aging', label: 'Anti-aging / Longevity' },
            { value: 'cognitive_function', label: 'Cognitive enhancement' },
            { value: 'immune_support', label: 'Immune system support' },
        ];

        return (
            <div className="space-y-6">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold text-xl mb-4">
                        3
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">What are your specific goals?</h2>
                    <p className="text-gray-600">Select all that apply</p>
                </div>

                <div className="space-y-4">
                    <div>
                        <h3 className="font-semibold text-gray-900 mb-3">Weight Management</h3>
                        <div className="space-y-2">
                            {weightGoals.map((goal) => (
                                <button
                                    key={goal.value}
                                    type="button"
                                    onClick={() => toggleArrayItem('goals', goal.value)}
                                    className={`w-full text-left px-6 py-3 rounded-lg border-2 transition-all ${formData.goals.includes(goal.value)
                                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    {goal.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="font-semibold text-gray-900 mb-3">Other Health Goals</h3>
                        <div className="space-y-2">
                            {otherGoals.map((goal) => (
                                <button
                                    key={goal.value}
                                    type="button"
                                    onClick={() => toggleArrayItem('goals', goal.value)}
                                    className={`w-full text-left px-6 py-3 rounded-lg border-2 transition-all ${formData.goals.includes(goal.value)
                                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    {goal.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Step 4: Physical Metrics
    function renderStep4PhysicalMetrics() {
        return (
            <div className="space-y-6">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold text-xl mb-4">
                        4
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Physical Measurements</h2>
                    <p className="text-gray-600">Help us understand your current metrics</p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Height (in cm) *
                        </label>
                        <input
                            type="number"
                            value={formData.height_cm}
                            onChange={(e) => setFormData({ ...formData, height_cm: e.target.value })}
                            placeholder="159"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Current Weight (in kg) *
                        </label>
                        <input
                            type="number"
                            value={formData.weight_kg}
                            onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value })}
                            placeholder="80"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Waist Size (in inches) - Optional
                        </label>
                        <input
                            type="number"
                            value={formData.waist_inches}
                            onChange={(e) => setFormData({ ...formData, waist_inches: e.target.value })}
                            placeholder="29"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Hip Size (in inches) - Optional
                        </label>
                        <input
                            type="number"
                            value={formData.hip_inches}
                            onChange={(e) => setFormData({ ...formData, hip_inches: e.target.value })}
                            placeholder="38"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>
            </div>
        );
    }

    // Step 5: Demographics
    function renderStep5Demographics() {
        return (
            <div className="space-y-6">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold text-xl mb-4">
                        5
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Basic Information</h2>
                    <p className="text-gray-600">Help us personalize your recommendations</p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Date of Birth *
                        </label>
                        <p className="text-xs text-gray-500 mb-2">
                            You must be at least 18 years old to use peptide therapy
                        </p>
                        <input
                            type="date"
                            value={formData.date_of_birth}
                            onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Sex Assigned at Birth *
                        </label>
                        <div className="space-y-2">
                            {['male', 'female', 'other'].map((sex) => (
                                <button
                                    key={sex}
                                    type="button"
                                    onClick={() =>
                                        setFormData({
                                            ...formData,
                                            sex_assigned: sex as 'male' | 'female' | 'other',
                                        })
                                    }
                                    className={`w-full text-left px-6 py-3 rounded-lg border-2 capitalize transition-all ${formData.sex_assigned === sex
                                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    {sex}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Location *</label>
                        <input
                            type="text"
                            value={formData.location}
                            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                            placeholder="e.g., Metro Manila, Philippines"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>
            </div>
        );
    }

    // Step 6: Pregnancy/Reproductive
    function renderStep6Pregnancy() {
        const options = [
            { value: 'breastfeeding', label: 'Breastfeeding' },
            { value: 'pregnant', label: 'Pregnant' },
            { value: 'planning_pregnancy', label: 'Planning to be pregnant in the next 2 months' },
            { value: 'none', label: 'None of the above' },
        ];

        return (
            <div className="space-y-6">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold text-xl mb-4">
                        6
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Are you currently:</h2>
                    <p className="text-gray-600">Select all that apply</p>
                </div>

                <div className="space-y-3">
                    {options.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => toggleArrayItem('pregnancy_status', option.value)}
                            className={`w-full text-left px-6 py-4 rounded-lg border-2 transition-all ${formData.pregnancy_status.includes(option.value)
                                ? 'border-blue-600 bg-blue-50 text-blue-900'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // Step 7: Medical History
    function renderStep7MedicalHistory() {
        const conditions = [
            'Medullary Thyroid Carcinoma / Multiple Endocrine Neoplasia',
            'Thyroid Problems (goiter, Graves\' disease, hypothyroid, hyperthyroid)',
            'Thyroid Cancer',
            'Pancreatitis',
            'Gallbladder problems',
            'Gallstones',
            'Low blood sugar',
            'Kidney Problems',
            'Vision Changes (Diabetic Retinopathy)',
            'Hypersensitivity to peptides',
            'Heart Problems (abnormal rhythms, disease, attack, failure)',
            'Mental Health Problems (severe anxiety, depression, schizophrenia, personality disorders)',
            'Eating Disorder (anorexia, bulimia, binge eating)',
            'Severe Gastro-Intestinal Problems (IBD, gastroparesis)',
            'Liver Problems (hepatitis, fatty liver, alcohol liver disease)',
            'None of the above',
        ];

        return (
            <div className="space-y-6">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold text-xl mb-4">
                        7
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        Do you have a medical history of the following conditions?
                    </h2>
                    <p className="text-gray-600">Select all that apply</p>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {conditions.map((condition) => (
                        <button
                            key={condition}
                            type="button"
                            onClick={() => toggleArrayItem('medical_conditions', condition)}
                            className={`w-full text-left px-6 py-3 rounded-lg border-2 transition-all ${formData.medical_conditions.includes(condition)
                                ? 'border-blue-600 bg-blue-50 text-blue-900'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            {condition}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // Step 8: Family History
    function renderStep8FamilyHistory() {
        const conditions = [
            'Thyroid cancer or disorders',
            'Heart disease',
            'Mental health issues (severe)',
            'Eating disorders',
            'Liver or kidney problems',
            'GI issues',
            'Pancreatitis',
            'Gallbladder problems',
            'Diabetic complications',
            'None of the above',
        ];

        return (
            <div className="space-y-6">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold text-xl mb-4">
                        8
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        Do you have family history with any of the following conditions?
                    </h2>
                    <p className="text-gray-600">Select all that apply</p>
                </div>

                <div className="space-y-2">
                    {conditions.map((condition) => (
                        <button
                            key={condition}
                            type="button"
                            onClick={() => toggleArrayItem('family_history_conditions', condition)}
                            className={`w-full text-left px-6 py-3 rounded-lg border-2 transition-all ${formData.family_history_conditions.includes(condition)
                                ? 'border-blue-600 bg-blue-50 text-blue-900'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            {condition}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // Step 9: Current Medications
    function renderStep9Medications() {
        return (
            <div className="space-y-6">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold text-xl mb-4">
                        9
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        Please list all medications you are currently taking
                    </h2>
                    <p className="text-gray-600">
                        Include the medication name, dosage, and how often you take it
                    </p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Current Medications
                        </label>
                        <textarea
                            value={formData.current_medications}
                            onChange={(e) =>
                                setFormData({ ...formData, current_medications: e.target.value })
                            }
                            placeholder="e.g., Metformin 500mg, twice daily&#10;Vitamin D 1000IU, once daily"
                            rows={5}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Have you had any previous surgeries? *
                        </label>
                        <div className="flex gap-4 mb-3">
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, previous_surgeries: true })}
                                className={`flex-1 px-6 py-3 rounded-lg border-2 transition-all ${formData.previous_surgeries === true
                                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                Yes
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, previous_surgeries: false, previous_surgeries_details: '' })}
                                className={`flex-1 px-6 py-3 rounded-lg border-2 transition-all ${formData.previous_surgeries === false
                                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                No
                            </button>
                        </div>
                        {formData.previous_surgeries && (
                            <div className="animate-fadeIn">
                                <label className="block text-sm text-gray-600 mb-1">
                                    Please specify surgery and year (optional):
                                </label>
                                <textarea
                                    value={formData.previous_surgeries_details || ''}
                                    onChange={(e) => setFormData({ ...formData, previous_surgeries_details: e.target.value })}
                                    placeholder="e.g. Appendectomy (2018), ACL Repair (2020)"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    rows={2}
                                />
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Do you have any food or drug allergies? *
                        </label>
                        <div className="flex gap-4 mb-3">
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, drug_allergies: true })}
                                className={`flex-1 px-6 py-3 rounded-lg border-2 transition-all ${formData.drug_allergies === true
                                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                Yes
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, drug_allergies: false, drug_allergies_details: '' })}
                                className={`flex-1 px-6 py-3 rounded-lg border-2 transition-all ${formData.drug_allergies === false
                                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                No
                            </button>
                        </div>
                        {formData.drug_allergies && (
                            <div className="animate-fadeIn">
                                <label className="block text-sm text-gray-600 mb-1">
                                    Please list your allergies:
                                </label>
                                <textarea
                                    value={formData.drug_allergies_details || ''}
                                    onChange={(e) => setFormData({ ...formData, drug_allergies_details: e.target.value })}
                                    placeholder="e.g. Penicillin, Peanuts, Shellfish"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    rows={2}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Step 10: Lifestyle & Experience
    function renderStep10Lifestyle() {
        const experienceLevels = [
            { value: 'first_time', label: 'First-time (Never used peptides)' },
            { value: 'beginner', label: 'Beginner (Some experience)' },
            { value: 'experienced', label: 'Experienced (Regular user)' },
        ];

        return (
            <div className="space-y-6">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold text-xl mb-4">
                        10
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Lifestyle & Experience</h2>
                    <p className="text-gray-600">Tell us about your peptide experience and habits</p>
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Peptide Experience Level *
                        </label>
                        <div className="space-y-2">
                            {experienceLevels.map((level) => (
                                <button
                                    key={level.value}
                                    type="button"
                                    onClick={() =>
                                        setFormData({ ...formData, experience_level: level.value })
                                    }
                                    className={`w-full text-left px-6 py-3 rounded-lg border-2 transition-all ${formData.experience_level === level.value
                                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    {level.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Is this your first time using any GLP-1 medication (Ozempic, Wegovy, Mounjaro,
                            etc.)? *
                        </label>
                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={() =>
                                    setFormData({ ...formData, peptide_experience_first_time: true })
                                }
                                className={`flex-1 px-6 py-3 rounded-lg border-2 transition-all ${formData.peptide_experience_first_time === true
                                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                Yes
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    setFormData({ ...formData, peptide_experience_first_time: false })
                                }
                                className={`flex-1 px-6 py-3 rounded-lg border-2 transition-all ${formData.peptide_experience_first_time === false
                                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                No
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Do you have a current prescription for GLP-1 medications? *
                        </label>
                        <p className="text-xs text-gray-500 mb-3">
                            Don't worry if you don't have one, we can help with recommendations
                        </p>
                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={() =>
                                    setFormData({ ...formData, current_prescription_glp1: true })
                                }
                                className={`flex-1 px-6 py-3 rounded-lg border-2 transition-all ${formData.current_prescription_glp1 === true
                                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                Yes
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    setFormData({ ...formData, current_prescription_glp1: false })
                                }
                                className={`flex-1 px-6 py-3 rounded-lg border-2 transition-all ${formData.current_prescription_glp1 === false
                                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                No
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Smoking Status *
                        </label>
                        <p className="text-xs text-gray-500 mb-3">
                            This helps us consider possible interactions
                        </p>
                        <div className="space-y-2">
                            {['smoker', 'non_smoker', 'other'].map((status) => (
                                <button
                                    key={status}
                                    type="button"
                                    onClick={() =>
                                        setFormData({
                                            ...formData,
                                            smoking_status: status as 'smoker' | 'non_smoker' | 'other',
                                        })
                                    }
                                    className={`w-full text-left px-6 py-3 rounded-lg border-2 capitalize transition-all ${formData.smoking_status === status
                                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    {status.replace('_', '-')}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Step 11: Preferences
    function renderStep11Preferences() {
        const budgetOptions = [
            { value: 'budget', label: 'Budget-friendly (Entry level)' },
            { value: 'mid_range', label: 'Mid-range (Quality balance)' },
            { value: 'premium', label: 'Premium (Best quality)' },
        ];

        const frequencyOptions = [
            { value: 'daily', label: 'Daily (Most convenient)' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'flexible', label: 'Flexible schedule' },
        ];

        return (
            <div className="space-y-6">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold text-xl mb-4">
                        11
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Preferences</h2>
                    <p className="text-gray-600">Help us tailor our recommendations</p>
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Budget Range (Optional)
                        </label>
                        <div className="space-y-2">
                            {budgetOptions.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() =>
                                        setFormData({
                                            ...formData,
                                            preferences: { ...formData.preferences, budget: option.value },
                                        })
                                    }
                                    className={`w-full text-left px-6 py-3 rounded-lg border-2 transition-all ${formData.preferences.budget === option.value
                                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Preferred Dosing Frequency (Optional)
                        </label>
                        <div className="space-y-2">
                            {frequencyOptions.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() =>
                                        setFormData({
                                            ...formData,
                                            preferences: { ...formData.preferences, frequency: option.value },
                                        })
                                    }
                                    className={`w-full text-left px-6 py-3 rounded-lg border-2 transition-all ${formData.preferences.frequency === option.value
                                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Step 12: Contact & Final Consent
    function renderStep12Contact() {
        return (
            <div className="space-y-6">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold text-xl mb-4">
                        12
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Almost Done!</h2>
                    <p className="text-gray-600">
                        We'll send your personalized recommendations to this email
                    </p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Full Name *
                        </label>
                        <input
                            type="text"
                            value={formData.full_name}
                            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                            placeholder="Juan Dela Cruz"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            placeholder="name@example.com"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Your information is 100% confidential and will not be shared
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Phone (Optional)
                        </label>
                        <input
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            placeholder="+63 912 345 6789"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div className="pt-4">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.final_consent}
                                onChange={(e) =>
                                    setFormData({ ...formData, final_consent: e.target.checked })
                                }
                                className="mt-1 w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">
                                I confirm that all information provided is accurate and I consent to receive
                                personalized peptide recommendations based on this assessment
                            </span>
                        </label>
                    </div>
                </div>
            </div>
        );
    }
}

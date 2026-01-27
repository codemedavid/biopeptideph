import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, Loader, AlertCircle, Check, ArrowLeft } from 'lucide-react';
import ImageUpload from '../ImageUpload';

interface JourneySection {
    id: string;
    section_identifier: string;
    title: string;
    subtitle: string;
    content: string;
    image_url: string;
    order_index: number;
    metadata: any;
}

interface JourneyManagerProps {
    onBack: () => void;
}

const JourneyManager: React.FC<JourneyManagerProps> = ({ onBack }) => {
    const [sections, setSections] = useState<JourneySection[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetchSections();
    }, []);

    const fetchSections = async () => {
        try {
            const { data, error } = await supabase
                .from('journey_sections')
                .select('*')
                .order('order_index');

            if (error) throw error;
            setSections(data || []);
        } catch (error) {
            console.error('Error fetching sections:', error);
            setMessage({ type: 'error', text: 'Failed to load content.' });
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (id: string, field: keyof JourneySection, value: string) => {
        setSections(prev =>
            prev.map(section => (section.id === id ? { ...section, [field]: value } : section))
        );
    };

    const handleSave = async (section: JourneySection) => {
        setSaving(true);
        setMessage(null);
        try {
            const { error } = await supabase
                .from('journey_sections')
                .update({
                    title: section.title,
                    subtitle: section.subtitle,
                    content: section.content,
                    image_url: section.image_url,
                    metadata: section.metadata
                })
                .eq('id', section.id);

            if (error) throw error;
            setMessage({ type: 'success', text: 'Section updated successfully!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error updating section:', error);
            setMessage({ type: 'error', text: 'Failed to update section.' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex justify-center p-8"><Loader className="animate-spin text-theme-accent" /></div>;

    return (
        <div className="min-h-screen bg-theme-bg">
            {/* Header */}
            <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center space-x-4">
                            <button
                                onClick={onBack}
                                className="text-gray-600 hover:text-theme-accent transition-colors flex items-center gap-2 group"
                            >
                                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                                <span className="text-sm font-medium">Back</span>
                            </button>
                            <div className="h-6 w-px bg-gray-200"></div>
                            <h1 className="text-lg font-bold text-theme-text">
                                Manage Journey Page
                            </h1>
                        </div>

                        {message && (
                            <div className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {message.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                                {message.text}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                {sections.map(section => (
                    <div key={section.id} className="bg-white rounded-xl shadow-soft border border-gray-100 overflow-hidden">
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-gray-700 capitalize flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-theme-accent"></div>
                                {section.section_identifier.replace('_', ' ')}
                            </h3>
                            <button
                                onClick={() => handleSave(section)}
                                disabled={saving}
                                className="bg-theme-accent hover:bg-theme-accent/90 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-sm"
                            >
                                {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                                Save Changes
                            </button>
                        </div>

                        <div className="p-6 grid gap-6">
                            {/* Basic Fields */}
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Title</label>
                                    <input
                                        type="text"
                                        value={section.title || ''}
                                        onChange={e => handleChange(section.id, 'title', e.target.value)}
                                        className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme-accent/20 focus:border-theme-accent outline-none text-sm transition-all"
                                        placeholder="Section Title"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Subtitle</label>
                                    <input
                                        type="text"
                                        value={section.subtitle || ''}
                                        onChange={e => handleChange(section.id, 'subtitle', e.target.value)}
                                        className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme-accent/20 focus:border-theme-accent outline-none text-sm transition-all"
                                        placeholder="Section Subtitle"
                                    />
                                </div>
                            </div>

                            {/* Content Area */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Content</label>
                                <textarea
                                    value={section.content || ''}
                                    onChange={e => handleChange(section.id, 'content', e.target.value)}
                                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme-accent/20 focus:border-theme-accent outline-none h-32 text-sm transition-all leading-relaxed"
                                    placeholder="Main text content..."
                                />
                                <p className="text-xs text-gray-400 mt-1">Accepts plain text. Use new lines for paragraphs.</p>
                            </div>

                            {/* Image URL */}
                            {section.image_url !== undefined && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Image</label>
                                    <ImageUpload
                                        currentImage={section.image_url}
                                        onImageChange={(newUrl) => handleChange(section.id, 'image_url', newUrl || '')}
                                        folder="menu-images"
                                    />
                                    {/* Fallback manual input for flexibility */}
                                    <details className="mt-2">
                                        <summary className="text-xs text-gray-500 cursor-pointer hover:text-theme-accent">Manual URL (Advanced)</summary>
                                        <input
                                            type="text"
                                            value={section.image_url || ''}
                                            onChange={e => handleChange(section.id, 'image_url', e.target.value)}
                                            className="w-full mt-2 p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme-accent/20 focus:border-theme-accent outline-none text-sm"
                                            placeholder="https://..."
                                        />
                                    </details>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {sections.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed">
                        <p className="text-gray-500">No sections found. Please run the database migration script.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default JourneyManager;

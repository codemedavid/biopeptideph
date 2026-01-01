import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, ShieldCheck, Microscope, User, Zap, Loader, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface JourneySection {
    section_identifier: string;
    title: string | null;
    subtitle: string | null;
    content: string | null;
    image_url: string | null;
    metadata: any;
}

const PeptideJourney = () => {
    const [sections, setSections] = useState<Record<string, JourneySection>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchContent = async () => {
            try {
                const { data, error } = await supabase
                    .from('journey_sections')
                    .select('*');

                if (error) throw error;

                // Convert array to map for easier access
                const sectionMap: Record<string, JourneySection> = {};
                if (data) {
                    data.forEach((section: JourneySection) => {
                        sectionMap[section.section_identifier] = section;
                    });
                }
                setSections(sectionMap);
            } catch (err) {
                console.error('Error fetching journey content:', err);
                // Fallback to empty object, will render skeletons or default content
            } finally {
                setLoading(false);
            }
        };

        fetchContent();
    }, []);

    // Helper to get text or default
    const get = (id: string, field: keyof JourneySection, defaultValue: string = '') => {
        return sections[id]?.[field] || defaultValue;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-theme-navy flex items-center justify-center">
                <Loader className="w-8 h-8 text-theme-blue animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 relative">
            {/* Navigation Back */}
            <nav className="absolute top-6 left-6 z-50">
                <Link
                    to="/"
                    className="flex items-center gap-2 text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 backdrop-blur-md px-4 py-2 rounded-full border border-white/10"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm font-medium">Back to Home</span>
                </Link>
            </nav>

            {/* 1. Hero Section */}
            <section className="relative py-24 lg:py-32 bg-theme-navy overflow-hidden">
                <div className="absolute inset-0 opacity-20">
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-theme-blue rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-theme-red rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 text-theme-red"></div>
                </div>

                <div className="container mx-auto px-4 relative z-10 text-center">
                    <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 tracking-tight leading-tight">
                        {get('hero', 'title', 'My Peptide Journey')}
                    </h1>
                    <div className="w-24 h-1 bg-gradient-to-r from-theme-blue to-theme-red mx-auto mb-8 rounded-full"></div>
                    <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto leading-relaxed font-light">
                        {get('hero', 'subtitle', 'Why I chose peptides and how they fundamentally changed my approach to wellness, performance, and longevity.')}
                    </p>
                </div>
            </section>

            {/* 2. The Beginning (Zig-Zag: Text Left, Image Right) */}
            <section className="py-20 lg:py-32 bg-white overflow-hidden">
                <div className="container mx-auto px-4">
                    <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
                        <div className="lg:w-1/2 order-2 lg:order-1">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-theme-navy/5 text-theme-navy text-sm font-bold tracking-wide uppercase mb-6">
                                <User className="w-4 h-4" />
                                <span>{get('beginning', 'subtitle', 'The Beginning')}</span>
                            </div>
                            <h2 className="text-4xl lg:text-5xl font-bold text-theme-navy mb-8 leading-tight">
                                {sections['beginning']?.title || 'It Started With Frustration.'}
                            </h2>
                            <div className="prose prose-lg text-gray-600 leading-relaxed space-y-6 whitespace-pre-wrap">
                                {get('beginning', 'content', 'Like many, my journey didn\'t start with a clear answer...')}
                            </div>
                        </div>
                        <div className="lg:w-1/2 order-1 lg:order-2 relative group">
                            <div className="absolute inset-0 bg-theme-blue/20 translate-x-4 translate-y-4 rounded-3xl transition-transform duration-500 group-hover:translate-x-6 group-hover:translate-y-6"></div>
                            <div className="relative rounded-3xl overflow-hidden shadow-2xl aspect-[4/3]">
                                <img
                                    src={get('beginning', 'image_url', '/assets/journey-1.png')}
                                    alt="Mental fog clearing"
                                    className="w-full h-full object-cover transform scale-100 group-hover:scale-105 transition-transform duration-700"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-theme-navy/50 to-transparent opacity-60"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 3. Discovery & Learning (Zig-Zag: Image Left, Text Right) */}
            <section className="py-20 lg:py-32 bg-gray-900 text-white relative overflow-hidden">
                {/* Background Elements */}
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-theme-blue via-gray-900 to-gray-900"></div>

                <div className="container mx-auto px-4 relative z-10">
                    <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
                        <div className="lg:w-1/2 relative group">
                            <div className="absolute inset-0 bg-theme-blue/30 -translate-x-4 translate-y-4 rounded-3xl transition-transform duration-500 group-hover:-translate-x-6 group-hover:translate-y-6"></div>
                            <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-theme-blue/20 aspect-[4/3] border border-white/10">
                                <img
                                    src={get('science', 'image_url', '/assets/journey-2.png')}
                                    alt="Scientific research"
                                    className="w-full h-full object-cover transform scale-100 group-hover:scale-105 transition-transform duration-700"
                                />
                            </div>
                        </div>

                        <div className="lg:w-1/2">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-theme-blue/20 text-theme-blue text-sm font-bold tracking-wide uppercase mb-6 border border-theme-blue/20">
                                <Microscope className="w-4 h-4" />
                                <span>{get('science', 'subtitle', 'The Science')}</span>
                            </div>
                            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-8 leading-tight">
                                {sections['science']?.title || 'Learning The Mechanism.'}
                            </h2>

                            <div className="space-y-6 text-gray-300 text-lg leading-relaxed mb-8 whitespace-pre-wrap">
                                {get('science', 'content', 'At first, the science seemed complex...')}
                            </div>

                            <div className="grid gap-4">
                                {/* Dynamic points from metadata, or fallback to default */}
                                {(sections['science']?.metadata?.points || [
                                    { title: "Quality is Key", desc: "99% vs 99.9% purity creates a massive difference in results." },
                                    { title: "Protocols Matter", desc: "Consistency and proper dosage beat random experimentation every time." }
                                ]).map((point: any, idx: number) => (
                                    <div key={idx} className="bg-white/5 backdrop-blur-sm p-4 rounded-xl border border-white/10 flex items-start gap-4 hover:bg-white/10 transition-colors">
                                        {idx === 0 ? <ShieldCheck className="w-6 h-6 text-theme-blue flex-shrink-0 mt-1" /> : <BookOpen className="w-6 h-6 text-theme-blue flex-shrink-0 mt-1" />}
                                        <div>
                                            <h4 className="font-bold text-white">{point.title}</h4>
                                            <p className="text-sm text-gray-400">{point.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 4. Results Section (Zig-Zag: Text Left, Image Right) */}
            <section className="py-20 lg:py-32 bg-white relative">
                <div className="absolute top-0 right-0 w-1/3 h-full bg-gray-50 skew-x-12 opacity-50"></div>

                <div className="container mx-auto px-4 relative z-10">
                    <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
                        <div className="lg:w-1/2 order-2 lg:order-1">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-theme-red/10 text-theme-red text-sm font-bold tracking-wide uppercase mb-6">
                                <Zap className="w-4 h-4" />
                                <span>{get('results', 'subtitle', 'The Outcome')}</span>
                            </div>
                            <h2 className="text-4xl lg:text-5xl font-bold text-theme-navy mb-8 leading-tight">
                                {sections['results']?.title || 'What Changed For Me.'}
                            </h2>

                            <div className="space-y-8">
                                {/* Dynamic milestones from metadata */}
                                {(sections['results']?.metadata?.milestones || [
                                    { step: "1", title: "Mental Clarity", desc: "The afternoon crash disappeared. I could focus for longer periods without needing caffeine." },
                                    { step: "2", title: "Accelerated Recovery", desc: "Workouts that left me sore for days now felt manageable the next morning. My resilience skyrocketed." },
                                    { step: "3", title: "A New Standard", desc: "It wasn't about \"fixing\" anymore; it was about optimizing. This mindset shift is what I wanted to share." }
                                ]).map((item: any, idx: number) => (
                                    <div key={idx} className="flex gap-4">
                                        <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl ${idx === 0 ? 'bg-theme-blue text-white shadow-lg shadow-theme-blue/30' : idx === 1 ? 'bg-white text-theme-navy border-2 border-theme-navy' : 'bg-white text-gray-400 border-2 border-gray-200'}`}>
                                            {item.step || idx + 1}
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-theme-navy mb-2">{item.title}</h3>
                                            <p className="text-gray-600">{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="lg:w-1/2 order-1 lg:order-2 relative group">
                            <div className="absolute inset-0 bg-theme-red/20 translate-x-4 translate-y-4 rounded-3xl transition-transform duration-500 group-hover:translate-x-6 group-hover:translate-y-6"></div>
                            <div className="relative rounded-3xl overflow-hidden shadow-2xl aspect-[4/3]">
                                <img
                                    src={get('results', 'image_url', '/assets/journey-3.png')}
                                    alt="Optimization results"
                                    className="w-full h-full object-cover transform scale-100 group-hover:scale-105 transition-transform duration-700"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 5. Philosophy & Values (Three Cards) */}
            <section className="py-24 bg-theme-navy text-white relative overflow-hidden">
                <div className="container mx-auto px-4 relative z-10 text-center">
                    <h2 className="text-3xl md:text-4xl font-bold mb-16">{get('values', 'title', 'Why Biopeptides Exists')}</h2>
                    <p className="max-w-2xl mx-auto mb-12 text-gray-300">{get('values', 'content', 'This journey is why Biopeptides exists.')}</p>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Dynamic cards from metadata */}
                        {(sections['values']?.metadata?.cards || [
                            { title: "Uncompromising Quality", desc: "If I wouldn't use it myself, it doesn't go on the shelf. Every batch is rigorously tested for purity.", icon: "shield" },
                            { title: "Education First", desc: "We don't just sell; we educate. Knowledge is the most powerful tool for your long-term health.", icon: "book" },
                            { title: "Transparency", desc: "No hidden fillers, no vague labeling. Just clear, research-grade compounds you can trust.", icon: "user" }
                        ]).map((card: any, idx: number) => {
                            const Icon = idx === 0 ? ShieldCheck : idx === 1 ? BookOpen : User; // Simple mapping fallback
                            return (
                                <div key={idx} className={`group bg-white/5 backdrop-blur-md p-8 rounded-2xl border border-white/10 hover:border-theme-blue/50 hover:bg-white/10 transition-all duration-300 ${idx === 1 ? 'md:-translate-y-4' : ''}`}>
                                    <div className="w-16 h-16 bg-theme-blue/20 rounded-2xl flex items-center justify-center text-theme-blue mb-6 group-hover:scale-110 transition-transform">
                                        <Icon className="w-8 h-8" />
                                    </div>
                                    <h4 className="text-xl font-bold mb-4">{card.title}</h4>
                                    <p className="text-gray-400 leading-relaxed">{card.desc}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* 6. Disclaimer */}
            <section className="py-12 bg-gray-900 border-t border-gray-800">
                <div className="container mx-auto px-4 max-w-3xl text-center">
                    <p className="text-sm text-gray-500 italic leading-relaxed">
                        {get('disclaimer', 'content', '"This is a personal experience narrative..."')}
                    </p>
                </div>
            </section>

            {/* 7. CTA */}
            <section className="py-24 bg-white">
                <div className="container mx-auto px-4 text-center">
                    <h2 className="text-4xl lg:text-5xl font-bold text-theme-navy mb-8 tracking-tight">
                        {get('cta', 'title', 'Ready to Start Your Own Journey?')}
                    </h2>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-12">
                        {get('cta', 'content', 'Explore our researched-grade collection and take the first step towards optimization.')}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-6 justify-center">
                        <Link to="/" className="group bg-theme-navy text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-theme-blue transition-all shadow-xl hover:shadow-2xl hover:shadow-theme-blue/20 flex items-center justify-center gap-2">
                            Explore Products <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default PeptideJourney;

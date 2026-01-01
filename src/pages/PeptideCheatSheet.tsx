import React, { useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useCart } from '../hooks/useCart';
import {
    ChevronDown,
    ChevronUp,
    Search,
    Sparkles,
    Beaker,
    Flame,
    Dumbbell,
    Heart,
    Brain,
    Moon,
    Star,
    Shield,
    Info,
    Syringe,
    Droplets,
    Clock,
    AlertCircle
} from 'lucide-react';

interface PeptideEntry {
    name: string;
    amount: string;
    recon: string;
    concentration: string;
    typicalDose: string;
    units: string;
    timing: string;
    frequency: string;
    cycle: string;
    notes: string;
}

interface CategoryData {
    title: string;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
    peptides: PeptideEntry[];
}

const PeptideCheatSheet: React.FC = () => {
    const { getTotalItems } = useCart();
    const [expandedCategories, setExpandedCategories] = useState<string[]>(['Fat Loss / Metabolic']);
    const [searchTerm, setSearchTerm] = useState('');

    const toggleCategory = (category: string) => {
        setExpandedCategories(prev =>
            prev.includes(category)
                ? prev.filter(c => c !== category)
                : [...prev, category]
        );
    };

    const categories: CategoryData[] = [
        {
            title: 'Fat Loss / Metabolic',
            icon: <Flame className="w-5 h-5" />,
            color: 'text-orange-400',
            bgColor: 'bg-orange-500/10 border-orange-500/30',
            peptides: [
                { name: 'GLP-1/Semaglutide', amount: '10mg', recon: '2mL', concentration: '5', typicalDose: '0.25–2.0mg weekly', units: '5–20 (up to 40)', timing: 'AM or PM', frequency: '1x weekly', cycle: '8–48 weeks', notes: 'Monthly titration 0.25→0.5→0.75→1.0mg' },
                { name: 'GLP-2/Tirzepatide (GLP-1/GIP)', amount: '10mg', recon: '1mL', concentration: '10', typicalDose: '2.5–5.0mg weekly', units: '25–50 (75)', timing: 'AM or PM', frequency: '1x weekly', cycle: '8–48 weeks', notes: 'Consider split microdosing for tolerance' },
                { name: 'GLP-3/Retatrutide', amount: '10mg', recon: '2mL', concentration: '5', typicalDose: '0.5–2.0mg weekly', units: '10, 20 or 40', timing: 'AM or PM', frequency: '1x weekly', cycle: '8–48 weeks', notes: 'Triple agonist; early research—titrate slowly' },
                { name: 'Mazobutide Acetate', amount: '10mg', recon: '1mL', concentration: '10', typicalDose: '2–6mg weekly', units: '20, 40 or 60', timing: '1x weekly', frequency: '1x weekly', cycle: '8–48 weeks', notes: 'Monthly titration 2→4→6mg' },
                { name: 'Cagrilintide (Amylin RA)', amount: '5mg', recon: '2mL', concentration: '2.5', typicalDose: '250–500 mcg per dose', units: '10–20', timing: 'AM', frequency: 'Daily', cycle: '8–12 weeks', notes: 'Appetite/satiety control' },
                { name: '5-Amino-1MQ', amount: '10mg', recon: '2mL', concentration: '5', typicalDose: '500 mcg–1mg daily', units: '10 to 20', timing: 'AM', frequency: '5x weekly', cycle: '4–8 weeks', notes: 'NNMT pathway; pairs with NAD+/MOTS-c' },
                { name: 'AOD-9604', amount: '10mg', recon: '2mL', concentration: '2.5', typicalDose: '300 mcg daily', units: '12 (or 10)', timing: 'AM', frequency: '3–5x/week', cycle: '4–8 weeks', notes: 'Avoid eating 30 min post-dose' },
                { name: 'MOTS-c', amount: '10mg', recon: '2mL', concentration: '5', typicalDose: '1.0mg per dose', units: '20', timing: 'AM', frequency: '3–5x/week', cycle: '6–8 weeks', notes: 'Mitochondrial peptide; pairs with NAD+' },
                { name: 'L-Carnitine', amount: '600mg/20mL', recon: 'N/A', concentration: 'N/A', typicalDose: '200 to 600 mg', units: '33 to 100', timing: 'AM pre-workout', frequency: '3–7x/week', cycle: 'As needed', notes: 'Combine with AOD-9604 for fat burning' },
            ]
        },
        {
            title: 'Muscle Building / Strength',
            icon: <Dumbbell className="w-5 h-5" />,
            color: 'text-blue-400',
            bgColor: 'bg-blue-500/10 border-blue-500/30',
            peptides: [
                { name: 'Tesamorelin', amount: '5mg', recon: '1mL', concentration: '5', typicalDose: '1.0mg per dose', units: '20', timing: 'AM or PM (fasted)', frequency: '5 days on/2 off', cycle: '6–12 weeks', notes: 'GHRH analog' },
                { name: 'Tesamorelin', amount: '10mg', recon: '2mL', concentration: '5', typicalDose: '1.0mg per dose', units: '20', timing: 'AM or PM (fasted)', frequency: '5 days on/2 off', cycle: '6–12 weeks', notes: 'Higher concentration vial' },
                { name: 'Ipamorelin', amount: '5mg', recon: '2mL', concentration: '2.5', typicalDose: '200–300 mcg per dose', units: '8–12', timing: 'PM (fasted 2–3h)', frequency: '5 days on/2 off', cycle: '6–12 weeks', notes: 'GHRP with low prolactin/cortisol impact' },
                { name: 'CJC-1295 (no DAC)', amount: '5mg', recon: '2mL', concentration: '2.5', typicalDose: '200–250 mcg per dose', units: '8–10', timing: 'PM (fasted 2–3h)', frequency: '5 days on/2 off', cycle: '6–12 weeks', notes: 'Short GHRH analog' },
                { name: 'CJC-1295 + Ipamorelin (blend)', amount: '5mg each', recon: '2mL', concentration: '3', typicalDose: '250/250 mcg per dose', units: '10', timing: 'PM (fasted)', frequency: '5 days on/2 off', cycle: '6–12 weeks', notes: 'Dual-pathway GH release' },
                { name: 'Sermorelin Acetate', amount: '5mg', recon: '2mL', concentration: '2.5', typicalDose: '200–250 mcg per dose', units: '8–10', timing: 'PM (fasted 2–3h)', frequency: '5 days on/2 off', cycle: '6–12 weeks', notes: 'Physiologic GH pulses' },
            ]
        },
        {
            title: 'Longevity / Mitochondrial',
            icon: <Sparkles className="w-5 h-5" />,
            color: 'text-purple-400',
            bgColor: 'bg-purple-500/10 border-purple-500/30',
            peptides: [
                { name: 'Epitalon', amount: '10mg', recon: '2mL', concentration: '5', typicalDose: '2.0mg nightly', units: '40', timing: 'PM', frequency: 'Daily', cycle: '20 days (repeat 2x/yr)', notes: 'Telomere/biological aging research' },
                { name: 'Epitalon', amount: '50mg', recon: '2mL', concentration: '25', typicalDose: '2.0mg nightly', units: '8', timing: 'PM', frequency: 'Daily', cycle: '20 days (repeat 3x/yr)', notes: 'Higher concentration vial' },
                { name: 'SS-31 (Elamipretide)', amount: '10mg', recon: '2mL', concentration: '5', typicalDose: '0.5–1mg per dose', units: '10 to 20', timing: 'AM', frequency: '5 days on/2 off', cycle: '6–8 weeks', notes: 'Mitochondrial membrane cardiolipin support' },
                { name: 'NAD+', amount: '500mg', recon: '3mL', concentration: '166', typicalDose: '50–100mg per session', units: '30–60', timing: 'AM', frequency: '2–3x per week', cycle: 'Ongoing', notes: 'SubQ default; IM optional' },
                { name: 'NAD+', amount: '1,000mg', recon: '3mL', concentration: '333', typicalDose: '50–100mg per session', units: '15–30', timing: 'AM', frequency: '2–3x per week', cycle: 'Ongoing', notes: 'Higher concentration vial' },
                { name: 'L-Glutathione', amount: '1,500mg', recon: '2mL', concentration: '750', typicalDose: '500mg to 1500mg', units: '0.67 to 2 mL', timing: 'AM', frequency: '1–3 x per week', cycle: 'Ongoing', notes: 'Use after sauna/red-light; store 2–8°C, use within 10 days' },
            ]
        },
        {
            title: 'Healing / Regeneration / Gut',
            icon: <Heart className="w-5 h-5" />,
            color: 'text-green-400',
            bgColor: 'bg-green-500/10 border-green-500/30',
            peptides: [
                { name: 'BPC-157', amount: '5mg', recon: '2mL', concentration: '2.5', typicalDose: '250–500 mcg daily', units: '10 to 20', timing: 'AM or PM', frequency: 'Daily', cycle: '4–12 weeks', notes: 'Can pair with TB-500' },
                { name: 'BPC-157', amount: '10mg', recon: '2mL', concentration: '5', typicalDose: '250–500 mcg daily', units: '5 to 10', timing: 'AM or PM', frequency: 'Daily', cycle: '4–12 weeks', notes: '10mg vial' },
                { name: 'TB-500 (Thymosin Beta-4)', amount: '5mg', recon: '2mL', concentration: '2.5', typicalDose: '500 mcg daily', units: '20', timing: 'AM', frequency: 'Daily', cycle: '6–12 weeks', notes: 'Tissue repair/angiogenesis' },
                { name: 'BPC-157 + TB-500 (blend)', amount: '5 each', recon: '2mL', concentration: '2.5 each', typicalDose: '250/250 mcg daily', units: '10', timing: 'AM/PM', frequency: 'Daily', cycle: '6–12 weeks', notes: 'Increase to 500/500 mcg as needed' },
                { name: 'GHK-Cu', amount: '50mg', recon: '3mL', concentration: '16', typicalDose: '1.7–2.0mg daily', units: '10 to 12', timing: 'AM', frequency: 'Daily', cycle: '4–8 weeks', notes: 'May sting—dilute more to reduce burn' },
                { name: 'GHK-Cu', amount: '100mg', recon: '3mL', concentration: '32', typicalDose: '1.7–2.0mg daily', units: '5 to 6', timing: 'AM', frequency: 'Daily', cycle: '4–8 weeks', notes: 'Higher concentration' },
                { name: 'KPV', amount: '10mg', recon: '2mL', concentration: '5', typicalDose: '250–500 mcg per dose', units: '5 to 10', timing: 'AM', frequency: '5 days on/2 off', cycle: '8 weeks', notes: 'Anti-inflammatory; pairs with BPC-157' },
                { name: 'KLOW Blend', amount: '50/10/10/10', recon: '3mL', concentration: '16/3/3/3', typicalDose: '1.7/0.3/0.3/0.3', units: '10', timing: 'AM or PM', frequency: '5–7 days/week', cycle: '6–8 weeks', notes: 'GHK-Cu/BPC-157/TB-500/KPV fixed ratio' },
                { name: 'GLOW Blend', amount: '50/10/10', recon: '3mL', concentration: '16/3/3', typicalDose: '1.7/0.3/0.3', units: '10', timing: 'AM or PM', frequency: '5–7 days/week', cycle: '6–8 weeks', notes: 'GHK-Cu/BPC-157/TB-500 fixed ratio' },
            ]
        },
        {
            title: 'Brain / Cognitive / Mood',
            icon: <Brain className="w-5 h-5" />,
            color: 'text-pink-400',
            bgColor: 'bg-pink-500/10 border-pink-500/30',
            peptides: [
                { name: 'Semax', amount: '5mg', recon: '2mL', concentration: '2.5', typicalDose: '0.5–1mg (intranasal/SubQ)', units: '40', timing: 'AM', frequency: '2–3 days/week', cycle: '8 weeks', notes: 'Focus/cognitive support' },
                { name: 'N-Acetyl Semax Amidate', amount: '10mg', recon: '2mL', concentration: '5', typicalDose: '0.25–1mg (intranasal/SubQ)', units: '10', timing: 'AM', frequency: '2–3 days/week', cycle: '8 weeks', notes: 'Enhanced cognitive support' },
                { name: 'Selank', amount: '5mg', recon: '2mL', concentration: '2.5', typicalDose: '200–500 mcg (intranasal/SubQ)', units: '40', timing: 'AM', frequency: '2–3 days/week', cycle: '8 weeks', notes: 'Anxiolytic/GABA-linked pathways' },
                { name: 'N-Acetyl-Selank Amidate', amount: '10mg', recon: '2mL', concentration: '5', typicalDose: '200 mcg (intranasal/SubQ)', units: '20', timing: 'AM', frequency: '2–3 days/week', cycle: '8 weeks', notes: 'Enhanced anxiolytic effect' },
                { name: 'Pinealon', amount: '5mg', recon: '1mL', concentration: '5', typicalDose: '2mg', units: '40', timing: 'PM', frequency: 'Daily', cycle: '30 days', notes: 'Brain longevity peptide' },
                { name: 'VIP (Vasoactive Intestinal Peptide)', amount: '5mg', recon: '5mL', concentration: '1', typicalDose: '50 mcg per dose', units: '5', timing: 'AM or PM', frequency: 'Daily', cycle: '6–8 weeks', notes: 'Anti-inflammatory/immune modulator' },
            ]
        },
        {
            title: 'Sleep & Sexual Health',
            icon: <Moon className="w-5 h-5" />,
            color: 'text-indigo-400',
            bgColor: 'bg-indigo-500/10 border-indigo-500/30',
            peptides: [
                { name: 'DSIP', amount: '5mg', recon: '2mL', concentration: '2.5', typicalDose: '250 mcg per dose', units: '10', timing: '1–3h before bed', frequency: '5 days on/2 off', cycle: '—', notes: 'Sleep support' },
                { name: 'Kisspeptin', amount: '5mg', recon: '2mL', concentration: '2.5', typicalDose: '125 mcg nightly', units: '5', timing: '1 hour before bed', frequency: 'Daily', cycle: '30 days on/30 off', notes: 'Reproductive axis/libido' },
                { name: 'PT-141 (Bremelanotide)', amount: '10mg', recon: '2mL', concentration: '5', typicalDose: '200–500 mcg as needed', units: '4 to 10', timing: '30–60 min pre-activity', frequency: 'As needed', cycle: '—', notes: 'IM optional' },
                { name: 'Oxytocin', amount: '10mg', recon: '10mL', concentration: '1.0', typicalDose: '50 mcg as needed (intranasal)', units: '5', timing: 'AM or PM', frequency: 'As needed', cycle: '—', notes: 'Social bonding/mood' },
                { name: 'Oxytocin Acetate', amount: '2mg', recon: '2mL', concentration: '1.0', typicalDose: '50 mcg as needed (intranasal)', units: '5', timing: 'AM or PM', frequency: 'As needed', cycle: '—', notes: 'Acetate form increases stability' },
            ]
        },
        {
            title: 'Beauty & Skin',
            icon: <Star className="w-5 h-5" />,
            color: 'text-rose-400',
            bgColor: 'bg-rose-500/10 border-rose-500/30',
            peptides: [
                { name: 'Melanotan I', amount: '10mg', recon: '2mL', concentration: '5', typicalDose: '250 mcg per dose', units: '5', timing: 'PM (or post-food)', frequency: '2x per week', cycle: '6–8 weeks', notes: 'Photo-protection/tanning' },
                { name: 'Melanotan II', amount: '10mg', recon: '2mL', concentration: '5', typicalDose: '250 mcg per dose', units: '5', timing: 'PM (or post-food)', frequency: '2x per week', cycle: '6–8 weeks', notes: 'More potent; watch for nausea' },
            ]
        },
        {
            title: 'Immunity / Resilience',
            icon: <Shield className="w-5 h-5" />,
            color: 'text-yellow-400',
            bgColor: 'bg-yellow-500/10 border-yellow-500/30',
            peptides: [
                { name: 'Thymosin Alpha-1 (TA1)', amount: '5mg', recon: '2mL', concentration: '2.5', typicalDose: '1.5mg per dose', units: '60', timing: 'AM', frequency: '5 days on/2 off', cycle: '6–8 weeks', notes: 'Immune support' },
                { name: 'Thymosin Alpha-1 (TA1)', amount: '10mg', recon: '2mL', concentration: '5', typicalDose: '1.5mg per dose', units: '30', timing: 'AM', frequency: '5 days on/2 off', cycle: '6–8 weeks', notes: '10mg vial' },
                { name: 'Vilon', amount: '20mg', recon: '2mL', concentration: '10', typicalDose: '2mg', units: '20', timing: 'AM or PM', frequency: '30 days', cycle: '1 month on, 2 months off', notes: 'Thymus/anti-inflammatory research' },
            ]
        },
    ];

    const filteredCategories = categories.map(category => ({
        ...category,
        peptides: category.peptides.filter(peptide =>
            peptide.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            peptide.notes.toLowerCase().includes(searchTerm.toLowerCase())
        )
    })).filter(category => category.peptides.length > 0 || searchTerm === '');

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            <Header cartItemsCount={getTotalItems()} onCartClick={() => { }} onMenuClick={() => { }} />

            <main className="pt-24 pb-16">
                <div className="container mx-auto px-4">
                    {/* Hero Section */}
                    <div className="text-center mb-12">
                        <div className="inline-flex items-center gap-2 bg-theme-accent/20 text-theme-accent px-4 py-2 rounded-full text-sm font-medium mb-4">
                            <Beaker className="w-4 h-4" />
                            Research Reference Guide
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                            Women's Peptide Cheat Sheet
                        </h1>
                        <p className="text-gray-400 max-w-2xl mx-auto mb-2">
                            Comprehensive peptide dosing reference by Dr. Kristi Sawicki, Ph.D.
                        </p>
                        <p className="text-sm text-gray-500">
                            For educational purposes only. Research-use-only (RUO). Not medical advice.
                        </p>
                    </div>

                    {/* Quick Reference Cards */}
                    <div className="grid md:grid-cols-3 gap-4 mb-8">
                        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-theme-blue/20 rounded-lg">
                                    <Syringe className="w-5 h-5 text-theme-blue" />
                                </div>
                                <h3 className="font-semibold text-white">Syringe Units</h3>
                            </div>
                            <p className="text-sm text-gray-400">1 mL = 100 units (e.g., 10 units = 0.10 mL)</p>
                        </div>

                        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-green-500/20 rounded-lg">
                                    <Droplets className="w-5 h-5 text-green-400" />
                                </div>
                                <h3 className="font-semibold text-white">Concentration</h3>
                            </div>
                            <p className="text-sm text-gray-400">mg/mL = Amount ÷ Reconstitution Volume</p>
                        </div>

                        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-purple-500/20 rounded-lg">
                                    <Clock className="w-5 h-5 text-purple-400" />
                                </div>
                                <h3 className="font-semibold text-white">Common Rhythm</h3>
                            </div>
                            <p className="text-sm text-gray-400">5 days on / 2 days off • 6–12 week cycles</p>
                        </div>
                    </div>

                    {/* Dilution Examples Alert */}
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-8">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-semibold text-amber-400 mb-2">Dilution Examples</h4>
                                <div className="grid md:grid-cols-3 gap-2 text-sm text-gray-300">
                                    <div>• 5 mg + 2 mL → 2.5 mg/mL. 250 mcg = 10 units</div>
                                    <div>• 10 mg + 2 mL → 5.0 mg/mL. 250 mcg = 5 units</div>
                                    <div>• 50 mg + 3 mL → 16.7 mg/mL. 1.7 mg = 10 units</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="relative mb-8">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search peptides by name or purpose..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-accent focus:border-transparent"
                        />
                    </div>

                    {/* Peptide Categories */}
                    <div className="space-y-4">
                        {filteredCategories.map((category) => (
                            <div
                                key={category.title}
                                className={`border rounded-xl overflow-hidden transition-all ${category.bgColor}`}
                            >
                                <button
                                    onClick={() => toggleCategory(category.title)}
                                    className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={category.color}>{category.icon}</div>
                                        <h2 className="text-lg font-semibold text-white">{category.title}</h2>
                                        <span className="text-sm text-gray-400">({category.peptides.length} peptides)</span>
                                    </div>
                                    {expandedCategories.includes(category.title)
                                        ? <ChevronUp className="w-5 h-5 text-gray-400" />
                                        : <ChevronDown className="w-5 h-5 text-gray-400" />
                                    }
                                </button>

                                {expandedCategories.includes(category.title) && (
                                    <div className="border-t border-white/10">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-black/20">
                                                    <tr className="text-gray-400 text-left">
                                                        <th className="px-4 py-3 font-medium whitespace-nowrap">Peptide</th>
                                                        <th className="px-4 py-3 font-medium whitespace-nowrap">Amount</th>
                                                        <th className="px-4 py-3 font-medium whitespace-nowrap">Recon</th>
                                                        <th className="px-4 py-3 font-medium whitespace-nowrap">Conc (mg/mL)</th>
                                                        <th className="px-4 py-3 font-medium whitespace-nowrap">Typical Dose</th>
                                                        <th className="px-4 py-3 font-medium whitespace-nowrap">Units</th>
                                                        <th className="px-4 py-3 font-medium whitespace-nowrap">Timing</th>
                                                        <th className="px-4 py-3 font-medium whitespace-nowrap">Frequency</th>
                                                        <th className="px-4 py-3 font-medium whitespace-nowrap">Cycle</th>
                                                        <th className="px-4 py-3 font-medium">Notes</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5">
                                                    {category.peptides.map((peptide, idx) => (
                                                        <tr
                                                            key={idx}
                                                            className="hover:bg-white/5 transition-colors"
                                                        >
                                                            <td className="px-4 py-3 font-medium text-white whitespace-nowrap">{peptide.name}</td>
                                                            <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{peptide.amount}</td>
                                                            <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{peptide.recon}</td>
                                                            <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{peptide.concentration}</td>
                                                            <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{peptide.typicalDose}</td>
                                                            <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{peptide.units}</td>
                                                            <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{peptide.timing}</td>
                                                            <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{peptide.frequency}</td>
                                                            <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{peptide.cycle}</td>
                                                            <td className="px-4 py-3 text-gray-400 max-w-xs">{peptide.notes}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Storage & Handling Info */}
                    <div className="mt-12 bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
                        <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                            <Info className="w-5 h-5 text-theme-blue" />
                            Storage & Handling Guidelines
                        </h3>
                        <div className="grid md:grid-cols-2 gap-4 text-gray-300">
                            <div>
                                <h4 className="font-medium text-white mb-2">Storage</h4>
                                <ul className="space-y-1 text-sm">
                                    <li>• Refrigerate reconstituted peptides (2–8 °C)</li>
                                    <li>• Do not freeze</li>
                                    <li>• Protect from light</li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="font-medium text-white mb-2">Administration</h4>
                                <ul className="space-y-1 text-sm">
                                    <li>• Swirl gently to mix (never shake)</li>
                                    <li>• Use sterile technique</li>
                                    <li>• Rotate injection sites</li>
                                    <li>• Default route: SubQ (subcutaneous)</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Attribution */}
                    <div className="mt-8 text-center">
                        <p className="text-sm text-gray-500">
                            © Dr. Kristi Sawicki 2025 |{' '}
                            <a
                                href="https://www.kristisawicki.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-theme-blue hover:underline"
                            >
                                www.kristisawicki.com
                            </a>
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                            Products referenced from BioLongevity Labs and Luvion Bio. Use code DRKRISTI for preferred pricing.
                        </p>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default PeptideCheatSheet;

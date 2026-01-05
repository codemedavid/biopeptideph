import React, { useState } from 'react';
import { useSmartGuides } from '../hooks/useSmartGuides';
import { SmartGuideFile } from '../types';
import { FileText, Image, File, ChevronDown, Eye, Search, Sparkles, X } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useCart } from '../hooks/useCart';

const SmartGuide: React.FC = () => {
    const { guides, loading } = useSmartGuides();
    const [expandedGuideId, setExpandedGuideId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewingFile, setViewingFile] = useState<SmartGuideFile | null>(null);
    const cart = useCart();

    const toggleExpand = (id: string) => {
        setExpandedGuideId(expandedGuideId === id ? null : id);
    };

    const getFileIcon = (type: string) => {
        switch (type) {
            case 'image': return <Image className="w-5 h-5 text-purple-500" />;
            case 'pdf': return <FileText className="w-5 h-5 text-red-500" />;
            default: return <File className="w-5 h-5 text-gray-500" />;
        }
    };

    const filteredGuides = guides.filter(guide =>
        guide.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        guide.files?.some(f => f.display_name.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="min-h-screen bg-gray-50 font-inter flex flex-col">
            <Header
                cartItemsCount={cart.getTotalItems()}
                onCartClick={() => window.location.href = '/'} // Simple redirect for now as it's a separate page structure
                onMenuClick={() => window.location.href = '/'}
            />

            <main className="flex-grow pt-24 pb-12 px-4 md:px-0">
                <div className="max-w-3xl mx-auto space-y-8">

                    {/* Header Section */}
                    <div className="text-center space-y-4">
                        <div className="inline-flex items-center gap-2 bg-theme-accent/10 text-theme-accent px-4 py-1.5 rounded-full text-sm font-semibold mb-2">
                            <Sparkles className="w-4 h-4" />
                            <span>Expert Knowledge Base</span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
                            Smart Guide System
                        </h1>
                        <p className="text-gray-500 max-w-lg mx-auto text-lg">
                            Instant access to protocols, solution guides, and peptide resources. Tap a topic below to view files.
                        </p>
                    </div>

                    {/* Search */}
                    <div className="relative max-w-xl mx-auto">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-11 pr-4 py-4 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-theme-accent focus:border-transparent shadow-sm transition-all"
                            placeholder="Search for a problem or topic..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Content List */}
                    <div className="space-y-4">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <div className="w-10 h-10 border-4 border-gray-200 border-t-theme-accent rounded-full animate-spin mb-4"></div>
                                <p className="text-gray-500">Loading guides...</p>
                            </div>
                        ) : filteredGuides.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 shadow-sm">
                                <p className="text-gray-500">No guides found matching your search.</p>
                            </div>
                        ) : (
                            filteredGuides.map((guide) => (
                                <div
                                    key={guide.id}
                                    className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200 hover:shadow-md"
                                >
                                    <button
                                        onClick={() => toggleExpand(guide.id)}
                                        className="w-full text-left p-5 flex items-center justify-between group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-full transition-colors ${expandedGuideId === guide.id ? 'bg-theme-accent text-white' : 'bg-gray-50 text-gray-500 group-hover:bg-gray-100'}`}>
                                                <FileText className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className={`font-bold text-lg transition-colors ${expandedGuideId === guide.id ? 'text-theme-accent' : 'text-gray-800'}`}>
                                                    {guide.title}
                                                </h3>
                                                <p className="text-sm text-gray-500 mt-0.5">
                                                    {guide.files?.length || 0} resources available
                                                </p>
                                            </div>
                                        </div>
                                        <div className={`transform transition-transform duration-300 ${expandedGuideId === guide.id ? 'rotate-180' : ''}`}>
                                            <ChevronDown className="w-5 h-5 text-gray-400" />
                                        </div>
                                    </button>

                                    {/* Dropdown Content */}
                                    <div
                                        className={`transition-all duration-300 ease-in-out bg-gray-50/50 ${expandedGuideId === guide.id ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                                            } overflow-hidden`}
                                    >
                                        <div className="p-4 pt-0 space-y-3">
                                            <div className="h-px bg-gray-100 mb-4 mx-4"></div>

                                            {guide.files && guide.files.length > 0 ? (
                                                guide.files.map((file) => (
                                                    <div
                                                        key={file.id}
                                                        onClick={() => setViewingFile(file)}
                                                        className="flex items-center justify-between p-4 mx-4 bg-white border border-gray-100 rounded-xl hover:border-theme-accent hover:shadow-sm transition-all group cursor-pointer"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-theme-accent/5 transition-colors">
                                                                {getFileIcon(file.file_type)}
                                                            </div>
                                                            <span className="font-medium text-gray-700 group-hover:text-theme-accent transition-colors">
                                                                {file.display_name}
                                                            </span>
                                                        </div>
                                                        <div className="bg-gray-50 p-2 rounded-full group-hover:bg-theme-accent group-hover:text-white transition-colors">
                                                            <Eye className="w-4 h-4" />
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-center text-gray-400 py-4 italic">No files uploaded for this topic yet.</p>
                                            )}
                                            <div className="h-2"></div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer Note */}
                    <div className="text-center pt-8 pb-4">
                        <p className="text-sm text-gray-400">
                            Need more help? <a href="https://wa.me/message/YOUR_WA_LINK" className="text-theme-accent font-medium hover:underline">Chat with us</a>
                        </p>
                    </div>
                </div>
            </main>

            <Footer />

            {/* File Viewer Modal */}
            {viewingFile && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-8">
                    <div className="relative w-full max-w-5xl h-full max-h-[90vh] bg-white rounded-2xl overflow-hidden flex flex-col shadow-2xl">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white z-10">
                            <h3 className="font-bold text-gray-900 truncate pr-4">
                                {viewingFile.display_name}
                            </h3>
                            <button
                                onClick={() => setViewingFile(null)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-900"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-grow bg-gray-100 overflow-auto flex items-center justify-center p-4 relative">
                            {viewingFile.file_type === 'pdf' ? (
                                <iframe
                                    src={`${viewingFile.file_url}#toolbar=0&navpanes=0&scrollbar=0`}
                                    className="w-full h-full rounded-lg shadow-sm bg-white"
                                    title={viewingFile.display_name}
                                />
                            ) : (
                                <img
                                    src={viewingFile.file_url}
                                    alt={viewingFile.display_name}
                                    className="max-w-full max-h-full object-contain rounded-lg shadow-sm select-none"
                                    onContextMenu={(e) => e.preventDefault()}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SmartGuide;

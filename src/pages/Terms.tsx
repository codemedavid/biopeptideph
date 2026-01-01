import { Link } from 'react-router-dom';

export default function Terms() {
    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="max-w-4xl mx-auto px-4">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-6">Terms and Conditions</h1>

                    <div className="prose prose-gray max-w-none space-y-6">
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
                            <p className="text-gray-700 leading-relaxed">
                                By accessing and using biopeptides.ph, you accept and agree to be bound by the terms and provision of this agreement.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Research Purposes Only</h2>
                            <p className="text-gray-700 leading-relaxed">
                                All peptides sold on this website are for research purposes only. They are not intended for human consumption,
                                medical use, or any therapeutic application. By purchasing from biopeptides.ph, you acknowledge that you are a
                                qualified researcher or institution.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Assessment Disclaimer</h2>
                            <p className="text-gray-700 leading-relaxed">
                                The peptide assessment tool is for informational and educational purposes only. It does not constitute medical
                                advice, diagnosis, or treatment. Always consult with a qualified healthcare provider before starting any new
                                health regimen or supplement program.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Product Information</h2>
                            <p className="text-gray-700 leading-relaxed">
                                While we strive to provide accurate product information, we do not warrant that product descriptions or other
                                content is accurate, complete, reliable, current, or error-free.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Limitation of Liability</h2>
                            <p className="text-gray-700 leading-relaxed">
                                biopeptides.ph shall not be liable for any indirect, incidental, special, consequential, or punitive damages
                                resulting from your use of or inability to use the service.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Age Restriction</h2>
                            <p className="text-gray-700 leading-relaxed">
                                You must be at least 18 years old to use this website and purchase products.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Contact Information</h2>
                            <p className="text-gray-700 leading-relaxed">
                                If you have any questions about these Terms and Conditions, please contact us at support@biopeptides.ph
                            </p>
                        </section>
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-200">
                        <Link
                            to="/assessment"
                            className="text-blue-600 hover:text-blue-700 font-medium"
                        >
                            ← Back to Assessment
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

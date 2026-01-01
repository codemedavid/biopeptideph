import { Link } from 'react-router-dom';

export default function Privacy() {
    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="max-w-4xl mx-auto px-4">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>

                    <div className="prose prose-gray max-w-none space-y-6">
                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Information We Collect</h2>
                            <p className="text-gray-700 leading-relaxed">
                                We collect information you provide directly to us, including when you create an account, place an order,
                                complete our peptide assessment, or contact us for support. This may include your name, email address,
                                phone number, shipping address, and health-related information provided during assessment.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. How We Use Your Information</h2>
                            <p className="text-gray-700 leading-relaxed mb-3">
                                We use the information we collect to:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                                <li>Process and fulfill your orders</li>
                                <li>Provide personalized peptide recommendations through our assessment tool</li>
                                <li>Send you order confirmations and shipping updates</li>
                                <li>Respond to your questions and provide customer support</li>
                                <li>Improve our products and services</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Assessment Data Privacy</h2>
                            <p className="text-gray-700 leading-relaxed">
                                Information provided during the peptide assessment is strictly confidential and will not be shared with
                                anyone outside of the biopeptides.ph team. Your health information is protected and used solely to generate
                                personalized recommendations.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Data Security</h2>
                            <p className="text-gray-700 leading-relaxed">
                                We implement appropriate technical and organizational measures to protect your personal information against
                                unauthorized access, alteration, disclosure, or destruction.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Information Sharing</h2>
                            <p className="text-gray-700 leading-relaxed">
                                We do not sell, trade, or rent your personal information to third parties. We may share your information
                                with trusted service providers who assist us in operating our website and conducting our business, subject
                                to confidentiality agreements.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Your Rights</h2>
                            <p className="text-gray-700 leading-relaxed">
                                You have the right to access, update, or delete your personal information at any time. You may also opt
                                out of receiving promotional communications from us.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Cookies</h2>
                            <p className="text-gray-700 leading-relaxed">
                                We use cookies and similar tracking technologies to improve your browsing experience and analyze site traffic.
                                You can control cookie settings through your browser preferences.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Changes to This Policy</h2>
                            <p className="text-gray-700 leading-relaxed">
                                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new
                                Privacy Policy on this page and updating the "Last Updated" date.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Contact Us</h2>
                            <p className="text-gray-700 leading-relaxed">
                                If you have any questions about this Privacy Policy, please contact us at privacy@biopeptides.ph
                            </p>
                        </section>
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-200 flex justify-between items-center">
                        <Link
                            to="/assessment"
                            className="text-blue-600 hover:text-blue-700 font-medium"
                        >
                            ← Back to Assessment
                        </Link>
                        <p className="text-sm text-gray-500">Last Updated: December 16, 2025</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

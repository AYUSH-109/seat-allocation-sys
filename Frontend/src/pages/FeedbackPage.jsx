import React from 'react';

const FeedbackPage = () => {
    // State management for form fields
    const [issueType, setIssueType] = React.useState('Visual/Aesthetic Issue'); 
    const [priority, setPriority] = React.useState('Medium Priority');
    const [description, setDescription] = React.useState('');
    const [featureSuggestion, setFeatureSuggestion] = React.useState('');
    const [additionalInfo, setAdditionalInfo] = React.useState('');
    const [imageFile, setImageFile] = React.useState(null);
    const [isSubmitted, setIsSubmitted] = React.useState(false);

    // Issue type options
    const issueOptions = [
        'Functionality Issue', 'Visual/Aesthetic Issue', 'Performance Issue', 
        'Security Issue', 'Data/Content Issue', 'Crash/Error Issue', 
        'Localization/Internationalization Issue', 'Usability/UX Issue', 'Other'
    ];

    // Priority options with corresponding colors
    const priorityOptions = [
        { label: 'High Priority', colorClass: 'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600' },
        { label: 'Medium Priority', colorClass: 'bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-500 dark:hover:bg-yellow-600' },
        { label: 'Low Priority', colorClass: 'bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600' },
    ];

    const handleSubmit = (e) => {
        e.preventDefault();
        // Simulation of submission
        console.log("Feedback Submitted:", { issueType, priority, description, featureSuggestion, additionalInfo, imageFile });
        
        setIsSubmitted(true);
        
        // Clear form after submission simulation
        setTimeout(() => {
            setIssueType('Visual/Aesthetic Issue');
            setPriority('Medium Priority');
            setDescription('');
            setFeatureSuggestion('');
            setAdditionalInfo('');
            setImageFile(null);
            setIsSubmitted(false);
        }, 3000);
    };

    return (
        // Outer container with dark mode support
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
            <div className="max-w-4xl mx-auto px-4 sm:px-10 pt-8 pb-16">
                
                {/* HEADING */}
                <h1 className="text-4xl sm:text-5xl font-extrabold text-center mb-12 uppercase text-gray-900 dark:text-white transition-colors duration-300">
                    FEEDBACK (BUG/FEATURE) SECTION
                </h1>

                {/* Submission Success Message */}
                {isSubmitted && (
                    <div className="bg-green-100 dark:bg-green-900 border border-green-500 dark:border-green-400 p-4 rounded-lg text-center font-semibold mb-6 shadow-xl text-green-800 dark:text-green-100 transition-all duration-300">
                        Thank you! Your feedback has been successfully submitted.
                    </div>
                )}

                {/* Main Form Container */}
                <div className="bg-white dark:bg-gray-800 p-8 md:p-12 rounded-xl shadow-2xl border-2 border-gray-200 dark:border-gray-700 transition-colors duration-300">
                    <form onSubmit={handleSubmit} className="space-y-8 text-left">
                        
                        {/* 1. Reason for Reporting (Issue Type Tags) */}
                        <div>
                            <label className="block text-lg font-bold mb-3 text-gray-900 dark:text-white transition-colors duration-300">
                                Reason for reporting this bug?
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {issueOptions.map(issue => (
                                    <button
                                        key={issue}
                                        type="button"
                                        onClick={() => setIssueType(issue)}
                                        className={`px-4 py-2 text-sm font-semibold rounded-md transition-all duration-200 border ${
                                            issueType === issue 
                                                ? 'bg-blue-600 dark:bg-blue-500 text-white border-blue-500 dark:border-blue-400 shadow-md' 
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }`}
                                    >
                                        {issue}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 2. Detailed Bug Description */}
                        <div>
                            <label htmlFor="description" className="block text-lg font-bold mb-2 text-gray-900 dark:text-white transition-colors duration-300">
                                Can you provide clarity on the bug? <span className="font-normal text-gray-500 dark:text-gray-400 text-sm">Help us understand</span>
                            </label>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 transition-colors duration-300">
                                Provide a detailed description of the bug, including steps to reproduce it, expected behavior, and actual behavior.
                            </p>
                            <textarea
                                id="description"
                                name="description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows="10" 
                                placeholder="e.g., Step 1: Click the 'Home' tab. Step 2: Resize the window to mobile width. Expected: Nav bar collapses. Actual: Nav bar overlaps content."
                                required
                                className="w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 placeholder-gray-400 dark:placeholder-gray-500 resize-y transition-all duration-300 outline-none"
                            ></textarea>
                        </div>
                        
                        {/* 3. Feature Suggestion Section */}
                        <div>
                            <label htmlFor="featureSuggestion" className="block text-lg font-bold mb-2 text-gray-900 dark:text-white transition-colors duration-300">
                                Feature Suggestions
                            </label>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 transition-colors duration-300">
                                Describe any new features, improvements, or tools you would like to see added to the system.
                            </p>
                            <textarea
                                id="featureSuggestion"
                                name="featureSuggestion"
                                value={featureSuggestion}
                                onChange={(e) => setFeatureSuggestion(e.target.value)}
                                rows="6" 
                                placeholder="Example: It would be great to have an export button for the seating chart in PDF format."
                                className="w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 placeholder-gray-400 dark:placeholder-gray-500 resize-y transition-all duration-300 outline-none"
                            ></textarea>
                        </div>

                        {/* 4. Bug Priority */}
                        <div>
                            <label className="block text-lg font-bold mb-3 text-gray-900 dark:text-white transition-colors duration-300">
                                Bug priority
                            </label>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 transition-colors duration-300">
                                Choose the priority level of the bug: High/Medium/Low. Priority indicates the urgency and impact of the bug.
                            </p>
                            <div className="flex flex-wrap gap-4">
                                {priorityOptions.map(opt => (
                                    <button
                                        key={opt.label}
                                        type="button"
                                        onClick={() => setPriority(opt.label)}
                                        className={`px-4 py-2 text-sm font-semibold rounded-md text-white transition-all duration-200 ${
                                            priority === opt.label
                                                ? opt.colorClass 
                                                : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                                        } border border-transparent`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 5. Attach Files */}
                        <div>
                            <label className="block text-lg font-bold mb-2 text-gray-900 dark:text-white transition-colors duration-300">
                                Attach files
                            </label>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 transition-colors duration-300">
                                Attach screenshots, screen recordings, or any other relevant files that illustrate the bug.
                            </p>
                            <input
                                type="file"
                                id="imageFile"
                                name="imageFile"
                                accept="image/*,video/*"
                                onChange={(e) => setImageFile(e.target.files[0])}
                                className="w-full text-sm text-gray-700 dark:text-gray-300
                                    file:mr-4 file:py-2 file:px-4
                                    file:rounded-md file:border file:border-gray-300 dark:file:border-gray-600
                                    file:text-sm file:font-semibold
                                    file:bg-gray-100 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-white
                                    hover:file:bg-gray-200 dark:hover:file:bg-gray-600 file:cursor-pointer
                                    transition-all duration-300
                                "
                            />
                            {imageFile && (
                                <p className="text-sm mt-2 text-gray-600 dark:text-gray-400 transition-colors duration-300">
                                    File attached: {imageFile.name}
                                </p>
                            )}
                        </div>
                        
                        {/* 6. Additional Information */}
                        <div>
                            <label htmlFor="additionalInfo" className="block text-lg font-bold mb-2 text-gray-900 dark:text-white transition-colors duration-300">
                                Additional information
                            </label>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 transition-colors duration-300">
                                Include any additional information that might be helpful in resolving the bug, such as error logs, console outputs, or relevant URLs.
                            </p>
                            <textarea
                                id="additionalInfo"
                                name="additionalInfo"
                                value={additionalInfo}
                                onChange={(e) => setAdditionalInfo(e.target.value)}
                                rows="6" 
                                placeholder="Paste error logs, URLs, or notes here."
                                className="w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 placeholder-gray-400 dark:placeholder-gray-500 resize-y transition-all duration-300 outline-none"
                            ></textarea>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            className="w-full py-3 px-6 bg-blue-600 dark:bg-blue-500 text-white font-bold rounded-lg text-xl shadow-xl hover:bg-blue-700 dark:hover:bg-blue-600 transition-all duration-300 mt-6"
                        >
                            Submit Feedback
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default FeedbackPage;
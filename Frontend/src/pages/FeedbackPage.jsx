import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getToken } from '../utils/tokenStorage';
import SplitText from '../components/SplitText';
import { AlertCircle, Lightbulb, Upload, Send, CheckCircle, Clock, AlertTriangle, Loader2, X, Eye, Download } from 'lucide-react';
import { motion } from 'framer-motion';

const FeedbackPage = ({ showToast }) => {
    const { user } = useAuth();
    // State management for form fields
    const [issueType, setIssueType] = React.useState('Functionality Issue'); 
    const [priority, setPriority] = React.useState('Medium Priority');
    const [description, setDescription] = React.useState('');
    const [featureSuggestion, setFeatureSuggestion] = React.useState('');
    const [additionalInfo, setAdditionalInfo] = React.useState('');
    const [imageFile, setImageFile] = React.useState(null);
    const [isSubmitted, setIsSubmitted] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [feedbackHistory, setFeedbackHistory] = React.useState([]);
    const [loadingHistory, setLoadingHistory] = React.useState(false);
    const [activeTab, setActiveTab] = React.useState('submit'); // 'submit' or 'history'
    const [selectedFeedback, setSelectedFeedback] = React.useState(null);

    // Issue type options with icons
    const issueOptions = [
        'Functionality Issue', 'Visual/Aesthetic Issue', 'Performance Issue', 
        'Security Issue', 'Data/Content Issue', 'Crash/Error Issue', 
        'Localization/Internationalization Issue', 'Usability/UX Issue', 'Other'
    ];

    // Priority options with corresponding colors
    const priorityOptions = [
        { 
            label: 'High Priority', 
            colorClass: 'bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700',
            borderClass: 'border-red-500 dark:border-red-600',
            icon: AlertCircle
        },
        { 
            label: 'Medium Priority', 
            colorClass: 'bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700',
            borderClass: 'border-amber-500 dark:border-amber-600',
            icon: AlertTriangle
        },
        { 
            label: 'Low Priority', 
            colorClass: 'bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700',
            borderClass: 'border-emerald-500 dark:border-emerald-600',
            icon: Clock
        },
    ];

    const getAuthToken = () => {
        return getToken();
    };

    const fetchFeedbackHistory = async () => {
        setLoadingHistory(true);
        try {
            const token = getAuthToken();
            const response = await fetch('/api/feedback', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setFeedbackHistory(data.feedback || []);
            } else {
                showToast('Failed to load feedback history', 'error');
            }
        } catch (error) {
            console.error('Error fetching feedback:', error);
            showToast('Error loading feedback history', 'error');
        } finally {
            setLoadingHistory(false);
        }
    };

    React.useEffect(() => {
        if (activeTab === 'history') {
            fetchFeedbackHistory();
        }
    }, [activeTab]);

    // Re-fetch when user changes (account switch)
    const userIdentity = user?.email || user?.id;
    React.useEffect(() => {
        if (userIdentity) {
            setFeedbackHistory([]);
            setSelectedFeedback(null);
            if (activeTab === 'history') {
                fetchFeedbackHistory();
            }
        }
    }, [userIdentity]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!description.trim()) {
            showToast('Please provide a description', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const token = getAuthToken();
            const formData = new FormData();
            formData.append('issueType', issueType);
            formData.append('priority', priority);
            formData.append('description', description);
            formData.append('featureSuggestion', featureSuggestion);
            formData.append('additionalInfo', additionalInfo);
            if (imageFile) {
                formData.append('file', imageFile);
            }

            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                setIsSubmitted(true);
                showToast('Feedback submitted successfully!', 'success');

                setTimeout(() => {
                    setIssueType('Functionality Issue');
                    setPriority('Medium Priority');
                    setDescription('');
                    setFeatureSuggestion('');
                    setAdditionalInfo('');
                    setImageFile(null);
                    setIsSubmitted(false);
                }, 2000);
            } else {
                const error = await response.json();
                showToast(error.error || 'Failed to submit feedback', 'error');
            }
        } catch (error) {
            console.error('Error submitting feedback:', error);
            showToast('Error submitting feedback', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusBadge = (status) => {
        const statusMap = {
            pending: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-800 dark:text-yellow-400', label: 'Pending' },
            resolved: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-400', label: 'Resolved' },
            rejected: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-400', label: 'Rejected' }
        };
        
        const statusStyle = statusMap[status] || statusMap.pending;
        
        return (
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusStyle.bg} ${statusStyle.text}`}>
                {statusStyle.label}
            </span>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#050505] py-8 px-4 transition-colors duration-300">
            <div className="max-w-5xl mx-auto space-y-8">
                
                {/* Hero Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#c0c0c0] dark:border-[#8a8a8a]">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="relative w-3 h-3">
                                <div className="absolute inset-0 bg-orange-500 rounded-full animate-ping opacity-75"></div>
                                <div className="relative w-3 h-3 bg-orange-500 rounded-full border border-orange-400"></div>
                            </div>
                            <span className="text-xs font-mono text-orange-500 tracking-wider uppercase">Feedback System</span>
                        </div>
                        <SplitText
                            text={`Report Bugs & Suggest Features`}
                            className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-gray-900 via-gray-700 to-gray-500 dark:from-gray-100 dark:via-gray-300 dark:to-gray-500 bg-clip-text text-transparent"
                            splitType="chars"
                            delay={30}
                        />
                        <p className="text-gray-600 dark:text-gray-400 mt-2">
                            Help us improve by sharing your feedback and suggestions
                        </p>
                    </div>
                    
                    <div className="flex gap-4">
                        <div className="text-right">
                            <div className="micro-label mb-1">Response Time</div>
                            <div className="font-mono text-xl text-orange-600 dark:text-orange-400">24-48h</div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 border-b border-[#c0c0c0] dark:border-[#8a8a8a]">
                    <motion.button
                        onClick={() => setActiveTab('submit')}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`px-4 py-3 font-bold uppercase tracking-wider transition-all border-b-2 ${
                            activeTab === 'submit'
                                ? 'text-orange-600 dark:text-orange-400 border-orange-500'
                                : 'text-gray-600 dark:text-gray-400 border-transparent hover:border-gray-300 dark:hover:border-gray-700'
                        }`}
                    >
                        <Send size={18} className="inline mr-2" />
                        Submit Feedback
                    </motion.button>
                    <motion.button
                        onClick={() => setActiveTab('history')}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`px-4 py-3 font-bold uppercase tracking-wider transition-all border-b-2 ${
                            activeTab === 'history'
                                ? 'text-orange-600 dark:text-orange-400 border-orange-500'
                                : 'text-gray-600 dark:text-gray-400 border-transparent hover:border-gray-300 dark:hover:border-gray-700'
                        }`}
                    >
                        <Clock size={18} className="inline mr-2" />
                        My Feedback
                    </motion.button>
                </div>

                {/* Submit Tab */}
                {activeTab === 'submit' && (
                    <>
                        {isSubmitted && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="glass-card border-2 border-emerald-500 p-6 shadow-lg"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                            <CheckCircle className="text-emerald-600 dark:text-emerald-400" size={24} />
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-lg font-bold text-gray-900 dark:text-white">Feedback Submitted Successfully!</p>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Thank you for helping us improve. We'll review your feedback shortly.</p>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Main Form */}
                        <div className="glass-card p-8 md:p-10 border border-[#c0c0c0] dark:border-[#8a8a8a] shadow-[0_0_28px_rgba(192,192,192,0.24)]">
                            <form onSubmit={handleSubmit} className="space-y-8">
                                
                                {/* 1. Issue Type */}
                                <div>
                                    <label className="flex items-center gap-2 text-lg font-bold mb-4 text-gray-900 dark:text-white uppercase tracking-wide">
                                        <AlertCircle className="text-orange-500" size={20} />
                                        Issue Type
                                    </label>
                                    <div className="flex flex-wrap gap-3">
                                        {issueOptions.map((issue) => (
                                            <motion.button
                                                key={issue}
                                                type="button"
                                                onClick={() => setIssueType(issue)}
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                className={`px-4 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 border-2 ${
                                                    issueType === issue 
                                                        ? 'bg-orange-500 dark:bg-orange-600 text-white border-orange-500 shadow-lg' 
                                                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-[#c0c0c0] dark:border-[#8a8a8a] hover:border-orange-500'
                                                }`}
                                            >
                                                {issue}
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>

                                {/* 2. Bug Description */}
                                <div>
                                    <label htmlFor="description" className="flex items-center gap-2 text-lg font-bold mb-2 text-gray-900 dark:text-white uppercase tracking-wide">
                                        <AlertCircle className="text-orange-500" size={20} />
                                        Description *
                                    </label>
                                    <textarea
                                        id="description"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows="8" 
                                        placeholder="Describe the issue in detail..."
                                        required
                                        className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-2 border-[#c0c0c0] dark:border-[#8a8a8a] rounded-xl p-4 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-gray-400 dark:placeholder-gray-500 resize-y transition-all outline-none"
                                    ></textarea>
                                </div>
                                
                                {/* 3. Feature Suggestion */}
                                <div>
                                    <label htmlFor="featureSuggestion" className="flex items-center gap-2 text-lg font-bold mb-2 text-gray-900 dark:text-white uppercase tracking-wide">
                                        <Lightbulb className="text-orange-500" size={20} />
                                        Feature Suggestions
                                    </label>
                                    <textarea
                                        id="featureSuggestion"
                                        value={featureSuggestion}
                                        onChange={(e) => setFeatureSuggestion(e.target.value)}
                                        rows="5" 
                                        placeholder="What features would you like to see?"
                                        className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-2 border-[#c0c0c0] dark:border-[#8a8a8a] rounded-xl p-4 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-gray-400 dark:placeholder-gray-500 resize-y transition-all outline-none"
                                    ></textarea>
                                </div>

                                {/* 4. Priority */}
                                <div>
                                    <label className="flex items-center gap-2 text-lg font-bold mb-3 text-gray-900 dark:text-white uppercase tracking-wide">
                                        <AlertTriangle className="text-orange-500" size={20} />
                                        Priority Level
                                    </label>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {priorityOptions.map((opt) => (
                                            <motion.button
                                                key={opt.label}
                                                type="button"
                                                onClick={() => setPriority(opt.label)}
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                className={`relative overflow-hidden px-6 py-4 text-sm font-bold rounded-xl text-white transition-all border-2 ${
                                                    priority === opt.label
                                                        ? `${opt.colorClass} ${opt.borderClass} shadow-lg` 
                                                        : 'bg-gray-200 dark:bg-gray-700 border-[#c0c0c0] dark:border-[#8a8a8a]'
                                                }`}
                                            >
                                                <div className="flex items-center justify-center gap-2">
                                                    <opt.icon size={18} />
                                                    {opt.label}
                                                </div>
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>

                                {/* 5. Attach Files */}
                                <div>
                                    <label className="flex items-center gap-2 text-lg font-bold mb-2 text-gray-900 dark:text-white uppercase tracking-wide">
                                        <Upload className="text-orange-500" size={20} />
                                        Attach Files
                                    </label>
                                    <input
                                        type="file"
                                        accept="image/*,video/*,.pdf,.doc,.docx"
                                        onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                                        className="w-full text-sm text-gray-700 dark:text-gray-300
                                            file:mr-4 file:py-3 file:px-6
                                            file:rounded-lg file:border-2 file:border-orange-500 dark:file:border-orange-400
                                            file:text-sm file:font-bold
                                            file:bg-orange-50 dark:file:bg-orange-900/20 file:text-orange-700 dark:file:text-orange-300
                                            hover:file:bg-orange-100 dark:hover:file:bg-orange-900/30 file:cursor-pointer
                                            file:transition-all file:duration-300
                                            cursor-pointer
                                        "
                                    />
                                    {imageFile && (
                                        <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-lg flex items-center gap-2">
                                            <CheckCircle className="text-orange-600 dark:text-orange-400" size={18} />
                                            <p className="text-sm text-gray-900 dark:text-white">{imageFile.name}</p>
                                        </div>
                                    )}
                                </div>

                                {/* 6. Additional Info */}
                                <div>
                                    <label htmlFor="additionalInfo" className="flex items-center gap-2 text-lg font-bold mb-2 text-gray-900 dark:text-white uppercase tracking-wide">
                                        <AlertCircle className="text-orange-500" size={20} />
                                        Additional Information
                                    </label>
                                    <textarea
                                        id="additionalInfo"
                                        value={additionalInfo}
                                        onChange={(e) => setAdditionalInfo(e.target.value)}
                                        rows="4" 
                                        placeholder="Paste error logs, URLs, or additional context..."
                                        className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-2 border-[#c0c0c0] dark:border-[#8a8a8a] rounded-xl p-4 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder-gray-400 dark:placeholder-gray-500 resize-y transition-all outline-none font-mono text-sm"
                                    ></textarea>
                                </div>

                                {/* Submit Button */}
                                <motion.button
                                    type="submit"
                                    disabled={isSubmitting}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="w-full py-4 px-6 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-xl text-lg shadow-xl hover:from-orange-600 hover:to-amber-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="animate-spin" size={20} />
                                            Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <Send size={20} />
                                            Submit Feedback
                                        </>
                                    )}
                                </motion.button>
                            </form>
                        </div>
                    </>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                    <div className="space-y-4">
                        {loadingHistory ? (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="glass-card p-12 text-center"
                            >
                                <Loader2 className="animate-spin mx-auto mb-3 w-8 h-8 text-orange-500" />
                                <p className="text-gray-600 dark:text-gray-400 font-bold">Loading your feedback...</p>
                            </motion.div>
                        ) : feedbackHistory.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="glass-card p-12 text-center border border-[#c0c0c0] dark:border-[#8a8a8a]"
                            >
                                <Clock className="mx-auto mb-3 w-12 h-12 text-gray-300 dark:text-gray-700" />
                                <p className="text-gray-600 dark:text-gray-400 font-bold">No feedback submitted yet</p>
                                <p className="text-sm text-gray-500 dark:text-gray-500">Your feedback submissions will appear here</p>
                            </motion.div>
                        ) : (
                            feedbackHistory.map((feedback, idx) => (
                                <motion.div
                                    key={feedback.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    className="glass-card p-6 border border-[#c0c0c0] dark:border-[#8a8a8a] transition-all cursor-pointer"
                                    onClick={() => setSelectedFeedback(feedback)}
                                >
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="text-lg font-bold text-gray-900 dark:text-white uppercase">{feedback.issue_type}</h3>
                                                {getStatusBadge(feedback.status)}
                                            </div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">{feedback.description}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-500">
                                                {new Date(feedback.created_at).toLocaleDateString()} • Priority: {feedback.priority}
                                            </p>
                                        </div>
                                        <motion.button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedFeedback(feedback);
                                            }}
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.95 }}
                                            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold text-sm"
                                        >
                                            <Eye size={16} className="inline mr-2" />
                                            View Details
                                        </motion.button>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>
                )}

                {/* Details Modal */}
                {selectedFeedback && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setSelectedFeedback(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-[#c0c0c0] dark:border-[#8a8a8a]"
                        >
                            {/* Modal Header */}
                            <div className="p-6 border-b border-[#c0c0c0] dark:border-[#8a8a8a] bg-gradient-to-r from-orange-50 to-amber-50 dark:from-gray-700/50 dark:to-gray-700 flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedFeedback.issue_type}</h2>
                                    <div className="flex items-center gap-3 mt-2">
                                        {getStatusBadge(selectedFeedback.status)}
                                        <span className="text-sm text-gray-600 dark:text-gray-400">
                                            {new Date(selectedFeedback.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                                <motion.button
                                    onClick={() => setSelectedFeedback(null)}
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
                                >
                                    <X size={24} className="text-gray-500" />
                                </motion.button>
                            </div>

                            {/* Modal Content */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 p-4 rounded-lg border-l-4 border-red-500 dark:border-red-400">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-red-600 dark:text-red-300 mb-2 flex items-center gap-2">
                                        <AlertTriangle size={16} />
                                        Priority
                                    </h3>
                                    <p className="text-lg font-bold text-gray-900 dark:text-white">{selectedFeedback.priority}</p>
                                </div>

                                <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 p-4 rounded-lg border-l-4 border-blue-500 dark:border-blue-400">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-blue-600 dark:text-blue-300 mb-2 flex items-center gap-2">
                                        <AlertCircle size={16} />
                                        Description
                                    </h3>
                                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{selectedFeedback.description}</p>
                                </div>

                                {selectedFeedback.feature_suggestion && (
                                    <div className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 p-4 rounded-lg border-l-4 border-emerald-500 dark:border-emerald-400">
                                        <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-300 mb-2 flex items-center gap-2">
                                            <Lightbulb size={16} />
                                            Feature Suggestion
                                        </h3>
                                        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{selectedFeedback.feature_suggestion}</p>
                                    </div>
                                )}

                                {selectedFeedback.additional_info && (
                                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 p-4 rounded-lg border-l-4 border-purple-500 dark:border-purple-400">
                                        <h3 className="text-sm font-bold uppercase tracking-wider text-purple-600 dark:text-purple-300 mb-2 flex items-center gap-2">
                                            <Upload size={16} />
                                            Additional Info
                                        </h3>
                                        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono text-sm">{selectedFeedback.additional_info}</p>
                                    </div>
                                )}

                                {selectedFeedback.admin_response && (
                                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border-l-4 border-green-500">
                                        <p className="text-xs font-bold uppercase text-green-600 dark:text-green-400 mb-2">Admin Response</p>
                                        <p className="text-green-900 dark:text-green-100">{selectedFeedback.admin_response}</p>
                                    </div>
                                )}

                                {selectedFeedback.file_name && (
                                    <div className="flex items-center gap-3 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                                        <Upload size={20} className="text-orange-500" />
                                        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{selectedFeedback.file_name}</span>
                                        <motion.button
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.95 }}
                                            className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg"
                                        >
                                            <Download size={18} className="text-orange-600 dark:text-orange-400" />
                                        </motion.button>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-6 border-t border-[#c0c0c0] dark:border-[#8a8a8a] bg-gray-50 dark:bg-gray-700/30 flex justify-end">
                                <motion.button
                                    onClick={() => setSelectedFeedback(null)}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold"
                                >
                                    Close
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {/* Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="glass-card border border-[#c0c0c0] dark:border-[#8a8a8a] border-l-4 border-orange-500 p-6 shadow-[0_0_22px_rgba(192,192,192,0.22)] dark:shadow-[0_0_22px_rgba(138,138,138,0.24)]">
                        <div className="flex gap-4">
                            <div className="flex-shrink-0">
                                <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                                    <AlertCircle className="text-orange-500" size={20} />
                                </div>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">Bug Reports</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                    Be as detailed as possible when describing bugs. Include steps to reproduce, expected vs actual behavior.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card border border-[#c0c0c0] dark:border-[#8a8a8a] border-l-4 border-amber-500 p-6 shadow-[0_0_22px_rgba(192,192,192,0.22)] dark:shadow-[0_0_22px_rgba(138,138,138,0.24)]">
                        <div className="flex gap-4">
                            <div className="flex-shrink-0">
                                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                    <Lightbulb className="text-amber-500" size={20} />
                                </div>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">Feature Requests</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                    Share your ideas for new features or improvements. All suggestions are valuable to us!
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style jsx>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }

                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
};

export default FeedbackPage;
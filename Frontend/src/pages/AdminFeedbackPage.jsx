import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getToken } from '../utils/tokenStorage';
import { 
  Loader2, 
  AlertCircle, 
  CheckCircle, 
  Eye, 
  Download,
  AlertTriangle,
  Clock,
  MessageSquare,
  Search,
  Bug,
  Lightbulb,
  Zap,
  AlertOctagon,
  X,
  User,
  Mail,
  Calendar,
  FileText,
  Plus,
  BarChart3,
  Inbox,
  Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Constants for UI configuration
const CONSTANTS = {
  severities: {
    high: { 
      badgeClass: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400',
      gradientClass: 'from-orange-500 to-orange-600',
      textClass: 'text-orange-700 dark:text-orange-400',
      icon: AlertTriangle, 
      label: 'High' 
    },
    medium: { 
      badgeClass: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400',
      gradientClass: 'from-yellow-500 to-yellow-600',
      textClass: 'text-yellow-700 dark:text-yellow-400',
      icon: Clock, 
      label: 'Medium' 
    },
    low: { 
      badgeClass: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400',
      gradientClass: 'from-green-500 to-green-600',
      textClass: 'text-green-700 dark:text-green-400',
      icon: CheckCircle, 
      label: 'Low' 
    }
  },
  issueTypes: {
    'Functionality Issue': { icon: Bug, color: 'text-blue-600 dark:text-blue-400', badgeClass: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
    'Visual/Aesthetic Issue': { icon: Zap, color: 'text-purple-600 dark:text-purple-400', badgeClass: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
    'Performance Issue': { icon: Zap, color: 'text-orange-600 dark:text-orange-400', badgeClass: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' },
    'Feature Suggestion': { icon: Lightbulb, color: 'text-yellow-600 dark:text-yellow-400', badgeClass: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
    'Security Issue': { icon: AlertCircle, color: 'text-red-600 dark:text-red-400', badgeClass: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
  },
  statuses: {
    pending: { 
      label: 'Pending', 
      badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
      textClass: 'text-slate-700 dark:text-slate-300',
      icon: Clock
    },
    resolved: { 
      label: 'Resolved', 
      badgeClass: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
      textClass: 'text-green-700 dark:text-green-400',
      icon: CheckCircle
    },
    rejected: { 
      label: 'Rejected', 
      badgeClass: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
      textClass: 'text-red-700 dark:text-red-400',
      icon: AlertCircle
    }
  }
};

const AdminFeedbackPage = ({ showToast }) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isAdminRole = (role) => {
    if (!role) return false;
    const normalized = String(role).trim().toLowerCase();
    return normalized === 'admin' || normalized === 'developer';
  };
  
  // State management
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterType, setFilterType] = useState('all');

  // Redirect if not admin
  useEffect(() => {
    if (user && !isAdminRole(user.role)) {
      showToast('Admin access required', 'error');
      navigate('/dashboard');
    }
  }, [user, navigate, showToast]);

  // Fetch all feedback
  const fetchAllFeedback = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const response = await fetch('/api/feedback/admin/all', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setFeedbacks(data.feedback || []);
      } else if (response.status === 403) {
        showToast('You do not have permission to view this', 'error');
        navigate('/dashboard');
      } else {
        showToast('Failed to load feedback', 'error');
      }
    } catch (error) {
      console.error('Error fetching feedback:', error);
      showToast('Error loading feedback', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when user changes (account switch)
  const userIdentity = user?.email || user?.id;
  useEffect(() => {
    if (userIdentity && isAdminRole(user?.role)) {
      setFeedbacks([]);
      setSelectedFeedback(null);
      fetchAllFeedback();
    }
  }, [userIdentity, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate stats
  const stats = useMemo(() => {
    return {
      total: feedbacks.length,
      pending: feedbacks.filter(f => (f.status || 'pending') === 'pending').length,
      resolved: feedbacks.filter(f => (f.status || 'pending') === 'resolved').length,
      high: feedbacks.filter(f => f.priority === 'high').length
    };
  }, [feedbacks]);

  // Filtered and sorted feedback
  const filteredFeedbacks = useMemo(() => {
    return feedbacks
      .filter(fb => {
        let match = true;

        if (filterPriority !== 'all') {
          match = match && fb.priority === filterPriority;
        }

        if (filterStatus !== 'all') {
          match = match && (fb.status || 'pending') === filterStatus;
        }

        if (filterType !== 'all') {
          match = match && fb.issue_type === filterType;
        }

        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          match = match && (
            fb.description?.toLowerCase().includes(term) ||
            fb.username?.toLowerCase().includes(term) ||
            fb.email?.toLowerCase().includes(term) ||
            fb.issue_type?.toLowerCase().includes(term)
          );
        }

        return match;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.created_at) - new Date(a.created_at);
        } else if (sortBy === 'oldest') {
          return new Date(a.created_at) - new Date(b.created_at);
        } else if (sortBy === 'priority') {
          const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
          return (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4);
        }
        return 0;
      });
  }, [feedbacks, filterPriority, filterStatus, filterType, searchTerm, sortBy]);

  // Helper functions
  const getSeverityConfig = (priority) => CONSTANTS.severities[priority] || CONSTANTS.severities.low;
  const getStatusConfig = (status) => CONSTANTS.statuses[status] || CONSTANTS.statuses.pending;
  const getIssueIcon = (issueType) => {
    const config = CONSTANTS.issueTypes[issueType];
    return config ? { Icon: config.icon, color: config.color } : { Icon: Bug, color: 'text-gray-600 dark:text-gray-400' };
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#050505] py-8 px-4 transition-colors duration-300 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto" />
          <p className="text-gray-600 dark:text-gray-400">Loading feedback...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#050505] py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section with Stats */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Left: Title and Description */}
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl shadow-lg">
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold pb-1 bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                  Feedback Hub
                </h1>
                <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                  Monitor and manage user feedback across the system
                </p>
              </div>
            </div>

            {/* Right: Stats Line */}
            <div className="flex flex-wrap items-center gap-6 md:gap-8 md:justify-end">
              {[
                { label: 'Total Feedback', value: stats.total, color: 'text-blue-600 dark:text-blue-400' },
                { label: 'Pending', value: stats.pending, color: 'text-yellow-600 dark:text-yellow-400' },
                { label: 'Resolved', value: stats.resolved, color: 'text-green-600 dark:text-green-400' },
                { label: 'High Priority', value: stats.high, color: 'text-orange-600 dark:text-orange-400' }
              ].map((stat, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.08 }}
                  className={`flex items-center gap-2 font-semibold ${stat.color} whitespace-nowrap`}
                >
                  <span className="text-lg">•</span>
                  <span className="text-sm md:text-base">{stat.label}</span>
                  <span className="text-lg md:text-xl font-bold">{stat.value}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Search and Filter Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-8 space-y-4"
        >
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by description, user, email, or type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Priority Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Priority:</span>
              <div className="flex gap-2">
                {['all', 'critical', 'high', 'medium', 'low'].map((p) => (
                  <motion.button
                    key={p}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setFilterPriority(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      filterPriority === p
                        ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700'
                    }`}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Status:</span>
              <div className="flex gap-2">
                {['all', 'pending', 'resolved', 'rejected'].map((s) => (
                  <motion.button
                    key={s}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setFilterStatus(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      filterStatus === s
                        ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700'
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Sort */}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="priority">By Priority</option>
              </select>
            </div>
          </div>
        </motion.div>

        {/* Feedback List */}
        <div className="space-y-3">
          {filteredFeedbacks.length > 0 ? (
            <AnimatePresence>
              {filteredFeedbacks.map((feedback, idx) => {
                const severityConfig = getSeverityConfig(feedback.priority);
                const statusConfig = getStatusConfig(feedback.status || 'pending');
                const { Icon: IssueIcon, color: issueColor } = getIssueIcon(feedback.issue_type);

                return (
                  <motion.div
                    key={feedback.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                    onClick={() => {
                      setSelectedFeedback(feedback);
                      setIsModalOpen(true);
                    }}
                    whileHover={{ translateY: -2, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                    className={`p-5 rounded-xl border border-l-4 cursor-pointer transition-all backdrop-blur-sm ${
                      feedback.priority === 'critical'
                        ? 'bg-red-50 dark:bg-red-950/30 border-gray-200 dark:border-slate-800 border-l-red-500'
                        : feedback.priority === 'high'
                        ? 'bg-orange-50 dark:bg-orange-950/30 border-gray-200 dark:border-slate-800 border-l-orange-500'
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 border-l-gray-300 dark:border-l-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`p-2 rounded-lg ${issueColor} bg-opacity-20`}>
                            <IssueIcon className={`w-4 h-4 ${issueColor}`} />
                          </div>
                          <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1">
                            {feedback.description}
                          </h3>
                        </div>

                        {/* Metadata Footer */}
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                            <User className="w-3.5 h-3.5" />
                            <span className="truncate">{feedback.username}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{formatDate(feedback.created_at)}</span>
                          </div>
                          <div className={`px-2.5 py-1 rounded-full font-medium ${CONSTANTS.issueTypes[feedback.issue_type]?.badgeClass || 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300'}`}>
                            {feedback.issue_type}
                          </div>
                        </div>
                      </div>

                      {/* Right Badges */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold text-xs ${severityConfig.badgeClass}`}>
                          {severityConfig.icon && <severityConfig.icon className="w-3.5 h-3.5" />}
                          {severityConfig.label}
                        </div>
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold text-xs ${statusConfig.badgeClass}`}>
                          {statusConfig.icon && <statusConfig.icon className="w-3.5 h-3.5" />}
                          {statusConfig.label}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <Inbox className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400 font-medium">
                {feedbacks.length === 0 ? 'No feedback submitted yet' : 'No feedback matches your filters'}
              </p>
              {feedbacks.length > 0 && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterPriority('all');
                    setFilterStatus('all');
                    setFilterType('all');
                    setSortBy('newest');
                  }}
                  className="mt-4 px-4 py-2 text-sm font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors"
                >
                  Clear filters
                </button>
              )}
            </motion.div>
          )}
        </div>

      {/* Modal Dialog */}
      <AnimatePresence>
        {isModalOpen && selectedFeedback && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              {/* Modal Header */}
              <div className={`bg-gradient-to-r ${getSeverityConfig(selectedFeedback.priority).gradientClass} p-6 border-b border-gray-200 dark:border-slate-800`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-lg ${getIssueIcon(selectedFeedback.issue_type).color} bg-opacity-20`}>
                      {React.createElement(getIssueIcon(selectedFeedback.issue_type).Icon, { className: 'w-6 h-6' })}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">
                        {selectedFeedback.description}
                      </h2>
                      <p className="text-sm text-gray-100 mt-1">
                        {selectedFeedback.issue_type} • Submitted by {selectedFeedback.username}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="text-white hover:text-gray-200 transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                
                {/* Key Details Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Priority</p>
                    <div className={`flex items-center gap-2 font-bold ${getSeverityConfig(selectedFeedback.priority).textClass}`}>
                      {getSeverityConfig(selectedFeedback.priority).icon && React.createElement(getSeverityConfig(selectedFeedback.priority).icon, { className: 'w-4 h-4' })}
                      {getSeverityConfig(selectedFeedback.priority).label}
                    </div>
                  </div>

                  <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Status</p>
                    <div className={`flex items-center gap-2 font-bold ${getStatusConfig(selectedFeedback.status || 'pending').textClass}`}>
                      {getStatusConfig(selectedFeedback.status || 'pending').icon && React.createElement(getStatusConfig(selectedFeedback.status || 'pending').icon, { className: 'w-4 h-4' })}
                      {getStatusConfig(selectedFeedback.status || 'pending').label}
                    </div>
                  </div>

                  <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Type</p>
                    <p className="font-bold text-gray-900 dark:text-white capitalize">{selectedFeedback.issue_type}</p>
                  </div>

                  <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Submitted</p>
                    <p className="font-bold text-gray-900 dark:text-white text-sm">{formatDate(selectedFeedback.created_at)}</p>
                  </div>
                </div>

                {/* Submitter Information */}
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-3">Submitted By</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-gray-900 dark:text-white font-medium">{selectedFeedback.username}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-gray-900 dark:text-white font-medium break-all">{selectedFeedback.email}</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Feedback Details</h3>
                  <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {selectedFeedback.description}
                    </p>
                  </div>
                </div>

                {/* Feature Suggestion */}
                {selectedFeedback.feature_suggestion && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                      Feature Suggestion
                    </h3>
                    <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-lg p-4">
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {selectedFeedback.feature_suggestion}
                      </p>
                    </div>
                  </div>
                )}

                {/* Additional Information */}
                {selectedFeedback.additional_info && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      Additional Information
                    </h3>
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {selectedFeedback.additional_info}
                      </p>
                    </div>
                  </div>
                )}

                {/* Attached File */}
                {selectedFeedback.file_name && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Download className="w-4 h-4 text-green-600 dark:text-green-400" />
                      Attached File
                    </h3>
                    <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-4">
                      <a href={selectedFeedback.file_path || '#'} download className="inline-flex items-center gap-2 font-semibold text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 transition-colors">
                        <Download className="w-4 h-4" />
                        {selectedFeedback.file_name}
                      </a>
                    </div>
                  </div>
                )}

                {/* Environment Info */}
                {selectedFeedback.environment && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Environment</h3>
                    <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                      <p className="text-gray-700 dark:text-gray-300 text-sm">{selectedFeedback.environment}</p>
                    </div>
                  </div>
                )}

              </div>

              {/* Modal Footer */}
              <div className="bg-gray-50 dark:bg-slate-800 px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 transition-all"
                >
                  Close
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-orange-500 to-amber-600 text-white transition-all"
                >
                  Mark as Resolved
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
};

export default AdminFeedbackPage;

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getToken } from '../utils/tokenStorage';
import SplitText from '../components/SplitText';
import { 
  Upload, Layout, Monitor, Clock, ArrowRight, Loader2, AlertCircle, 
  CheckCircle2, Users, Download, Eye, RefreshCw, X, FileText, 
  BarChart3, Wrench, Building2, FileSpreadsheet, MoreHorizontal, FolderArchive
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';


const CreatePlan = ({ showToast }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [hoveredPlan, setHoveredPlan] = useState(null);

  // Plan viewer state
  const [viewingPlan, setViewingPlan] = useState(null);
  const [planDetails, setPlanDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [exportLoading, setExportLoading] = useState(null); // Track which room is exporting

  useEffect(() => {
    fetchRecentPlans();
  }, []);

  // Re-fetch when user changes (account switch)
  const userIdentity = user?.email || user?.id;
  useEffect(() => {
    if (userIdentity) {
      setPlans([]);
      setError(null);
      setViewingPlan(null);
      setPlanDetails(null);
      fetchRecentPlans();
    }
  }, [userIdentity]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRecentPlans = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = getToken();
      const response = await fetch('/api/plans/recent', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load recent plans');
      }

      if (data.success && Array.isArray(data.plans)) {
        setPlans(data.plans);
        console.log(`✅ Loaded ${data.plans.length} plans`);
      } else {
        setPlans([]);
      }
    } catch (err) {
      console.error('Failed to fetch recent plans:', err);
      setError(err.message);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch plan details and session stats
  const loadPlanDetails = async (plan) => {
    setLoadingDetails(true);
    
    // Start with the plan data we already have (this is the primary source)
    const basePlanDetails = {
      ...plan,
      // Ensure these exist with defaults
      total_students: plan.total_students || 0,
      allocated_count: plan.allocated_count || 0,
      room_count: plan.room_count || 0,
      status: plan.status || 'unknown',
      // Calculate completion from existing data
      completion_rate: plan.total_students > 0 
        ? Math.round((plan.allocated_count / plan.total_students) * 100) 
        : 0,
      // Initialize empty arrays for detailed breakdowns
      rooms: [],
      batches: plan.batches || []
    };

    try {
      const token = getToken();
      
      // Try to fetch additional stats (rooms breakdown, etc.)
      const statsRes = await fetch(`/api/sessions/${plan.session_id}/stats`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        
        if (statsData.success && statsData.stats) {
          // Merge stats data, but keep plan data as primary source for counts
          const stats = statsData.stats;
          
          basePlanDetails.rooms = stats.rooms || [];
          basePlanDetails.batches = stats.batches || basePlanDetails.batches;
          
          // Only override completion_rate if stats provides it
          if (stats.completion_rate !== undefined) {
            basePlanDetails.completion_rate = stats.completion_rate;
          }
          
          // Update room_count from actual rooms if available
          if (stats.rooms && stats.rooms.length > 0) {
            basePlanDetails.room_count = stats.rooms.length;
          }
          
          console.log('📊 Stats loaded successfully:', stats);
        }
      } else {
        // Stats fetch failed, but we still have basic plan data
        console.warn('⚠️ Stats API failed, using basic plan data');
      }
      
      // Set the normalized plan details
      setPlanDetails(basePlanDetails);
      setViewingPlan(plan.session_id);
      
      if (showToast) {
        showToast('Plan details loaded', 'success');
      }
      
    } catch (err) {
      console.error('Failed to load plan stats:', err);
      
      // Even if stats fail, show the modal with basic plan data
      setPlanDetails(basePlanDetails);
      setViewingPlan(plan.session_id);
      
      if (showToast) {
        showToast('Loaded basic plan info (detailed stats unavailable)', 'warning');
      }
    } finally {
      setLoadingDetails(false);
    }
  };

  // Export PDF for a specific room
  const exportRoomPDF = async (plan, roomName) => {
    setExportLoading(roomName);
    try {
      const token = getToken();
      const timestamp = Date.now();
      
      console.log(`📄 Exporting PDF for room: ${roomName} in plan: ${plan.plan_id}`);
      
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          snapshot_id: plan.plan_id,
          room_name: roomName
        })
      });

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          const errorText = await response.text();
          errorMsg = errorText || errorMsg;
        }
        throw new Error(errorMsg);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('Empty response from server');
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seating_${roomName.replace(/\s+/g, '_')}_${plan.plan_id}_${timestamp}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      if (showToast) {
        showToast(`✅ Seating plan for ${roomName} downloaded`, 'success');
      }
    } catch (err) {
      console.error('❌ PDF export error:', err);
      if (showToast) {
        showToast(`Failed to export PDF: ${err.message}`, 'error');
      }
    } finally {
      setExportLoading(null);
    }
  };

  // Export all rooms combined PDF
  const exportAllRoomsPDF = async (plan) => {
    setExportLoading('all');
    try {
      const token = getToken();
      const timestamp = Date.now();
      
      console.log(`📄 Exporting combined PDF for plan: ${plan.plan_id}`);
      
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          snapshot_id: plan.plan_id
          // No room_name = export all
        })
      });

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          const errorText = await response.text();
          errorMsg = errorText || errorMsg;
        }
        throw new Error(errorMsg);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('Empty response from server');
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seating_all_rooms_${plan.plan_id}_${timestamp}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      if (showToast) {
        showToast(`✅ Combined seating plan downloaded`, 'success');
      }
    } catch (err) {
      console.error('❌ PDF export error:', err);
      if (showToast) {
        showToast(`Failed to export PDF: ${err.message}`, 'error');
      }
    } finally {
      setExportLoading(null);
    }
  };

  // Download hierarchical ZIP (room-wise folders with seating + attendance)
  // Zip hierarchy is now handled via AttendancePage in zip-hierarchy mode
  const handleZipHierarchy = (plan) => {
    navigate(`/attendance/${plan.plan_id}?source=zip-hierarchy`);
  };

  // Navigate to Attendance Page with room info
  const goToAttendancePage = (plan, roomName = null) => {
    const params = new URLSearchParams();
    if (roomName) {
      params.set('room', roomName);
    }
    params.set('source', 'create-plan');
    
    const queryString = params.toString();
    const url = `/attendance/${plan.plan_id}${queryString ? `?${queryString}` : ''}`;
    
    console.log(`📋 Navigating to attendance page: ${url}`);
    navigate(url);
  };

  // Navigation functions
  const goAllocate = () => navigate('/allocation');
  const goUpload = () => navigate('/upload');
  const goClassroom = () => navigate('/classroom');
  const goManual = () => navigate('/manual-allocation');

  const actions = [
    {
      title: 'Smart Allocation',
      description: 'Auto-generate optimized seat plans',
      icon: Layout,
      color: 'orange',
      bgColor: 'bg-orange-500 dark:bg-orange-600',
      hoverBorder: 'hover:border-orange-500 dark:hover:border-orange-400',
      onClick: goAllocate
    },
    {
      title: 'Custom Build',
      description: 'Build grid from scratch',
      icon: Wrench,
      color: 'blue',
      bgColor: 'bg-blue-600 dark:bg-blue-700',
      hoverBorder: 'hover:border-blue-600 dark:hover:border-blue-500',
      onClick: goManual
    },
    {
      title: 'Upload Data',
      description: 'Import student and room data',
      icon: Upload,
      color: 'amber',
      bgColor: 'bg-amber-500 dark:bg-amber-600',
      hoverBorder: 'hover:border-amber-500 dark:hover:border-amber-400',
      onClick: goUpload
    },
    {
      title: 'Manage Registry',
      description: 'Configure classroom settings',
      icon: Monitor,
      color: 'orange',
      bgColor: 'bg-orange-600 dark:bg-orange-700',
      hoverBorder: 'hover:border-orange-600 dark:hover:border-orange-500',
      onClick: goClassroom
    }
  ];

  const formatDate = (dateString) => {
    if (!dateString) return 'No date';
    try {
      return new Date(dateString).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid date';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return {
          text: 'Completed',
          classes: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
        };
      case 'active':
        return {
          text: 'In Progress',
          classes: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
        };
      case 'expired':
        return {
          text: 'Expired',
          classes: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
        };
      default:
        return {
          text: status || 'Unknown',
          classes: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
        };
    }
  };

  const viewPlanDetails = (plan) => {
    if (plan.status === 'active') {
      navigate('/allocation');
      return;
    }
    
    if (plan.status === 'completed') {
      loadPlanDetails(plan);
    }
  };

  const closePlanViewer = () => {
    setViewingPlan(null);
    setPlanDetails(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#050505] py-8 px-4 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-200 dark:border-gray-800">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="relative w-3 h-3">
                <div className="absolute inset-0 bg-orange-500 rounded-full animate-ping opacity-75"></div>
                <div className="relative w-3 h-3 bg-orange-500 rounded-full border border-orange-400"></div>
              </div>
              <span className="text-xs font-mono text-orange-500 tracking-wider uppercase">Planning Mode</span>
            </div>
            <SplitText
              text="Create Your Plan"
              className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-gray-900 via-gray-700 to-gray-500 dark:from-gray-100 dark:via-gray-300 dark:to-gray-500 bg-clip-text text-transparent"
              splitType="chars"
              delay={30}
            />
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Choose how you'd like to organize your seating arrangements
            </p>
          </div>
          
          <div className="flex gap-4">
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">Total Plans</div>
              <div className="text-3xl font-black text-orange-600 dark:text-orange-400">
                {plans.length}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">Active</div>
              <div className="text-3xl font-black text-blue-600 dark:text-blue-400">
                {plans.filter(p => p.status === 'active').length}
              </div>
            </div>
          </div>
        </div>

        {/* Action Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              onMouseEnter={() => setHoveredCard(index)}
              onMouseLeave={() => setHoveredCard(null)}
              className={`glass-card relative overflow-hidden p-8 border-2 border-gray-200 dark:border-gray-800 ${action.hoverBorder} transition-all duration-300 group rounded-2xl`}
              style={{
                opacity: 0,
                animation: `fadeInUp 0.5s ease-out ${index * 0.1}s forwards`
              }}
            >
              <div className={`absolute inset-0 ${action.bgColor} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
              
              <div className="absolute top-0 right-0 p-4 opacity-5 transform rotate-12 group-hover:scale-110 transition-transform duration-500">
                <action.icon className="w-24 h-24 text-gray-900 dark:text-gray-100" />
              </div>

              <div className="relative z-10 flex flex-col items-start gap-4">
                <div className={`${action.bgColor} p-4 rounded-xl shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                  <action.icon className="text-white" size={28} />
                </div>

                <div className="flex-1 text-left">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                    {action.title}
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {action.description}
                  </p>
                </div>

                <div className="self-end">
                  <ArrowRight 
                    className={`text-gray-400 group-hover:text-orange-500 group-hover:translate-x-1 transition-all duration-300 ${
                      hoveredCard === index ? 'opacity-100' : 'opacity-0'
                    }`} 
                    size={18} 
                  />
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Recent Plans Section */}
        <div className="glass-card p-8 border-2 border-gray-200 dark:border-gray-800 rounded-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <SplitText 
                text="Recent Plans" 
                className="text-2xl font-bold text-gray-900 dark:text-gray-100" 
                splitType="chars" 
                delay={20} 
              />
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Your latest seating arrangements
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchRecentPlans}
                disabled={loading}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh plans"
              >
                <RefreshCw className={`w-4 h-4 text-orange-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <div className="flex items-center gap-2 text-xs font-mono text-orange-500 bg-orange-500/10 px-3 py-2 rounded-full border border-orange-500/20">
                <Clock className="w-4 h-4" />
                <span>{plans.length} Total</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl flex gap-3">
              <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0" size={20} />
              <div className="flex-1">
                <p className="text-red-700 dark:text-red-300 font-semibold text-sm">
                  Failed to load recent plans
                </p>
                <p className="text-red-600 dark:text-red-400 text-xs mt-1">
                  {error}
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-16">
              <Loader2 className="w-12 h-12 mx-auto text-orange-500 animate-spin mb-4" />
              <p className="text-gray-600 dark:text-gray-400 font-semibold">Loading recent plans...</p>
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 mb-4">
                <Layout className="text-gray-400 dark:text-gray-500" size={32} />
              </div>
              <p className="text-gray-600 dark:text-gray-400 font-semibold text-lg mb-2">No plans created yet</p>
              <p className="text-sm text-gray-500 dark:text-gray-500">Select an option above to get started with your first plan</p>
            </div>
          ) : (
            <div className="space-y-3">
              {plans.map((plan, idx) => {
                const statusBadge = getStatusBadge(plan.status);
                const isCompleted = plan.status === 'completed';
                const isActive = plan.status === 'active';
                const progress = plan.total_students > 0 
                  ? Math.round((plan.allocated_count / plan.total_students) * 100) 
                  : 0;
                
                return (
                  <div
                    key={plan.session_id || idx}
                    onMouseEnter={() => setHoveredPlan(idx)}
                    onMouseLeave={() => setHoveredPlan(null)}
                    className="group p-5 rounded-xl bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-all duration-300 border-2 border-gray-200 dark:border-gray-700 hover:border-orange-500 dark:hover:border-orange-400 shadow-sm"
                    style={{
                      opacity: 0,
                      animation: `fadeIn 0.3s ease-out ${idx * 0.05}s forwards`
                    }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {/* Icon Badge */}
                        <div className={`flex items-center justify-center w-12 h-12 rounded-lg ${
                          isCompleted 
                            ? 'bg-gradient-to-br from-emerald-500 to-green-600' 
                            : isActive
                            ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                            : 'bg-gradient-to-br from-gray-400 to-gray-500'
                        } text-white font-bold text-lg shadow-md flex-shrink-0`}>
                          {isCompleted ? <CheckCircle2 size={24} /> : idx + 1}
                        </div>

                        {/* Plan Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1 flex-wrap">
                            <div className="font-bold text-gray-900 dark:text-white text-lg group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors truncate">
                              {plan.plan_id || `Plan ${idx + 1}`}
                            </div>
                            <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-lg border ${statusBadge.classes} flex-shrink-0`}>
                              {statusBadge.text}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="font-mono">
                                {formatDate(plan.completed_at || plan.created_at)}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="font-mono">
                                {plan.allocated_count || 0}/{plan.total_students || 0} students
                              </span>
                            </div>
                            
                            {plan.room_count > 0 && (
                              <div className="flex items-center gap-1.5">
                                <Monitor className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="font-mono">
                                  {plan.room_count} room{plan.room_count !== 1 ? 's' : ''}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Batch Tags */}
                          {Array.isArray(plan.batches) && plan.batches.length > 0 && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {plan.batches.map((batch, batchIdx) => (
                                <span 
                                  key={batchIdx}
                                  className="text-xs font-bold px-2.5 py-1 rounded-md border"
                                  style={{ 
                                    backgroundColor: (batch.color || '#3b82f6') + '20',
                                    color: batch.color || '#3b82f6',
                                    borderColor: (batch.color || '#3b82f6') + '40'
                                  }}
                                >
                                  {batch.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Side: Progress or Actions */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {isActive && plan.total_students > 0 && (
                          <div className="text-right">
                            <div className="text-xs text-gray-500 mb-1">Progress</div>
                            <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
                              {progress}%
                            </div>
                          </div>
                        )}
                        
                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          {isActive && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate('/allocation');
                              }}
                              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                            >
                              <ArrowRight size={14} />
                              Continue
                            </button>
                          )}
                          
                          {isCompleted && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                viewPlanDetails(plan);
                              }}
                              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                            >
                              <Eye size={14} />
                              View
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400 bg-orange-500/10 px-4 py-2 rounded-lg border border-orange-500/20">
                            {plan.type || 'Manual'}
                          </span>
                          <ArrowRight 
                            className={`text-gray-400 group-hover:text-orange-500 group-hover:translate-x-1 transition-all duration-300 ${
                              hoveredPlan === idx ? 'opacity-100' : 'opacity-50'
                            }`} 
                            size={20} 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {plans.length >= 20 && (
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Showing {plans.length} most recent plans
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Plan Details Modal */}
      <AnimatePresence>
        {viewingPlan && planDetails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={closePlanViewer}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-3xl w-full max-h-[85vh] overflow-auto border-2 border-gray-200 dark:border-gray-700"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                    {planDetails.plan_id}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Created: {formatDate(planDetails.created_at)}
                  </p>
                </div>
                <button
                  onClick={closePlanViewer}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {loadingDetails ? (
                <div className="text-center py-8">
                  <Loader2 className="w-12 h-12 mx-auto text-orange-500 animate-spin mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">Loading plan details...</p>
                </div>
              ) : (
                <>
                  {/* Statistics Grid - FIXED with normalized data */}
                  {planDetails && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                        <div className="text-xs text-gray-600 dark:text-gray-400 font-bold mb-1">Total Students</div>
                        <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
                          {planDetails.total_students}
                        </div>
                      </div>

                      <div className="p-4 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                        <div className="text-xs text-gray-600 dark:text-gray-400 font-bold mb-1">Allocated</div>
                        <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                          {planDetails.allocated_count}
                        </div>
                      </div>

                      <div className="p-4 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
                        <div className="text-xs text-gray-600 dark:text-gray-400 font-bold mb-1">Completion</div>
                        <div className="text-2xl font-black text-orange-600 dark:text-orange-400">
                          {planDetails.completion_rate}%
                        </div>
                      </div>

                      <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
                        <div className="text-xs text-gray-600 dark:text-gray-400 font-bold mb-1">Rooms</div>
                        <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
                          {planDetails.room_count}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Room-wise Exports */}
                  {planDetails?.rooms && planDetails.rooms.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <Building2 size={20} className="text-orange-500" />
                      Room-wise Export
                    </h3>
                    
                    <div className="space-y-3">
                      {planDetails.rooms.map((room, idx) => (
                        <div 
                          key={idx} 
                          className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700"
                        >
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                              {/* Room Info */}
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="font-bold text-gray-900 dark:text-white text-lg">
                                    {room.name || 'Unknown Room'}
                                  </span>
                                  <span className="text-xs font-mono bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-400">
                                    {room.allocated || 0}/{room.capacity || 0} seats
                                  </span>
                                </div>
                                
                                {/* Progress Bar */}
                                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-emerald-500 to-green-500 transition-all duration-300" 
                                    style={{ width: `${Math.min(100, ((room.allocated || 0)/(room.capacity || 1))*100)}%` }} 
                                  />
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex gap-2">
                                {/* Seating PDF */}
                                <button
                                  onClick={() => exportRoomPDF(planDetails, room.name)}
                                  disabled={exportLoading === room.name}
                                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                  {exportLoading === room.name ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <Download size={14} />
                                  )}
                                  Seating PDF
                                </button>

                                {/* Attendance Sheet */}
                                <button
                                  onClick={() => goToAttendancePage(planDetails, room.name)}
                                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                                >
                                  <FileText size={14} />
                                  Attendance
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Batch Distribution - Uses normalized batches array */}
                  {planDetails?.batches && planDetails.batches.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <Users size={20} className="text-orange-500" />
                        Batch Distribution
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {planDetails.batches.map((batch, idx) => (
                          <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-center border border-gray-200 dark:border-gray-700">
                            <div className="text-sm font-bold text-gray-600 dark:text-gray-400 mb-1 truncate">
                              {batch.batch_name || batch.name || 'Unknown'}
                            </div>
                            <div className="text-2xl font-black text-orange-600 dark:text-orange-400">
                              {batch.count || batch.student_count || 0}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Close button */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-3">
                  <button
                    onClick={() => handleZipHierarchy(planDetails)}
                    className="w-full px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-purple-500/25"
                  >
                    <FolderArchive size={18} />
                    Zip Hierarchy → Fill Details
                  </button>
                  <button
                    onClick={() => navigate(`/more-options/${planDetails.plan_id}`)}
                    className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-orange-500/25"
                  >
                    <MoreHorizontal size={18} />
                    More Options
                  </button>
                  <button
                    onClick={closePlanViewer}
                    className="w-full px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                  >
                    <X size={18} />
                    Close
                  </button>
                </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        
      `}</style>
    </div>
  );
};

export default CreatePlan;
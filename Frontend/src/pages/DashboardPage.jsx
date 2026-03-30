import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Layout, 
  MapPin, 
  Upload, 
  ArrowUpRight,
  ArrowDownRight,
  Terminal,
  AlertCircle,
  Database,
  RefreshCw,
  Loader2,
  Calendar,
  Activity,
  FileText
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getToken } from '../utils/tokenStorage';
import SplitText from '../components/SplitText';

const DEFAULT_STATS = [
  { label: 'Total Students', value: 0, change: 0, icon: Users, color: 'text-orange-500 dark:text-orange-400' },
  { label: 'Classrooms', value: 0, change: 0, icon: Layout, color: 'text-amber-500 dark:text-amber-400' },
  { label: 'Allocated Seats', value: 0, change: 0, icon: MapPin, color: 'text-orange-600 dark:text-orange-500' },
  { label: 'Completed Plans', value: 0, change: 0, icon: FileText, color: 'text-amber-600 dark:text-amber-500' }
];

const QUICK_ACTIONS = [
  { label: 'Create Plan', desc: 'Start new allocation', page: 'create-plan', icon: Upload, bgColor: 'bg-orange-500' },
  { label: 'Database', desc: 'Manage records', page: 'database', icon: Database, bgColor: 'bg-orange-600' },
  { label: 'Templates', desc: 'Edit PDF layout', page: 'template-editor', icon: Layout, bgColor: 'bg-amber-500' },
  { label: 'Classrooms', desc: 'Room layouts', page: 'classroom', icon: MapPin, bgColor: 'bg-orange-500' }
];

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

const getActivityIcon = (type) => {
  switch (type) {
    case 'success': return '✓';
    case 'warning': return '⚠';
    case 'process': return '⚙';
    case 'info': return 'ℹ';
    default: return '>';
  }
};

// StatCard Component with counter animation
const StatCard = memo(({ stat, index, loading }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (loading) {
      setCount('0');
      return;
    }

    const duration = 1500;
    const targetValue = parseInt(String(stat.value).replace(/,/g, ''));
    
    if (isNaN(targetValue)) {
      setCount(stat.value);
      return;
    }

    let rafId;
    const start = performance.now();

    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const nextValue = Math.floor(targetValue * progress).toLocaleString();

      setCount((prev) => (prev === nextValue ? prev : nextValue));

      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [stat.value, loading]);

  const cardStyle = {
    opacity: 0,
    animation: `fadeInUp 0.5s ease-out ${index * 0.1}s forwards`
  };

  const isPositiveChange = stat.change >= 0;

  return (
    <div
      style={cardStyle}
      className="glass-card bg-white dark:bg-gray-800 relative overflow-hidden p-6 border-2 border-gray-200 dark:border-gray-700 hover:border-orange-500/50 dark:hover:border-orange-400/50 transition-all duration-300 group rounded-2xl"
    >
      {/* Background Icon */}
      <div className="absolute top-0 right-0 p-4 opacity-5 transform rotate-12 group-hover:scale-110 transition-transform duration-500">
        <stat.icon className="w-24 h-24 text-gray-900 dark:text-gray-100" />
      </div>
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
            <stat.icon className={`w-6 h-6 ${stat.color}`} />
          </div>
          
          {/* Dynamic change indicator */}
          {stat.change !== undefined && stat.change !== 0 && (
            <div className={`flex items-center gap-1 text-xs font-mono px-2 py-1 rounded-full ${
              isPositiveChange 
                ? 'text-emerald-500 bg-emerald-500/10' 
                : 'text-red-500 bg-red-500/10'
            }`}>
              {isPositiveChange ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              <span>{isPositiveChange ? '+' : ''}{stat.change}%</span>
            </div>
          )}
          
          {loading && (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          )}
        </div>
        
        <div className="space-y-1">
          <div className="text-4xl font-black tracking-tight text-gray-900 dark:text-gray-100 font-mono stat-number">
            {loading ? (
              <span className="animate-pulse">---</span>
            ) : count}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{stat.label}</p>
        </div>
      </div>
    </div>
  );
});

const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Dynamic state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [activityLog, setActivityLog] = useState([]);
  const [sessionInfo, setSessionInfo] = useState({
    currentSession: 'Loading...',
    nextExam: null
  });
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Download modal state
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [downloading, setDownloading] = useState(false);

  const greetingText = useMemo(
    () => `${getGreeting()},\n${user?.name || 'Administrator'}`,
    [user?.name]
  );

  // Fetch dashboard stats
  const fetchStats = useCallback(async () => {
    try {
      const token = getToken();
      const response = await fetch('/api/dashboard/stats', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch stats');
      }
      
      if (data.success) {
        const statsData = data.stats;
        setStats([
          { 
            label: 'Total Students', 
            value: statsData.total_students || 0, 
            change: statsData.students_change || 0,
            icon: Users, 
            color: 'text-orange-500 dark:text-orange-400' 
          },
          { 
            label: 'Classrooms', 
            value: statsData.total_classrooms || 0, 
            change: statsData.classrooms_change || 0,
            icon: Layout, 
            color: 'text-amber-500 dark:text-amber-400' 
          },
          { 
            label: 'Allocated Seats', 
            value: statsData.allocated_seats || 0, 
            change: statsData.allocation_change || 0,
            icon: MapPin, 
            color: 'text-orange-600 dark:text-orange-500' 
          },
          { 
            label: 'Completed Plans', 
            value: statsData.completed_plans || 0, 
            change: statsData.plans_change || 0,
            icon: FileText, 
            color: 'text-amber-600 dark:text-amber-500' 
          }
        ]);
      }
    } catch (err) {
      console.error('Stats fetch error:', err);
      // Set default stats on error
      setStats(DEFAULT_STATS);
    }
  }, []);

  // Fetch activity log
  const fetchActivity = useCallback(async () => {
    try {
      const token = getToken();
      const response = await fetch('/api/dashboard/activity?limit=10', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch activity');
      }
      
      if (data.success && Array.isArray(data.activities)) {
        setActivityLog(data.activities);
      }
    } catch (err) {
      console.error('Activity fetch error:', err);
      setActivityLog([{
        id: 'error_1',
        time: 'Now',
        message: 'Could not load activity log',
        type: 'warning'
      }]);
    }
  }, []);

  // Fetch session info
  const fetchSessionInfo = useCallback(async () => {
    try {
      const token = getToken();
      const response = await fetch('/api/dashboard/session-info', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch session info');
      }
      
      if (data.success) {
        setSessionInfo({
          currentSession: data.current_session || 'No Active Session',
          nextExam: data.next_exam
        });
      }
    } catch (err) {
      console.error('Session info fetch error:', err);
      // Calculate session locally as fallback
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      let session = 'Fall Semester ' + year;
      if (month >= 1 && month <= 5) session = 'Spring Semester ' + year;
      else if (month >= 6 && month <= 7) session = 'Summer Session ' + year;
      
      setSessionInfo({
        currentSession: session,
        nextExam: null
      });
    }
  }, []);

  // Fetch all dashboard data
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        fetchStats(),
        fetchSessionInfo()
      ]);

      setLoading(false);
      setLastRefresh(new Date());

      // Defer non-critical activity log fetch to reduce initial dashboard work
      fetchActivity();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, [fetchStats, fetchActivity, fetchSessionInfo]);

  // Manual refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  }, [fetchDashboardData]);

  // Load + auto refresh based on logged-in user identity
  const userIdentity = user?.email || user?.id;
  useEffect(() => {
    if (!userIdentity) return undefined;

    setStats(DEFAULT_STATS);
    setActivityLog([]);
    setSessionInfo({ currentSession: 'Loading...', nextExam: null });
    setError(null);
    fetchDashboardData();

    const interval = setInterval(fetchDashboardData, 60000);
    return () => clearInterval(interval);
  }, [userIdentity, fetchDashboardData]);

  // Handle download
  const handleDownload = async () => {
    setShowDownloadModal(true);
    setDownloading(true);
    setDownloadStatus('Starting download...');
    try {
      const token = getToken();
      const res = await fetch('/api/download-report', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error('No report available');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDownloadStatus('Downloaded successfully');
    } catch (e) {
      setDownloadStatus('Failed to download report');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#050505] py-8 px-4 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-200 dark:border-gray-700 bg-transparent">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="relative w-3 h-3">
                <div className={`absolute inset-0 ${error ? 'bg-red-500' : 'bg-emerald-500'} rounded-full animate-ping opacity-75`}></div>
                <div className={`relative w-3 h-3 ${error ? 'bg-red-500 border-red-400' : 'bg-emerald-500 border-emerald-400'} rounded-full border`}></div>
              </div>
              <span className={`text-xs font-mono ${error ? 'text-red-500' : 'text-emerald-500'} tracking-wider uppercase`}>
                {loading ? 'Connecting...' : error ? 'Connection Error' : 'Live Connection'}
              </span>
              
              {/* Refresh button */}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="ml-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                title="Refresh dashboard"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            
            <SplitText
              text={greetingText}
              className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-gray-900 via-gray-700 to-gray-500 dark:from-gray-100 dark:via-gray-300 dark:to-gray-500 bg-clip-text text-transparent"
              delay={45}
              duration={0.6}
              ease="ease-out"
              splitType="chars"
            />
            
            {/* Last refresh time */}
            <p className={`text-xs text-gray-500 mt-2 font-mono min-h-[1rem] ${lastRefresh ? '' : 'opacity-0'}`}>
              Last updated: {lastRefresh ? lastRefresh.toLocaleTimeString() : '--:--:--'}
            </p>
          </div>
          
          <div className="flex gap-4">
            <div className="text-right hidden md:block">
              <div className="micro-label mb-1">Current Session</div>
              <div className="font-mono text-xl text-gray-900 dark:text-gray-100">
                {sessionInfo.currentSession}
              </div>
            </div>
            <div className="w-px bg-gray-200 dark:bg-gray-700 h-12 hidden md:block"></div>
            <div className="text-right">
              <div className="micro-label mb-1">Next Exam</div>
              <div className="font-mono text-xl text-orange-600 dark:text-orange-400 min-h-[1.75rem]">
                {sessionInfo.nextExam ? (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{sessionInfo.nextExam.date}</span>
                    <span className="text-sm text-gray-500">
                      ({sessionInfo.nextExam.days_remaining}d)
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-400">No upcoming</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-red-700 dark:text-red-300 font-medium">Failed to load dashboard data</p>
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
            <button
              onClick={handleRefresh}
              className="px-3 py-1 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 rounded-md text-sm hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <StatCard key={stat.label} stat={stat} index={i} loading={loading} />
          ))}
        </div>

        {/* Quick Actions */}
        <div
          className="glass-card bg-white dark:bg-gray-900 p-6 border-2 border-gray-200 dark:border-gray-700 rounded-2xl"
          style={{ contentVisibility: 'auto', containIntrinsicSize: '280px' }}
        >
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.page}
                onClick={() => action.page === 'download-report' ? handleDownload() : navigate(`/${action.page}`)}
                className="glass-card flex flex-col items-center gap-3 p-6 border-2 border-gray-200 dark:border-gray-700 rounded-2xl hover:border-orange-500 dark:hover:border-orange-400 transition-all duration-300 bg-white dark:bg-gray-800 group"
              >
                <div className={`${action.bgColor} p-4 rounded-xl shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                  <action.icon className="text-white" size={24} />
                </div>
                <div className="text-center">
                  <span className="font-bold text-gray-900 dark:text-gray-100 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">{action.label}</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{action.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Activity Section */}
        <div
          className="grid grid-cols-1 lg:grid-cols-1 gap-6"
          style={{ contentVisibility: 'auto', containIntrinsicSize: '500px' }}
        >
          
          {/* Terminal Log */}
          <div className="glass-card bg-white dark:bg-gray-800 p-6 border-2 border-gray-200 dark:border-gray-700 rounded-2xl flex flex-col min-h-[400px]">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                <h2 className="text-xl font-bold tracking-widest uppercase text-gray-900 dark:text-gray-100">System Log</h2>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono">
                  {activityLog.length} events
                </span>
                <button
                  onClick={fetchActivity}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  title="Refresh activity"
                >
                  <RefreshCw className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 font-mono text-xl">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                </div>
              ) : activityLog.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Activity className="w-12 h-12 mb-2 opacity-50" />
                  <p>No recent activity</p>
                </div>
              ) : (
                activityLog.map((log, i) => (
                  <div
                    key={log.id}
                    className="flex gap-3 group animate-fadeIn"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    <div className="w-28 text-base text-gray-500 dark:text-gray-400 pt-1 shrink-0 flex-none">
                      {log.time}
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className={`text-lg break-words ${
                        log.type === 'warning' ? 'text-amber-500' :
                        log.type === 'success' ? 'text-emerald-500' :
                        log.type === 'process' ? 'text-orange-500' :
                        log.type === 'error' ? 'text-red-500' :
                        'text-gray-700 dark:text-gray-300'
                      }`}>
                        {getActivityIcon(log.type)} {log.message}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Download Modal */}
        {showDownloadModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-card bg-white dark:bg-gray-800 w-full max-w-md p-6 border-2 border-gray-200 dark:border-gray-700 rounded-2xl animate-fadeIn">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Download Report</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{downloadStatus}</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { if (!downloading) setShowDownloadModal(false); }}
                  disabled={downloading}
                  className={`px-4 py-2 rounded-md transition-colors ${
                    downloading 
                      ? 'bg-gray-300 text-gray-600 cursor-not-allowed' 
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {downloading ? 'Downloading…' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

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

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
          opacity: 0;
        }

        .micro-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7280;
        }

        :global(.dark) .stat-number {
          color: #c0c0c0 !important;
          text-shadow: 0 0 10px rgba(192,192,192,0.95);
          transition: text-shadow 0.3s ease, color 0.3s ease;
        }
        .glass-card {
          background: rgba(255, 255, 255, 0.65);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);

          border-radius: 16px;

          /* GRAPHITE BORDER */
          border: 1px solid rgba(100, 116, 139, 0.18);

          box-shadow:
            0 8px 20px rgba(0, 0, 0, 0.08),
            inset 0 0 0 1px rgba(255, 255, 255, 0.6);
        }

        .dark .glass-card {
          position: relative;
          background: rgba(17, 24, 39, 0.55);
          backdrop-filter: blur(14px) saturate(130%);
          border-radius: 16px;
        }

        .dark .glass-card::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(
            180deg,
            rgba(203, 213, 225, 0.22),
            rgba(203, 213, 225, 0.08)
          );
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
        
      `}</style>
    </div>
  );
};

export default DashboardPage;
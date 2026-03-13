import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Monitor, CheckCircle2, FileText, Loader2, AlertCircle } from 'lucide-react';
import MoreOptionsSidebar from '../components/MoreOptionsSidebar';
import MasterPlanCard from '../components/MasterPlanCard';
import ExcelExportCard from '../components/ExcelExportCard';
import PublishPlanCard from '../components/PublishPlanCard';
import SplitText from '../components/SplitText';
import { getToken } from '../utils/tokenStorage';

const MoreOptionsPage = ({ showToast }) => {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('master-plan');

  // Shared plan info — fetched once, passed to both cards
  const [planInfo, setPlanInfo] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [planError, setPlanError] = useState(null);

  useEffect(() => {
    if (!planId) return;
    const load = async () => {
      setLoadingPlan(true);
      setPlanError(null);
      try {
        const token = getToken();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`/api/plan-batches/${planId}`, { headers });
        if (!res.ok) throw new Error('Could not load plan details');
        const data = await res.json();
        const meta = data.metadata || {};
        const rooms = data.rooms || {};
        const batchCount = Object.values(rooms).reduce(
          (sum, r) => sum + Object.keys(r.batches || {}).length, 0
        );
        setPlanInfo({
          total_students: meta.total_students
            || Object.values(rooms).reduce(
              (sum, r) => sum + Object.values(r.batches || {}).reduce(
                (s, b) => s + (b.students?.length || 0), 0
              ), 0
            ),
          room_count: meta.active_rooms?.length || Object.keys(rooms).length,
          status: meta.status || '—',
          batch_count: batchCount,
        });
      } catch (err) {
        setPlanError('Could not load plan details');
      } finally {
        setLoadingPlan(false);
      }
    };
    load();
  }, [planId]);

  if (!planId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#050505] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">No plan selected</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-orange-500 hover:text-orange-600 font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#050505] py-8 px-4 transition-colors duration-300">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-200 dark:border-gray-800">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="relative w-3 h-3">
                <div className="absolute inset-0 bg-orange-500 rounded-full animate-ping opacity-75"></div>
                <div className="relative w-3 h-3 bg-orange-500 rounded-full border border-orange-400"></div>
              </div>
              <span className="text-xs font-mono text-orange-500 tracking-wider uppercase">More Options</span>
            </div>
            <SplitText
              text="Additional Tools"
              className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-gray-900 via-gray-700 to-gray-500 dark:from-gray-100 dark:via-gray-300 dark:to-gray-500 bg-clip-text text-transparent"
              splitType="chars"
              delay={30}
            />
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Master plan generation & Excel export
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-bold transition-colors flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">Plan ID</div>
              <div className="text-lg font-black text-orange-600 dark:text-orange-400 font-mono">
                {planId}
              </div>
            </div>
          </div>
        </div>

        {/* Shared Plan Info — loaded once, shown at top */}
        {loadingPlan ? (
          <div className="flex items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-800">
            <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Loading plan details…</p>
          </div>
        ) : planError ? (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border-2 border-red-200 dark:border-red-800">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">{planError}</p>
          </div>
        ) : planInfo && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800 text-center">
              <Users className="w-5 h-5 text-purple-500 mx-auto mb-1" />
              <div className="text-2xl font-black text-purple-600 dark:text-purple-400">{planInfo.total_students}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 font-bold">Students</div>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 text-center">
              <Monitor className="w-5 h-5 text-blue-500 mx-auto mb-1" />
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400">{planInfo.room_count}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 font-bold">Rooms</div>
            </div>
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 text-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{planInfo.status}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 font-bold">Status</div>
            </div>
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 text-center">
              <FileText className="w-5 h-5 text-amber-500 mx-auto mb-1" />
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">{planInfo.batch_count}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 font-bold">Batches</div>
            </div>
          </div>
        )}

        {/* Main Container with Sidebar and Content */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar - Left Column */}
          <MoreOptionsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Content Area - Right Column (3 cols) */}
          <div className="md:col-span-3">
            {activeTab === 'master-plan' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-8 bg-gradient-to-b from-purple-500 to-purple-600 rounded-full"></div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-400 dark:to-purple-500 bg-clip-text text-transparent">Master Seating Plan</h2>
                </div>
                <MasterPlanCard planId={planId} showToast={showToast} />
              </div>
            )}

            {activeTab === 'excel-export' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-8 bg-gradient-to-b from-emerald-500 to-emerald-600 rounded-full"></div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-700 dark:from-emerald-400 dark:to-emerald-500 bg-clip-text text-transparent">Export to Excel</h2>
                </div>
                <ExcelExportCard planId={planId} showToast={showToast} />
              </div>
            )}

            {activeTab === 'publish-plan' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-8 bg-gradient-to-b from-cyan-500 to-cyan-600 rounded-full"></div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-cyan-700 dark:from-cyan-400 dark:to-cyan-500 bg-clip-text text-transparent">Publish Plan</h2>
                </div>
                <PublishPlanCard planId={planId} showToast={showToast} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MoreOptionsPage;

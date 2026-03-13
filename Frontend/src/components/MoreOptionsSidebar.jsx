import React from 'react';
import { FileText, FileSpreadsheet, MoreHorizontal, Upload } from 'lucide-react';

const MoreOptionsSidebar = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'master-plan', label: 'Master Plan', icon: FileText, color: 'text-purple-500' },
    { id: 'excel-export', label: 'Excel Export', icon: FileSpreadsheet, color: 'text-emerald-500' },
    { id: 'publish-plan', label: 'Publish Plan', icon: Upload, color: 'text-cyan-500' },
  ];

  return (
    <div className="glass-card w-full md:w-64 p-6 space-y-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700">
      {/* Sidebar Header */}
      <div className="flex items-center gap-2 pb-4 border-b-2 border-gray-200 dark:border-gray-700">
        <MoreHorizontal className="w-5 h-5 text-orange-500" />
        <h3 className="font-bold text-gray-900 dark:text-gray-100">Options</h3>
      </div>

      {/* Tab Links */}
      <div className="space-y-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-bold ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border-2 border-orange-500 dark:border-orange-400 text-gray-900 dark:text-gray-100 shadow-md'
                : 'bg-gray-50 dark:bg-gray-800/50 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-orange-400 dark:hover:border-orange-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <tab.icon className={`w-5 h-5 ${tab.color}`} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Future expansion hint */}


      <style jsx>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.65);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          border-radius: 16px;
          border: 1px solid rgba(100, 116, 139, 0.18);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.6);
        }
        :global(.dark) .glass-card {
          position: relative;
          background: rgba(17, 24, 39, 0.55);
          backdrop-filter: blur(14px) saturate(130%);
          border-radius: 16px;
        }
        :global(.dark) .glass-card::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(180deg, rgba(203, 213, 225, 0.22), rgba(203, 213, 225, 0.08));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
};

export default MoreOptionsSidebar;

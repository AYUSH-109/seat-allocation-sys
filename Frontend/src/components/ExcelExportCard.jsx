import React, { useState } from 'react';
import { FileSpreadsheet, Download, Loader2, LayoutGrid, Settings2 } from 'lucide-react';
import { getToken } from '../utils/tokenStorage';

const SHEET_PREVIEWS = [
  {
    icon: Settings2,
    name: 'Summary',
    colour: 'purple',
    desc: 'Plan-level inputs (rows, cols, block width, block structure, broken seats), per-room configuration, and batch breakdown with Paper Set A / B counts.',
  },
  {
    icon: LayoutGrid,
    name: 'Room_<name>  (one per room)',
    colour: 'emerald',
    desc: 'Physical seating grid built from the raw matrix — each cell shows position, roll number + paper set, and student name, colour-coded by batch. Below the grid: full student detail table with batch, degree, branch, joining year, block, and status.',
  },
];

const COLOUR_MAP = {
  purple:  { bg: 'bg-purple-50 dark:bg-purple-900/20',  border: 'border-purple-200 dark:border-purple-800',  icon: 'text-purple-500',  badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', icon: 'text-emerald-500', badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
};

const ExcelExportCard = ({ planId, showToast }) => {
  const [exporting, setExporting] = useState(false);

  // Trigger download
  const handleExport = async () => {
    setExporting(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/export-excel/${planId}`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seating_plan_${planId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      showToast?.('Excel file downloaded successfully!', 'success');
    } catch (err) {
      showToast?.(`Error: ${err.message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sheet Preview Container */}
      <div className="space-y-4 glass-card p-6 rounded-xl">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <LayoutGrid size={20} className="text-emerald-500" />
          📊 Included Sheets
        </h3>
        <div className="space-y-3">
          {SHEET_PREVIEWS.map((sheet, idx) => {
            const colors = COLOUR_MAP[sheet.colour];
            return (
              <div key={idx} className={`${colors.bg} border-2 ${colors.border} rounded-xl p-4 transition-all hover:shadow-md`}>
                <div className="flex gap-3 items-start">
                  <div className={`p-3 rounded-xl ${colors.badge} flex-shrink-0`}>
                    <sheet.icon className={`w-5 h-5 ${colors.icon}`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 dark:text-gray-100">{sheet.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{sheet.desc}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Export Button */}
      <button
        onClick={handleExport}
        disabled={exporting}
        className={`w-full px-6 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300 ${
          exporting
            ? 'bg-emerald-400 cursor-not-allowed opacity-70'
            : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-lg hover:shadow-emerald-500/25'
        } text-white`}
      >
        {exporting ? (
          <>
            <Loader2 size={22} className="animate-spin" />
            Exporting Excel...
          </>
        ) : (
          <>
            <Download size={22} />
            Export to Excel
          </>
        )}
      </button>

      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        💡 Excel file includes all seating details per room with color coding (use Ms Excel or LibreOffice Calc)
      </p>

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

export default ExcelExportCard;

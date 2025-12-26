import React, { useEffect, useState } from 'react';
import { Upload, Layout, Monitor } from 'lucide-react';

const CreatePlan = ({ setCurrentPage }) => {
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('plans');
      const parsed = raw ? JSON.parse(raw) : [];
      setPlans(parsed.reverse());
    } catch (e) {
      setPlans([]);
    }
  }, []);

  const goAllocate = () => setCurrentPage('allocation');
  const goUpload = () => setCurrentPage('upload');
  const goClassroom = () => setCurrentPage('classroom');

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="mb-8">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-center mb-12 uppercase text-gray-900 dark:text-white transition-colors duration-300">CREATE PLAN</h1>

        {/* Updated grid to 3 columns for better spacing */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          
          {/* 1. Allocate Button */}
          <button
            onClick={goAllocate}
            className="flex flex-col items-center gap-4 p-8 border-2 border-gray-200 dark:border-gray-700 rounded-2xl hover:border-green-500 dark:hover:border-green-400 hover:shadow-xl transition-all duration-300 bg-white dark:bg-gray-800 group"
          >
            <div className="bg-green-500 dark:bg-green-600 p-4 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
              <Layout className="text-white" size={24} />
            </div>
            <span className="font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Allocate Manually</span>
          </button>

          {/* 2. Upload Button */}
          <button
            onClick={goUpload}
            className="flex flex-col items-center gap-4 p-8 border-2 border-gray-200 dark:border-gray-700 rounded-2xl hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-xl transition-all duration-300 bg-white dark:bg-gray-800 group"
          >
            <div className="bg-blue-500 dark:bg-blue-600 p-4 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
              <Upload className="text-white" size={24} />
            </div>
            <span className="font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Upload Data</span>
          </button>

          {/* 3. Classroom Registry Button (New) */}
          <button
            onClick={goClassroom}
            className="flex flex-col items-center gap-4 p-8 border-2 border-gray-200 dark:border-gray-700 rounded-2xl hover:border-purple-500 dark:hover:border-purple-400 hover:shadow-xl transition-all duration-300 bg-white dark:bg-gray-800 group"
          >
            <div className="bg-purple-500 dark:bg-purple-600 p-4 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
              <Monitor className="text-white" size={24} />
            </div>
            <span className="font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Manage Registry</span>
          </button>

        </div>
      </div>

      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 uppercase tracking-tight">Recent Plans</h2>
        {plans.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
             <p className="text-gray-400 font-medium">No plans created yet.</p>
             <p className="text-sm text-gray-500 mt-1">Select an option above to get started.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {plans.map((p, idx) => (
              <li key={idx} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-600">
                <div>
                  <div className="font-bold text-gray-900 dark:text-white">{p.name || `Plan ${plans.length - idx}`}</div>
                  <div className="text-xs font-mono text-gray-500 mt-1">{p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}</div>
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-3 py-1 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                  {p.type || 'Manual'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default CreatePlan;
import React, { useState } from 'react';
import { Upload, Loader2, AlertCircle, CheckCircle, FileSpreadsheet, Database } from 'lucide-react';

const UploadPage = ({ showToast }) => {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('2');
  const [batchName, setBatchName] = useState('');
  const [nameColumn, setNameColumn] = useState('');
  const [enrollmentColumn, setEnrollmentColumn] = useState('');
  
  // Upload state
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [error, setError] = useState(null);

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setError(null);
    setUploadResult(null);
    
    if (selectedFile) {
      if (showToast) showToast(`📁 File selected: ${selectedFile.name}`, "success");
    }
  };

  // Upload and parse
  const handleUpload = async () => {
    if (!file) {
      if (showToast) showToast('Please select a file first', "error");
      return;
    }

    if (!batchName.trim()) {
      if (showToast) showToast('Please enter a batch name', "error");
      return;
    }

    setUploading(true);
    setError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', mode);
      formData.append('batch_name', batchName.trim());
      
      if (nameColumn.trim()) {
        formData.append('nameColumn', nameColumn.trim());
      }
      if (enrollmentColumn.trim()) {
        formData.append('enrollmentColumn', enrollmentColumn.trim());
      }

      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      // Show preview
      setUploadResult(data);
      if (showToast) showToast(`✅ Preview ready! ${data.rows_extracted} students found`, "success");
      
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message);
      if (showToast) showToast(`Upload failed: ${err.message}`, "error");
    } finally {
      setUploading(false);
    }
  };

  // Commit upload to database
  const handleCommit = async () => {
    if (!uploadResult) return;

    setCommitLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/commit-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ batch_id: uploadResult.batch_id })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Commit failed');
      }

      if (showToast) showToast(`✅ Committed! ${data.inserted} students added to database`, "success");
      
      // Reset form
      setFile(null);
      setUploadResult(null);
      setBatchName('');
      setError(null);
      
    } catch (err) {
      console.error('Commit error:', err);
      if (showToast) showToast(`Commit failed: ${err.message}`, "error");
    } finally {
      setCommitLoading(false);
    }
  };

  return (
    // No local "dark" class wrapper needed; handled by ThemeProvider/App.jsx
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 transition-colors duration-300 font-sans">
      <div className="max-w-5xl mx-auto">
        
        {/* Main Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 transition-colors duration-300 border border-gray-100 dark:border-gray-700">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">Upload Student Data</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Upload CSV or XLSX files to import student information</p>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex gap-3">
              <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0" size={20} />
              <p className="text-red-700 dark:text-red-300 font-medium">{error}</p>
            </div>
          )}

          {/* Upload Form */}
          <div className="space-y-6">
            {/* File Input */}
            <div className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Select File
              </label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 dark:text-gray-400
                  file:mr-4 file:py-2.5 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-bold
                  file:bg-blue-600 file:text-white
                  hover:file:bg-blue-700
                  dark:file:bg-blue-600 dark:hover:file:bg-blue-500
                  cursor-pointer transition"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-500 flex items-center gap-1">
                <FileSpreadsheet size={14} /> Supported formats: CSV, XLSX, XLS (Max 50MB)
              </p>
            </div>

            {/* Mode Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Extraction Mode
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setMode('1')}
                  className={`p-4 rounded-xl border-2 transition-all duration-200 text-left relative overflow-hidden ${
                    mode === '1'
                      ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-100 ring-2 ring-blue-200 dark:ring-blue-900'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-gray-500 bg-white dark:bg-gray-700'
                  }`}
                >
                  <div className="font-bold text-lg text-gray-900 dark:text-white">Mode 1</div>
                  <div className="text-sm mt-1 text-gray-600 dark:text-gray-400">Enrollment Only</div>
                  {mode === '1' && <div className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />}
                </button>
                <button
                  onClick={() => setMode('2')}
                  className={`p-4 rounded-xl border-2 transition-all duration-200 text-left relative overflow-hidden ${
                    mode === '2'
                      ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-100 ring-2 ring-indigo-200 dark:ring-indigo-900'
                      : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-gray-500 bg-white dark:bg-gray-700'
                  }`}
                >
                  <div className="font-bold text-lg text-gray-900 dark:text-white">Mode 2</div>
                  <div className="text-sm mt-1 text-gray-600 dark:text-gray-400">Name + Enrollment</div>
                  {mode === '2' && <div className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />}
                </button>
              </div>
            </div>

            {/* Batch Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Batch Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g., CSE, ECE, ME"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl 
                  bg-white dark:bg-gray-900 text-gray-900 dark:text-white
                  focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent
                  placeholder-gray-400 dark:placeholder-gray-600 transition"
              />
            </div>

            {/* Custom Column Names (Optional) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Name Column (Optional)
                </label>
                <input
                  type="text"
                  value={nameColumn}
                  onChange={(e) => setNameColumn(e.target.value)}
                  placeholder="Auto-detect if empty"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl
                    bg-white dark:bg-gray-900 text-gray-900 dark:text-white
                    focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent
                    placeholder-gray-400 dark:placeholder-gray-600 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Enrollment Column (Optional)
                </label>
                <input
                  type="text"
                  value={enrollmentColumn}
                  onChange={(e) => setEnrollmentColumn(e.target.value)}
                  placeholder="Auto-detect if empty"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl
                    bg-white dark:bg-gray-900 text-gray-900 dark:text-white
                    focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent
                    placeholder-gray-400 dark:placeholder-gray-600 transition"
                />
              </div>
            </div>

            {/* Upload Button */}
            <button
              onClick={handleUpload}
              disabled={!file || !batchName.trim() || uploading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 
                disabled:from-gray-300 disabled:to-gray-400 dark:disabled:from-gray-700 dark:disabled:to-gray-700 disabled:cursor-not-allowed 
                text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5
                flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload size={20} />
                  Upload & Preview
                </>
              )}
            </button>
          </div>

          {/* Preview/Result Section */}
          {uploadResult && (
            <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-lg animate-fade-in-up">
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 p-6 border-b border-green-100 dark:border-green-900/50">
                <div className="flex items-center gap-2 mb-4">
                  <Database className="text-green-600 dark:text-green-400" size={24} />
                  <h2 className="text-xl font-bold text-green-900 dark:text-green-100">Upload Preview</h2>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white/80 dark:bg-gray-900/50 p-3 rounded-lg shadow-sm">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Students Found</div>
                    <div className="text-2xl font-bold text-gray-800 dark:text-white">{uploadResult.rows_extracted}</div>
                  </div>
                  <div className="bg-white/80 dark:bg-gray-900/50 p-3 rounded-lg shadow-sm">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Extraction Mode</div>
                    <div className="text-lg font-bold text-gray-800 dark:text-white">Mode {uploadResult.mode}</div>
                  </div>
                  <div className="bg-white/80 dark:bg-gray-900/50 p-3 rounded-lg shadow-sm col-span-2 md:col-span-2">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Batch Info</div>
                    <div className="text-lg font-bold text-gray-800 dark:text-white truncate" title={uploadResult.batch_name}>
                      {uploadResult.batch_name} <span className="text-xs font-normal opacity-60 ml-2">ID: {uploadResult.batch_id.slice(0, 6)}</span>
                    </div>
                  </div>
                </div>

                {/* Warnings */}
                {uploadResult.warnings && uploadResult.warnings.length > 0 && (
                  <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg flex gap-3">
                    <AlertCircle className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" size={18} />
                    <div>
                      <p className="font-semibold text-yellow-800 dark:text-yellow-200 text-sm">Warnings ({uploadResult.warnings.length})</p>
                      <ul className="text-xs text-yellow-700 dark:text-yellow-300 mt-1 space-y-0.5">
                        {uploadResult.warnings.slice(0, 3).map((w, i) => (
                          <li key={i}>• {w}</li>
                        ))}
                        {uploadResult.warnings.length > 3 && <li>...and {uploadResult.warnings.length - 3} more</li>}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Sample Data Table */}
              {uploadResult.sample && uploadResult.sample.length > 0 && (
                <div className="p-6">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3 text-sm uppercase tracking-wide">Sample Data Preview</h4>
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900/50 border-b dark:border-gray-700">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Enrollment</th>
                          {uploadResult.mode === '2' && <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Name</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {uploadResult.sample.slice(0, 5).map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                            <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-400">
                              {typeof row === 'string' ? row : row.enrollmentNo || 'N/A'}
                            </td>
                            {uploadResult.mode === '2' && (
                              <td className="px-4 py-3 text-gray-800 dark:text-gray-200">
                                {typeof row === 'object' && row.name ? row.name : '-'}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-4 justify-end mt-6">
                    <button
                      onClick={() => {
                        setUploadResult(null);
                        setFile(null);
                      }}
                      className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl 
                        text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 
                        font-medium transition focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCommit}
                      disabled={commitLoading}
                      className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 
                        text-white rounded-xl font-bold shadow-md hover:shadow-lg transition-all 
                        disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transform hover:-translate-y-0.5"
                    >
                      {commitLoading ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          Committing...
                        </>
                      ) : (
                        <>
                          <CheckCircle size={18} />
                          Confirm & Save
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UploadPage;
import React, { useState } from 'react';
import { Upload, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

const UploadPage = ({ showToast }) => {  // ✅ ADD showToast PROP
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('2');
  const [batchName, setBatchName] = useState('');
  const [nameColumn, setNameColumn] = useState('');
  const [enrollmentColumn, setEnrollmentColumn] = useState('');
  
  // Preview state
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Upload state
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [error, setError] = useState(null);

  // Handle file selection - NO auto-preview, just select
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setError(null);
    setPreview(null);
    setUploadResult(null);
    
    if (selectedFile) {
      showToast(`📁 File selected: ${selectedFile.name}`, "success");
    }
  };

  // Upload and parse
  const handleUpload = async () => {
    if (!file) {
      showToast('Please select a file first', "error");
      return;
    }

    if (!batchName.trim()) {
      showToast('Please enter a batch name', "error");
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
      showToast(`✅ Preview ready! ${data.rows_extracted} students found`, "success");
      console.log('Upload response:', data);
      
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message);
      showToast(`Upload failed: ${err.message}`, "error");
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

      showToast(`✅ Committed! ${data.inserted} students added to database`, "success");
      
      // Reset form
      setFile(null);
      setUploadResult(null);
      setPreview(null);
      setBatchName('');
      setError(null);
      
    } catch (err) {
      console.error('Commit error:', err);
      showToast(`Commit failed: ${err.message}`, "error");
    } finally {
      setCommitLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Upload Student Data</h1>
          <p className="text-gray-600 mb-6">Upload CSV or XLSX files to import student information</p>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
              <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
              <p className="text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Upload Form */}
          <div className="space-y-6">
            {/* File Input */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Select File
              </label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-3 file:px-6
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100 cursor-pointer"
              />
              <p className="mt-2 text-xs text-gray-500">
                Supported formats: CSV, XLSX, XLS (Max 50MB)
              </p>
            </div>

            {/* Mode Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Extraction Mode
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setMode('1')}
                  className={`p-4 rounded-lg border-2 transition ${
                    mode === '1'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold">Mode 1</div>
                  <div className="text-sm mt-1">Enrollment Only</div>
                </button>
                <button
                  onClick={() => setMode('2')}
                  className={`p-4 rounded-lg border-2 transition ${
                    mode === '2'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold">Mode 2</div>
                  <div className="text-sm mt-1">Name + Enrollment</div>
                </button>
              </div>
            </div>

            {/* Batch Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Batch Name *
              </label>
              <input
                type="text"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g., CSE, ECE, ME"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Custom Column Names (Optional) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Name Column (Optional)
                </label>
                <input
                  type="text"
                  value={nameColumn}
                  onChange={(e) => setNameColumn(e.target.value)}
                  placeholder="Auto-detect if empty"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Enrollment Column (Optional)
                </label>
                <input
                  type="text"
                  value={enrollmentColumn}
                  onChange={(e) => setEnrollmentColumn(e.target.value)}
                  placeholder="Auto-detect if empty"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Upload Button */}
            <button
              onClick={handleUpload}
              disabled={!file || !batchName.trim() || uploading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-lg transition shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
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
            <div className="mt-8 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-300">
              <h2 className="text-xl font-bold text-green-800 mb-4">✅ Upload Preview</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-2xl font-bold text-blue-600">{uploadResult.rows_extracted}</div>
                  <div className="text-sm text-gray-600">Students Found</div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-lg font-bold text-purple-600">Mode {uploadResult.mode}</div>
                  <div className="text-sm text-gray-600">Extraction Mode</div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-sm font-semibold text-gray-700 truncate">
                    {uploadResult.batch_name}
                  </div>
                  <div className="text-sm text-gray-600">Batch Name</div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-xs font-mono text-gray-700">
                    {uploadResult.batch_id.slice(0, 8)}...
                  </div>
                  <div className="text-sm text-gray-600">Batch ID</div>
                </div>
              </div>

              {/* Warnings */}
              {uploadResult.warnings && uploadResult.warnings.length > 0 && (
                <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex gap-3">
                  <AlertCircle className="text-yellow-600 flex-shrink-0" size={20} />
                  <div>
                    <p className="font-semibold text-yellow-800">Warnings ({uploadResult.warnings.length})</p>
                    <ul className="text-sm text-yellow-700 mt-2 space-y-1">
                      {uploadResult.warnings.slice(0, 5).map((w, i) => (
                        <li key={i}>• {w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Sample Data Table */}
              {uploadResult.sample && uploadResult.sample.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-800 mb-3">Sample Data (First 5 rows)</h4>
                  <div className="overflow-x-auto border border-gray-200 rounded">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 border-b">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold">Enrollment</th>
                          {uploadResult.mode === '2' && <th className="px-4 py-2 text-left font-semibold">Name</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {uploadResult.sample.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-2 font-mono text-gray-700">
                              {typeof row === 'string' ? row : row.enrollmentNo || 'N/A'}
                            </td>
                            {uploadResult.mode === '2' && (
                              <td className="px-4 py-2 text-gray-700">
                                {typeof row === 'object' && row.name ? row.name : '-'}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setUploadResult(null);
                    setFile(null);
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCommit}
                  disabled={commitLoading}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition disabled:opacity-50 flex items-center gap-2"
                >
                  {commitLoading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Committing...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={18} />
                      Commit to Database
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UploadPage;
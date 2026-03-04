import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getToken } from '../utils/tokenStorage';
import { useSession } from '../contexts/SessionContext';
import SessionIndicator from '../components/SessionIndicator';
import { 
  Upload, Loader2, AlertCircle, CheckCircle, FileSpreadsheet, 
  Database, ArrowRight, Eye, Check, X, Zap, RefreshCw, FileText,
  Download, Info, ChevronDown, ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const UploadPage = ({ showToast }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const { 
    session, 
    hasActiveSession, 
    loading: sessionLoading,
    createSession, 
    updateSession, 
    clearCompletedSession 
  } = useSession();
  
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('2');
  const [batchName, setBatchName] = useState('');
  const [nameColumn, setNameColumn] = useState('');
  const [enrollmentColumn, setEnrollmentColumn] = useState('');
  
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pageReady, setPageReady] = useState(false);
  
  // ✅ FIXED: Use consistent state name
  const [uploadedBatches, setUploadedBatches] = useState([]);

  // ============================================================================
  // INITIALIZATION - Clear old sessions and refresh
  // ============================================================================
  useEffect(() => {
    const initPage = async () => {
      console.log('📄 UploadPage initializing...');
      
      // Clear completed session from context
      clearCompletedSession?.();
      
      // Force refresh session status from server
      await updateSession();
      
      // Small delay to ensure state is settled
      await new Promise(resolve => setTimeout(resolve, 100));
      
      setPageReady(true);
    };
    
    initPage();
  }, []);

  // ============================================================================
  // CLEAR BATCHES - When no active session or session completed
  // ============================================================================
  useEffect(() => {
    // Only run after page is ready to avoid clearing during init
    if (!pageReady) return;
    
    if (!hasActiveSession || !session) {
      console.log('🧹 Clearing uploaded batches - no active session');
      setUploadedBatches([]);
    }
  }, [hasActiveSession, session, pageReady]);

  useEffect(() => {
    if (!pageReady) return;
    
    if (session?.status === 'completed') {
      console.log('🧹 Session completed - clearing batches');
      setUploadedBatches([]);
    }
  }, [session?.status, pageReady]);

  // ============================================================================
  // LOAD EXISTING BATCHES - If session exists
  // ============================================================================
  useEffect(() => {
    if (hasActiveSession && session?.session_id && pageReady) {
      fetchSessionUploads(session.session_id);
    }
  }, [hasActiveSession, session?.session_id, pageReady]);

  // Re-fetch when user changes (account switch)
  const userIdentity = user?.email || user?.id;
  useEffect(() => {
    if (userIdentity) {
      setUploadedBatches([]);
      setUploadResult(null);
      setFile(null);
      setError(null);
      setPageReady(false);
      // Re-trigger initialization
      const reinit = async () => {
        clearCompletedSession?.();
        await updateSession();
        await new Promise(resolve => setTimeout(resolve, 100));
        setPageReady(true);
      };
      reinit();
    }
  }, [userIdentity]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSessionUploads = async (sessionId) => {
    try {
      const token = getToken();
      const response = await fetch(`/api/sessions/${sessionId}/uploads`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await response.json();
      
      if (data.success && data.uploads) {
        setUploadedBatches(data.uploads.map(u => ({
          upload_id: u.upload_id || u.id,
          batch_id: u.batch_id,
          batch_name: u.batch_name,
          batch_color: u.batch_color || '#3b82f6',
          filename: u.original_filename || u.filename || 'Unknown file',
          student_count: u.student_count || 0
        })));
      }
    } catch (err) {
      console.error('Failed to fetch session uploads:', err);
    }
  };

  const downloadTemplate = async (filename) => {
    try {
      const response = await fetch(`/api/templates/download/${filename}`);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      if (showToast) showToast(`✅ Downloaded: ${filename}`, "success");
    } catch (error) {
      if (showToast) showToast(`❌ Download failed: ${error.message}`, "error");
      console.error('Download error:', error);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setError(null);
    setUploadResult(null);
    
    if (selectedFile) {
      if (showToast) showToast(`📁 File selected: ${selectedFile.name}`, "success");
    }
  };

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
      
      if (hasActiveSession && session) {
        formData.append('session_id', session.session_id);
      }
      
      if (nameColumn.trim()) formData.append('nameColumn', nameColumn.trim());
      if (enrollmentColumn.trim()) formData.append('enrollmentColumn', enrollmentColumn.trim());

      const token = getToken();
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed');

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

  const handleCommit = async () => {
    if (!uploadResult) return;

    setCommitLoading(true);
    try {
      const token = getToken();
      
      const payload = { batch_id: uploadResult.batch_id };
      if (hasActiveSession && session) {
        payload.session_id = session.session_id;
      }
      
      const response = await fetch('/api/commit-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Commit failed');

      // ✅ FIXED: Add to uploadedBatches with filename
      setUploadedBatches(prev => [...prev, {
        upload_id: data.upload_id,
        batch_id: uploadResult.batch_id,
        batch_name: batchName,
        batch_color: data.batch_color || '#3b82f6',
        filename: file?.name || 'Unknown file',  // ✅ Include filename
        student_count: data.inserted
      }]);

      if (showToast) showToast(`✅ Committed! ${data.inserted} students added`, "success");
      
      if (hasActiveSession) {
        await updateSession();
      }
      
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

  const handleRemoveBatch = (uploadId) => {
    // Remove from local state (you might want to call an API to delete from server too)
    setUploadedBatches(prev => prev.filter(b => b.upload_id !== uploadId));
    if (showToast) showToast('Batch removed from selection', 'success');
  };

  const handleStartSession = async () => {
    if (uploadedBatches.length === 0) {
      if (showToast) showToast('Please upload at least one batch', "error");
      return;
    }

    try {
      const upload_ids = uploadedBatches.map(b => b.upload_id);
      const token = getToken();
      
      let response = await fetch('/api/sessions/start', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
          },
          body: JSON.stringify({ upload_ids })
      });

      let data = await response.json();

      if (!response.ok && data.error?.includes('active session')) {
          if (window.confirm('An active session exists. Force start new session?')) {
              response = await fetch('/api/sessions/force-new', {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` })
                  },
                  body: JSON.stringify({ upload_ids })
              });
              
              data = await response.json();
          } else {
              return;
          }
      }

      if (!response.ok) throw new Error(data.error);

      await createSession(upload_ids, []);

      if (showToast) showToast(`✅ Session initialized!`, "success");
      navigate('/allocation');

    } catch (err) {
      if (showToast) showToast(`Failed to start session: ${err.message}`, "error");
    }
  };

  const handleContinueExisting = () => {
    navigate('/allocation');
  };

  // ============================================================================
  // LOADING STATE - Show while initializing
  // ============================================================================
  if (!pageReady || sessionLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#050505] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 border-4 border-orange-200 dark:border-orange-900 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-transparent border-t-orange-500 rounded-full animate-spin"></div>
          </div>
          <p className="text-gray-600 dark:text-gray-400 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#050505] py-8 px-4 transition-colors duration-300">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <SessionIndicator />

        {/* Hero Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-200 dark:border-gray-800">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="relative w-3 h-3">
                <div className="absolute inset-0 bg-orange-500 rounded-full animate-ping opacity-75"></div>
                <div className="relative w-3 h-3 bg-orange-500 rounded-full border border-orange-400"></div>
              </div>
              <span className="text-xs font-mono text-orange-500 tracking-wider uppercase">
                {hasActiveSession ? 'Adding to Session' : 'Data Import'}
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold pb-1 bg-gradient-to-r from-gray-900 via-gray-700 to-gray-500 dark:from-gray-100 dark:via-gray-300 dark:to-gray-500 bg-clip-text text-transparent">
              Upload Student Data
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {hasActiveSession 
                ? 'Add more batches to existing session'
                : 'Import CSV or XLSX files to begin allocation'
              }
            </p>
          </div>
          
          {uploadedBatches.length > 0 && (
            <div className="flex gap-4 items-end">
              <div className="text-right">
                <div className="text-xs text-gray-500 mb-1">Batches</div>
                <div className="text-3xl font-black text-orange-600 dark:text-orange-400">
                  {uploadedBatches.length}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 mb-1">Total Students</div>
                <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                  {uploadedBatches.reduce((sum, b) => sum + (b.student_count || 0), 0)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl flex gap-3 animate-fadeIn">
            <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0" size={20} />
            <p className="text-red-700 dark:text-red-300 font-semibold">{error}</p>
          </div>
        )}

        {/* Active Session Warning */}
        {hasActiveSession && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-6 flex gap-4">
            <AlertCircle className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-bold text-blue-900 dark:text-blue-100 mb-2">Active Session Detected</h3>
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-4">
                You have an active session ({session?.plan_id}). New uploads will be added to this session.
              </p>
              <button 
                onClick={handleContinueExisting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors text-sm"
              >
                Continue to Allocation →
              </button>
            </div>
          </div>
        )}

        {/* ✅ FIXED: Ready Batches Section with Filename */}
        {uploadedBatches.length > 0 && (
          <div className="glass-card p-6 border-2 border-emerald-500 dark:border-emerald-400 rounded-2xl bg-white dark:bg-gray-900">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <CheckCircle className="text-emerald-500" size={20} />
                  Ready Batches
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {uploadedBatches.reduce((sum, b) => sum + (b.student_count || 0), 0)} students across {uploadedBatches.length} batch(es)
                </p>
              </div>
              {!hasActiveSession && uploadedBatches.length > 0 && (
                <button
                  onClick={() => {
                    setFile(null);
                    setUploadResult(null);
                    setBatchName('');
                  }}
                  className="px-4 py-2 text-sm font-bold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                >
                  + Add Another Batch
                </button>
              )}
            </div>
            
            {/* ✅ Batch Cards with Filename */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {uploadedBatches.map((batch, idx) => (
                <div
                  key={batch.upload_id || idx}
                  className="relative bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 group hover:border-orange-400 transition-all"
                >
                  {/* Color indicator */}
                  <div 
                    className="absolute top-0 left-0 right-0 h-1.5 rounded-t-xl"
                    style={{ backgroundColor: batch.batch_color || '#3b82f6' }}
                  />
                  
                  {/* Remove button - Only visible when NO active session */}
                  {!hasActiveSession && (
                    <button
                      onClick={() => handleRemoveBatch(batch.upload_id)}
                      className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      title="Remove batch"
                    >
                      <X size={16} />
                    </button>
                  )}

                  {/* Batch Info */}
                  <div className="mt-2 space-y-2">
                    {/* Batch/Branch Name */}
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: batch.batch_color || '#3b82f6' }}
                      />
                      <span className="font-bold text-gray-900 dark:text-white text-lg truncate">
                        {batch.batch_name}
                      </span>
                    </div>

                    {/* ✅ Filename Display */}
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <FileText size={14} className="flex-shrink-0 text-gray-400" />
                      <span className="truncate" title={batch.filename}>
                        {batch.filename || 'Unknown file'}
                      </span>
                    </div>

                    {/* Student Count */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Students</span>
                      <span className="font-mono font-bold text-orange-600 dark:text-orange-400">
                        {batch.student_count || 0}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            {!hasActiveSession && (
              <button
                onClick={handleStartSession}
                className="w-full h-14 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-lg font-bold uppercase tracking-wide rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <Zap className="w-5 h-5" />
                <span>Start Allocation Session</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            )}

            {hasActiveSession && (
              <button
                onClick={handleContinueExisting}
                className="w-full h-14 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white text-lg font-bold uppercase tracking-wide rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <ArrowRight className="w-5 h-5" />
                <span>Continue to Allocation</span>
              </button>
            )}
          </div>
        )}

        {/* Upload Form */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upload Zone */}
          <div className="space-y-6">
            <div className="glass-card border-2 border-dashed border-gray-300 dark:border-gray-700 p-8 flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden hover:border-orange-400 dark:hover:border-orange-400 transition-colors group rounded-2xl bg-white dark:bg-gray-900">
              {!file ? (
                <>
                  <div className="w-20 h-20 rounded-full bg-orange-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Upload className="w-10 h-10 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-bold uppercase tracking-tighter text-gray-900 dark:text-white">Drop your files here</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Support CSV, XLSX formats up to 50MB</p>
                  </div>
                  <input 
                    type="file" 
                    className="absolute inset-0 opacity-0 cursor-pointer" 
                    accept=".csv, .xlsx"
                    onChange={handleFileChange}
                  />
                </>
              ) : (
                <div className="w-full space-y-6">
                  <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
                    <div className="p-3 rounded-xl bg-orange-500/20 text-orange-600 dark:text-orange-400">
                      <FileSpreadsheet className="w-8 h-8" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="font-bold font-mono text-gray-900 dark:text-white truncate">{file.name}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                    <button onClick={() => setFile(null)} className="p-2 hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 rounded-full transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {!uploadResult && (
                    <button 
                      onClick={handleUpload}
                      disabled={uploading}
                      className="w-full h-14 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:from-gray-300 disabled:to-gray-400 text-white text-lg font-bold uppercase tracking-wide rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="animate-spin" />
                          <span>PARSING DATA...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          <span>PROCESS FILE</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="glass-card p-6 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-900 dark:text-white mb-4">Requirements</h3>
              <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-400 font-sans">
                <li className="flex items-center gap-2"><Check className="w-3 h-3 text-emerald-500" /> Header row must contain Name, Roll, Dept</li>
                <li className="flex items-center gap-2"><Check className="w-3 h-3 text-emerald-500" /> Max file size: 10 MB</li>
                <li className="flex items-center gap-2"><Check className="w-3 h-3 text-emerald-500" /> Duplicates will be ignored</li>
                <li className="flex items-center gap-2"><Check className="w-3 h-3 text-emerald-500" /> Column names are case-insensitive</li>
              </ul>
            </div>

            {/* Template Download Section */}
            <div className="glass-card p-6 rounded-2xl border-2 border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20">
              <div className="flex items-center gap-2 mb-4">
                <Download className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-gray-900 dark:text-white">Download Sample Template</h3>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                Not sure about the format? Download a sample CSV template to see the exact structure required.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => downloadTemplate('students_mode1.csv')}
                  className="flex items-center gap-3 px-4 py-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-orange-500 dark:hover:border-orange-400 transition-all group cursor-pointer"
                >
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg group-hover:bg-orange-500 transition-colors">
                    <Download className="w-5 h-5 text-orange-600 dark:text-orange-400 group-hover:text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400">
                      Mode 1 Template
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Enrollment Only
                    </div>
                  </div>
                  <FileSpreadsheet className="w-5 h-5 text-gray-300 dark:text-gray-600" />
                </button>
                <button
                  onClick={() => downloadTemplate('students_mode2.csv')}
                  className="flex items-center gap-3 px-4 py-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-orange-500 dark:hover:border-orange-400 transition-all group cursor-pointer"
                >
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg group-hover:bg-orange-500 transition-colors">
                    <Download className="w-5 h-5 text-orange-600 dark:text-orange-400 group-hover:text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400">
                      Mode 2 Template
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Name + Enrollment + Dept
                    </div>
                  </div>
                  <FileSpreadsheet className="w-5 h-5 text-gray-300 dark:text-gray-600" />
                </button>
                <button
                  onClick={() => downloadTemplate('CSE_Batch_10.csv')}
                  className="flex items-center gap-3 px-4 py-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-orange-500 dark:hover:border-orange-400 transition-all group cursor-pointer"
                >
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg group-hover:bg-orange-500 transition-colors">
                    <Download className="w-5 h-5 text-orange-600 dark:text-orange-400 group-hover:text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400">
                      CSE Batch Example
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      10 Sample Students
                    </div>
                  </div>
                  <FileSpreadsheet className="w-5 h-5 text-gray-300 dark:text-gray-600" />
                </button>
              </div>
              
              {/* Quick Preview */}
              <div className="mt-4 p-3 bg-white/70 dark:bg-gray-800/70 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  Mode 2 Template Preview:
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-1 px-2 text-orange-600 dark:text-orange-400">Name</th>
                        <th className="text-left py-1 px-2 text-orange-600 dark:text-orange-400">Enrollment</th>
                        <th className="text-left py-1 px-2 text-orange-600 dark:text-orange-400">Department</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-600 dark:text-gray-400">
                      <tr><td className="py-1 px-2">Rahul Sharma</td><td className="py-1 px-2">21BCE1001</td><td className="py-1 px-2">Computer Science</td></tr>
                      <tr><td className="py-1 px-2">Priya Patel</td><td className="py-1 px-2">21BCE1002</td><td className="py-1 px-2">Computer Science</td></tr>
                      <tr><td className="py-1 px-2 text-gray-400">...</td><td className="py-1 px-2 text-gray-400">...</td><td className="py-1 px-2 text-gray-400">...</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* Accepted Headers Info */}
              <details className="mt-4 group">
                <summary className="flex items-center gap-2 cursor-pointer text-xs font-bold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300">
                  <Info className="w-3 h-3" />
                  <span>View All Accepted Column Names</span>
                  <ChevronDown className="w-3 h-3 group-open:hidden" />
                  <ChevronUp className="w-3 h-3 hidden group-open:inline" />
                </summary>
                <div className="mt-3 p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg text-xs space-y-2">
                  <div>
                    <span className="font-bold text-gray-700 dark:text-gray-300">Enrollment:</span>
                    <span className="text-gray-600 dark:text-gray-400 ml-1">enrollment, enrollmentno, roll, rollno, regno, studentid, id, matricno</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-700 dark:text-gray-300">Name:</span>
                    <span className="text-gray-600 dark:text-gray-400 ml-1">name, studentname, fullname, candidate, firstname</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-700 dark:text-gray-300">Department:</span>
                    <span className="text-gray-600 dark:text-gray-400 ml-1">department, dept, branch, course, program</span>
                  </div>
                </div>
              </details>
            </div>

            {/* Mode & Config */}
            <div className="space-y-4">
              <label className="block text-sm font-bold uppercase tracking-widest text-gray-900 dark:text-white">Extraction Mode</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setMode('1')}
                  className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                    mode === '1'
                      ? 'border-orange-500 dark:border-orange-400 bg-orange-50 dark:bg-orange-500/10 ring-2 ring-orange-200 dark:ring-orange-900'
                      : 'border-gray-200 dark:border-gray-700 hover:border-orange-300 bg-white dark:bg-gray-900'
                  }`}
                >
                  <div className="font-bold text-lg text-gray-900 dark:text-white">Mode 1</div>
                  <div className="text-sm mt-1 text-gray-600 dark:text-gray-400">Enrollment Only</div>
                </button>
                <button
                  onClick={() => setMode('2')}
                  className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                    mode === '2'
                      ? 'border-orange-500 dark:border-orange-400 bg-orange-50 dark:bg-orange-500/10 ring-2 ring-orange-200 dark:ring-orange-900'
                      : 'border-gray-200 dark:border-gray-700 hover:border-orange-300 bg-white dark:bg-gray-900'
                  }`}
                >
                  <div className="font-bold text-lg text-gray-900 dark:text-white">Mode 2</div>
                  <div className="text-sm mt-1 text-gray-600 dark:text-gray-400">Name + Enrollment</div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold uppercase tracking-widest text-gray-900 dark:text-white mb-2">
                Batch Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g., CS-A, ECE-2024"
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold uppercase tracking-widest text-gray-900 dark:text-white mb-2">Name Column</label>
                <input
                  type="text"
                  value={nameColumn}
                  onChange={(e) => setNameColumn(e.target.value)}
                  placeholder="Auto-detect"
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-bold uppercase tracking-widest text-gray-900 dark:text-white mb-2">Enrollment Column</label>
                <input
                  type="text"
                  value={enrollmentColumn}
                  onChange={(e) => setEnrollmentColumn(e.target.value)}
                  placeholder="Auto-detect"
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>

          {/* Preview Zone */}
          <AnimatePresence>
            {uploadResult && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <div className="glass-card rounded-2xl p-0 flex flex-col overflow-hidden min-h-[500px] border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                  <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
                    <div className="flex items-center gap-3">
                      <Eye className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      <h2 className="font-bold uppercase text-gray-900 dark:text-white">Preview</h2>
                    </div>
                    <div className="text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-full border border-emerald-300 dark:border-emerald-500/30">
                      {uploadResult.rows_extracted} RECORDS
                    </div>
                  </div>

                  {uploadResult.warnings && uploadResult.warnings.length > 0 && (
                    <div className="mx-6 mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/30 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl flex gap-3">
                      <AlertCircle className="text-yellow-600 dark:text-yellow-400 flex-shrink-0" size={20} />
                      <div>
                        <p className="font-bold text-yellow-800 dark:text-yellow-200 text-sm mb-2">Warnings</p>
                        <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                          {uploadResult.warnings.slice(0, 3).map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-left font-mono text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          <th className="p-4 font-bold uppercase text-gray-700 dark:text-gray-300">NAME</th>
                          <th className="p-4 font-bold uppercase text-gray-700 dark:text-gray-300">ROLL</th>
                          <th className="p-4 font-bold uppercase text-gray-700 dark:text-gray-300">DEPT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadResult.sample?.slice(0, 10).map((row, i) => (
                          <tr key={i} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="p-4 font-sans text-gray-900 dark:text-white">
                              {typeof row === 'object' && row.name ? row.name : 'N/A'}
                            </td>
                            <td className="p-4 text-orange-600 dark:text-orange-400">
                              {typeof row === 'string' ? row : row.enrollmentNo || 'N/A'}
                            </td>
                            <td className="p-4 text-gray-700 dark:text-gray-300">
                              {typeof row === 'object' && row.department ? row.department : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-6 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={() => {
                          setUploadResult(null);
                          setFile(null);
                        }}
                        className="px-6 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-bold transition-all"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleCommit}
                        disabled={commitLoading}
                        className={`px-6 py-3 text-lg font-bold uppercase rounded-xl transition-all flex items-center gap-2 ${
                          commitLoading 
                            ? "bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 cursor-not-allowed" 
                            : "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-lg"
                        }`}
                      >
                        {commitLoading ? (
                          <>
                            <Loader2 className="animate-spin" />
                            <span>Committing...</span>
                          </>
                        ) : (
                          <>
                            <Database className="w-5 h-5" />
                            <span>COMMIT</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;
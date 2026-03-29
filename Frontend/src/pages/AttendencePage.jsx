import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getToken } from '../utils/tokenStorage';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserCheck, Eye, X, Loader2,
  BookOpen, FileDown, Building2, ArrowLeft, Users,
  UploadCloud, FileText, CheckCircle, AlertCircle, Archive, ChevronDown, FolderArchive
} from 'lucide-react';

const FORMAT_SLIDES = [
  { src: '/formats/format1.png', label: 'Format 1 · Rows' },
  { src: '/formats/format2.png', label: 'Format 2 · Matrix' },
];

const AttendancePage = ({ showToast }) => {
  const { planId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roomFromUrl = searchParams.get('room');
  // Determine where user came from (default to allocation)
  const source = searchParams.get('source') || 'allocation';

  const [batchGroups, setBatchGroups] = useState({});
  const [roomName, setRoomName] = useState(roomFromUrl || "");
  const [allRooms, setAllRooms] = useState([]);
  const [roomsData, setRoomsData] = useState({}); // Store all rooms data for stats
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  
  // ── Debarred section state ──────────────────────────────────────────────
  const [debarredExpanded, setDebarredExpanded] = useState(false);
  const [debarredFiles, setDebarredFiles] = useState([]); // [{id, file, filename, status, detected_batch, subjects, error}]
  const [debarredDragging, setDebarredDragging] = useState(false);
  const [debarredLoading, setDebarredLoading] = useState(false);
  const [debarredSlide, setDebarredSlide] = useState(0);

  const [metadata, setMetadata] = useState({
    // Attendance Settings
    attendance_dept_name: 'Computer Science and Engineering',
    attendance_year: new Date().getFullYear(),
    attendance_exam_heading: 'SESSIONAL EXAMINATION',
    attendance_banner_path: '',
    
    // Course Info
    course_name: "",
    course_code: ""
  });

  useEffect(() => {
    if (planId) {
      fetchBatchData();
    }
  }, [planId, roomFromUrl]);

  useEffect(() => {
    const timer = setInterval(() => {
      setDebarredSlide(s => (s + 1) % FORMAT_SLIDES.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const fetchBatchData = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const response = await fetch(`/api/plan-batches/${planId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error("Could not load plan data.");
      
      const data = await response.json();

      // Store all rooms data
      const rooms = data?.rooms || {};
      setRoomsData(rooms);

      // Store all available rooms
      const availableRooms = Object.keys(rooms);
      setAllRooms(availableRooms);

      // Determine which room to display
      let targetRoom = roomFromUrl;
      
      if (!targetRoom && data?.metadata?.room_no) {
        targetRoom = data.metadata.room_no;
      }
      
      if (!targetRoom && data?.inputs?.room_no) {
        targetRoom = data.inputs.room_no;
      }

      if (!targetRoom && availableRooms.length > 0) {
        targetRoom = availableRooms[0];
      }

      // Extract batches for target room
      let extractedBatches = {};
      
      if (rooms[targetRoom]) {
        extractedBatches = rooms[targetRoom].batches || {};
      } else if (data?.batches) {
        extractedBatches = data.batches;
      }

      setRoomName(targetRoom || "N/A");
      setBatchGroups(extractedBatches);

      if (showToast) {
        if (Object.keys(extractedBatches).length > 0) {
          showToast(`Loaded data for Room: ${targetRoom}`, "success");
        } else {
          showToast("No batch data found in this plan.", "warning");
        }
      }
    } catch (err) {
      console.error("Fetch error:", err);
      if (showToast) showToast("Error: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const switchRoom = (newRoom) => {
    // Preserve the source parameter when switching rooms
    const params = new URLSearchParams();
    params.set('room', newRoom);
    if (source !== 'allocation') {
      params.set('source', source);
    }
    navigate(`/attendance/${planId}?${params.toString()}`);
  };

  // ── Debarred helper: call analyze API for a single file ─────────────────
  const analyzeDebarredFile = async (file, id) => {
    setDebarredFiles(prev =>
      prev.map(f => f.id === id ? { ...f, status: 'analyzing' } : f)
    );
    try {
      const token = getToken();
      const fd = new FormData();
      fd.append('plan_id', planId);
      fd.append('room_no', roomName);
      fd.append('file', file);
      const res = await fetch('/api/analyze-debarred-file', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error('Analysis failed');
      const result = await res.json();
      setDebarredFiles(prev =>
        prev.map(f =>
          f.id === id
            ? {
                ...f,
                status: 'done',
                detected_batch: result.detected_batch,
                subjects: result.subjects || [],
                batch_total: result.batch_total_students,
              }
            : f
        )
      );
    } catch (err) {
      setDebarredFiles(prev =>
        prev.map(f => f.id === id ? { ...f, status: 'error', error: err.message } : f)
      );
    }
  };

  const addDebarredFiles = (files) => {
    const items = Array.from(files).map(file => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      filename: file.name,
      status: 'pending',
      detected_batch: null,
      subjects: [],
      error: null,
    }));
    setDebarredFiles(prev => {
      const updated = [...prev, ...items];
      // Trigger analysis for each new item
      items.forEach(item => analyzeDebarredFile(item.file, item.id));
      return updated;
    });
  };

  const removeDebarredFile = (id) => {
    setDebarredFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleDebarredDrop = (e) => {
    e.preventDefault();
    setDebarredDragging(false);
    if (e.dataTransfer.files.length) addDebarredFiles(e.dataTransfer.files);
  };

  const handleDebarredDownload = async () => {
    if (!metadata.course_name || !metadata.course_code) {
      if (showToast) showToast('Please enter Course Name and Code', 'warning');
      return;
    }
    setDebarredLoading(true);
    try {
      const token = getToken();
      const fd = new FormData();
      fd.append('plan_id', planId);
      fd.append('room_no', roomName);
      fd.append('metadata', JSON.stringify(buildCompleteMetadata()));
      debarredFiles.forEach(item => {
        if (item.file) fd.append('debarred_files', item.file);
      });
      const res = await fetch('/api/export-attendance-debarred', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate ZIP');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Attendance_Debarred_${planId}_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      if (showToast) showToast('✅ Attendance ZIP downloaded', 'success');
    } catch (err) {
      if (showToast) showToast(err.message, 'error');
    } finally {
      setDebarredLoading(false);
    }
  };

  // ✅ FIXED: Build complete metadata for API
  // ✅ FIXED: Build metadata with EXACT field names that backend/PDF expects
const buildCompleteMetadata = () => {
  return {
    // Attendance Settings
    attendance_dept_name: metadata.attendance_dept_name,
    attendance_year: metadata.attendance_year,
    attendance_exam_heading: metadata.attendance_exam_heading,
    attendance_banner_path: metadata.attendance_banner_path,
    // Course Info
    course_name: metadata.course_name,
    course_code: metadata.course_code,
    date: metadata.date || '',
    time: metadata.time || '',
    
    // Room info
    room_no: roomName,
    room_name: roomName,
    
    // Plan info
    plan_id: planId
  };
};

  const handleZipHierarchy = async () => {
    setActionLoading('zip-hierarchy');
    try {
      const token = getToken();
      const completeMetadata = buildCompleteMetadata();
      
      const response = await fetch('/api/generate-pdf/hierarchy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          plan_id: planId,
          metadata: completeMetadata
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const blob = await response.blob();
      if (blob.size === 0) throw new Error('Empty response from server');

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Plan_${planId}_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      if (showToast) showToast('✅ Zip hierarchy downloaded', 'success');
    } catch (err) {
      console.error('❌ Zip hierarchy error:', err);
      if (showToast) showToast(err.message, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadSingle = async (batchLabel) => {
    if (!metadata.course_name || !metadata.course_code) {
      if (showToast) showToast("Please enter Course Name and Code", "warning");
      return;
    }

    setActionLoading(batchLabel);
    try {
      const token = getToken();
      const completeMetadata = buildCompleteMetadata();
      
      console.log('📤 Sending batch download request:', { batchLabel, metadata: completeMetadata });
      console.log('🔍 Academic Year being sent:', completeMetadata.attendance_year);
      console.log('🔍 Exam Heading being sent:', completeMetadata.attendance_exam_heading);

      const response = await fetch('/api/export-attendance', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          plan_id: planId,
          batch_name: batchLabel,
          metadata: completeMetadata
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate PDF");
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("Empty PDF received");
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Attendance_${roomName}_${batchLabel}_${metadata.course_code}_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      if (showToast) showToast(`✅ Attendance for ${batchLabel} downloaded`, "success");
    } catch (err) {
      console.error("Download error:", err);
      if (showToast) showToast(err.message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadRoom = async () => {
    if (!metadata.course_name || !metadata.course_code) {
      if (showToast) showToast("Please enter Course Name and Code", "warning");
      return;
    }

    setActionLoading('room');
    try {
      const token = getToken();
      const completeMetadata = buildCompleteMetadata();
      
      console.log('📤 Sending room download request:', { roomName, metadata: completeMetadata });

      const response = await fetch('/api/export-attendance', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          plan_id: planId,
          batch_name: roomName,
          metadata: completeMetadata
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate PDF");
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("Empty PDF received");
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Attendance_${roomName}_Complete_${metadata.course_code}_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      if (showToast) showToast(`✅ Complete attendance for ${roomName} downloaded`, "success");
    } catch (err) {
      console.error("Download error:", err);
      if (showToast) showToast(err.message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePreview = (batchLabel) => {
    const batch = batchGroups[batchLabel];
    if (!batch) return;
    
    // Sort students by roll_number before preview
    const sortedStudents = [...(batch.students || [])].sort((a, b) => {
      const rollA = a.roll_number || a.enrollment || a.enrollment_no || '';
      const rollB = b.roll_number || b.enrollment || b.enrollment_no || '';
      return rollA.localeCompare(rollB);
    });
    
    setPreviewData({
      label: batchLabel,
      students: sortedStudents,
      info: batch.info || {}
    });
  };

  // ✅ FIXED: Calculate total students from actual batch data
  const totalStudents = Object.values(batchGroups).reduce(
    (sum, batch) => sum + (batch?.students?.length || 0), 
    0
  );

  // ✅ FIXED: Calculate room capacity from matrix if available
  const getRoomCapacity = () => {
    const currentRoomData = roomsData[roomName];
    if (!currentRoomData) return 0;
    
    const matrix = currentRoomData.raw_matrix || currentRoomData.matrix;
    if (matrix && matrix.length > 0) {
      return matrix.length * (matrix[0]?.length || 0);
    }
    
    const inputs = currentRoomData.inputs;
    if (inputs) {
      return (inputs.rows || 0) * (inputs.cols || 0);
    }
    
    return 0;
  };

  const roomCapacity = getRoomCapacity();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-[#050505]">
        <Loader2 className="animate-spin text-orange-500 w-12 h-12 mb-4" />
        <p className="text-gray-500 font-bold uppercase tracking-widest">Reading Cache...</p>
      </div>
    );
  }

  // ── Zip Hierarchy Mode ──────────────────────────────────────────────────
  if (source === 'zip-hierarchy') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#050505] py-12 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-8">
            <div>
              <h1 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                <FolderArchive className="text-violet-500" size={36} />
                Generate Zip Hierarchy
              </h1>
              <p className="text-gray-500 font-medium mt-2">
                Plan: <span className="text-orange-500 font-bold">{planId}</span>
              </p>
            </div>
            <button 
              onClick={() => navigate('/create-plan')}
              className="text-sm font-bold text-gray-500 hover:text-orange-500 transition-colors flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              Back to Plans
            </button>
          </div>

          {/* Metadata Sections */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 border-2 border-gray-100 dark:border-gray-700 shadow-xl">
            <h2 className="text-xs font-black text-emerald-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <UserCheck size={16}/> Attendance Sheet Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Department Name</label>
                <input 
                  className="w-full h-12 px-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:border-emerald-500 outline-none transition-all"
                  value={metadata.attendance_dept_name}
                  onChange={e => setMetadata({...metadata, attendance_dept_name: e.target.value})}
                  placeholder="e.g., Computer Science and Engineering"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Academic Year</label>
                <input 
                  type="number"
                  className="w-full h-12 px-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:border-emerald-500 outline-none transition-all"
                  value={metadata.attendance_year}
                  onChange={e => setMetadata({...metadata, attendance_year: e.target.value})}
                  placeholder="e.g., 2024"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Examination Heading</label>
                <input 
                  className="w-full h-12 px-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:border-emerald-500 outline-none transition-all"
                  value={metadata.attendance_exam_heading}
                  onChange={e => setMetadata({...metadata, attendance_exam_heading: e.target.value})}
                  placeholder="e.g., SESSIONAL EXAMINATION"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Banner Image Path (Optional)</label>
                <input 
                  className="w-full h-12 px-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:border-emerald-500 outline-none transition-all"
                  value={metadata.attendance_banner_path}
                  onChange={e => setMetadata({...metadata, attendance_banner_path: e.target.value})}
                  placeholder="Path to banner image"
                />
              </div>
            </div>
          </div>

          {/* Course Details */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 border-2 border-gray-100 dark:border-gray-700 shadow-xl">
            <h2 className="text-xs font-black text-orange-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <BookOpen size={16}/> Course Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Course Name</label>
                <input 
                  placeholder="e.g., Data Structures"
                  className="w-full h-12 px-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:border-orange-500 outline-none transition-all"
                  value={metadata.course_name}
                  onChange={e => setMetadata({...metadata, course_name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Course Code</label>
                <input 
                  placeholder="e.g., CS-201"
                  className="w-full h-12 px-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:border-orange-500 outline-none transition-all"
                  value={metadata.course_code}
                  onChange={e => setMetadata({...metadata, course_code: e.target.value})}
                />
              </div>
            </div>
          </div>

          {/* Generate Zip Button */}
          <button
            onClick={handleZipHierarchy}
            disabled={actionLoading === 'zip-hierarchy'}
            className="w-full py-4 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-purple-500/25"
          >
            {actionLoading === 'zip-hierarchy' ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <FolderArchive size={20} />
            )}
            {actionLoading === 'zip-hierarchy' ? 'Generating ZIP...' : 'Generate & Download Zip Hierarchy'}
          </button>
        </div>
      </div>
    );
  }

  // ── Normal Attendance Control Mode ──────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#050505] py-12 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-8">
          <div>
            <h1 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tighter flex items-center gap-3">
              <UserCheck className="text-orange-500" size={36} />
              Attendance Control
            </h1>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <p className="text-gray-500 font-medium">
                Plan: <span className="text-orange-500 font-bold">{planId}</span>
              </p>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <p className="text-gray-500 font-medium">
                Room: <span className="text-emerald-500 font-bold">{roomName}</span>
              </p>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <p className="text-gray-500 font-medium">
                Students: <span className="text-blue-500 font-bold">{totalStudents}</span>
                {roomCapacity > 0 && (
                  <span className="text-gray-400"> / {roomCapacity} capacity</span>
                )}
              </p>
            </div>
          </div>
          <button 
            onClick={() => {
              if (source === 'plan-viewer') {
                navigate(`/plan-viewer/${planId}`);
              } else if (source === 'create-plan') {
                navigate('/create-plan');
              } else {
                navigate('/allocation');
              }
            }}
            className="text-sm font-bold text-gray-500 hover:text-orange-500 transition-colors flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            {source === 'plan-viewer' ? 'Back to Plan Viewer' : 
             source === 'create-plan' ? 'Back to Create Plan' : 'Back to Allocation'}
          </button>
        </div>

        {/* Room Selector (if multiple rooms) */}
        {allRooms.length > 1 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border-2 border-gray-100 dark:border-gray-700">
            <h2 className="text-xs font-black text-orange-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <Building2 size={16}/> Select Room
            </h2>
            <div className="flex flex-wrap gap-3">
              {allRooms.map((room) => {
                // ✅ FIXED: Calculate actual student count per room
                const roomBatches = roomsData[room]?.batches || {};
                const roomStudentCount = Object.values(roomBatches).reduce(
                  (sum, batch) => sum + (batch?.students?.length || 0), 0
                );
                
                return (
                  <button
                    key={room}
                    onClick={() => switchRoom(room)}
                    className={`px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                      room === roomName
                        ? 'bg-orange-500 text-white shadow-lg'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-orange-100 dark:hover:bg-orange-900/30'
                    }`}
                  >
                    {room}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      room === roomName
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                    }`}>
                      {roomStudentCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Attendance Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 border-2 border-gray-100 dark:border-gray-700 shadow-xl">
          <h2 className="text-xs font-black text-emerald-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
            <UserCheck size={16}/> Attendance Sheet Configuration
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Department Name</label>
              <input 
                className="w-full h-12 px-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:border-emerald-500 outline-none transition-all"
                value={metadata.attendance_dept_name}
                onChange={e => setMetadata({...metadata, attendance_dept_name: e.target.value})}
                placeholder="e.g., Computer Science and Engineering"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Academic Year</label>
              <input 
                type="number"
                className="w-full h-12 px-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:border-emerald-500 outline-none transition-all"
                value={metadata.attendance_year}
                onChange={e => setMetadata({...metadata, attendance_year: e.target.value})}
                placeholder="e.g., 2024"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Examination Heading</label>
              <input 
                className="w-full h-12 px-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:border-emerald-500 outline-none transition-all"
                value={metadata.attendance_exam_heading}
                onChange={e => setMetadata({...metadata, attendance_exam_heading: e.target.value})}
                placeholder="e.g., SESSIONAL EXAMINATION"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Banner Image Path (Optional)</label>
              <input 
                className="w-full h-12 px-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:border-emerald-500 outline-none transition-all"
                value={metadata.attendance_banner_path}
                onChange={e => setMetadata({...metadata, attendance_banner_path: e.target.value})}
                placeholder="Path to banner image"
              />
            </div>
          </div>
        </div>

        {/* Course Details */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 border-2 border-gray-100 dark:border-gray-700 shadow-xl">
          <h2 className="text-xs font-black text-orange-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
            <BookOpen size={16}/> Course Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Course Name *</label>
              <input 
                placeholder="e.g., Computer Science"
                className="w-full h-12 px-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:border-orange-500 outline-none transition-all"
                value={metadata.course_name}
                onChange={e => setMetadata({...metadata, course_name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Course Code *</label>
              <input 
                placeholder="e.g., CS-101"
                className="w-full h-12 px-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white focus:border-orange-500 outline-none transition-all"
                value={metadata.course_code}
                onChange={e => setMetadata({...metadata, course_code: e.target.value})}
              />
            </div>
          </div>

        </div>

        {/* ─── Attendance with Debarred ───────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl border-2 border-orange-200 dark:border-orange-900/40 shadow-xl overflow-hidden">
          {/* Collapsible header */}
          <button
            onClick={() => setDebarredExpanded(!debarredExpanded)}
            className="w-full px-8 py-5 flex items-center justify-between hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Archive className="text-orange-500" size={20} />
              <span className="text-sm font-black text-orange-600 dark:text-orange-400 uppercase tracking-[0.18em]">
                Attendance with Debarred
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                New
              </span>
            </div>
            <ChevronDown
              size={18}
              className={`text-orange-400 transition-transform ${debarredExpanded ? 'rotate-180' : ''}`}
            />
          </button>

          {debarredExpanded && (
            <div className="px-8 pb-8 space-y-6 border-t border-orange-100 dark:border-orange-900/30 pt-6">

              {/* Info banner */}
              <div className="rounded-l-2xl border border-orange-200 dark:border-orange-900/50 overflow-hidden bg-orange-50 dark:bg-orange-900/20">
                <div className="flex flex-col md:flex-row md:items-stretch gap-0">

                  {/* LEFT: bullet info */}
                  <div className="flex-1 px-5 py-5 text-sm text-orange-700 dark:text-orange-300 space-y-3 min-w-0">
                    <p className="font-black text-[11px] uppercase tracking-[0.18em] text-orange-500">How it works</p>
                    <ul className="list-disc ml-4 space-y-1.5 text-xs font-medium leading-relaxed">
                      <li>Upload one <b>CSV / XLSX</b> debarred-list file per batch — all optional.</li>
                      <li>System <b>auto-detects</b> batch by matching enrollment numbers.</li>
                      <li>
                        <b>{Object.keys(batchGroups).length} batch{Object.keys(batchGroups).length !== 1 ? 'es' : ''}</b> in this plan
                        {Object.keys(batchGroups).length > 0 && <> — upload up to <b>{Object.keys(batchGroups).length}</b> file{Object.keys(batchGroups).length !== 1 ? 's' : ''}.</>}
                      </li>
                      <li>N subjects in a file → <b>N separate PDFs</b> for that batch.</li>
                      <li>Unmatched batches get a <b>normal attendance PDF</b>.</li>
                      <li>All PDFs bundled into a single <b>.zip</b> download.</li>
                    </ul>

                  </div>

                  {/* RIGHT: Auto image slider */}
                  <div
                    className="relative flex-shrink-0 md:border-l-0 border-t-0 overflow-hidden"
                    style={{ width: '55%', minWidth: '260px' }}
                  >
                    <AnimatePresence mode="wait">
                      <motion.img
                        key={debarredSlide}
                        src={FORMAT_SLIDES[debarredSlide].src}
                        alt={FORMAT_SLIDES[debarredSlide].label}
                        className="w-full h-auto select-none block"
                        draggable={false}
                        style={{
                          maskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.3) 35%, rgba(0,0,0,0.7) 60%, black 88%)',
                          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.3) 35%, rgba(0,0,0,0.7) 60%, black 88%)',
                        }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.6, ease: 'easeInOut' }}
                        onError={e => { e.currentTarget.style.opacity = '0'; }}
                      />
                    </AnimatePresence>



                    {/* Dot indicators */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5 z-20">
                      {FORMAT_SLIDES.map((_, i) => (
                        <span
                          key={i}
                          className={`block w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                            i === debarredSlide
                              ? 'bg-orange-500 scale-125'
                              : 'bg-orange-300 dark:bg-orange-700 opacity-60'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                </div>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDebarredDragging(true); }}
                onDragLeave={() => setDebarredDragging(false)}
                onDrop={handleDebarredDrop}
                className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                  debarredDragging
                    ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-orange-300 dark:hover:border-orange-700'
                }`}
                onClick={() => document.getElementById('debarred-file-input').click()}
              >
                <input
                  id="debarred-file-input"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  multiple
                  className="hidden"
                  onChange={e => { if (e.target.files.length) addDebarredFiles(e.target.files); e.target.value = ''; }}
                />
                <UploadCloud
                  size={36}
                  className={`mx-auto mb-3 transition-colors ${
                    debarredDragging ? 'text-orange-500' : 'text-gray-300 dark:text-gray-600'
                  }`}
                />
                <p className="font-bold text-sm text-gray-500 dark:text-gray-400">
                  {debarredDragging ? 'Drop files here…' : 'Drag & drop debarred list files, or click to browse'}
                </p>
                <p className="text-xs text-gray-400 mt-1">CSV or Excel (.xlsx) • multiple files allowed</p>
              </div>

              {/* Uploaded files list */}
              {debarredFiles.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                    Uploaded Files ({debarredFiles.length})
                  </h3>
                  {debarredFiles.map(item => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                    >
                      {/* Status icon */}
                      <div className="mt-0.5 flex-shrink-0">
                        {item.status === 'analyzing' && <Loader2 className="animate-spin text-orange-400" size={18} />}
                        {item.status === 'done' && item.detected_batch && <CheckCircle className="text-emerald-500" size={18} />}
                        {item.status === 'done' && !item.detected_batch && <AlertCircle className="text-amber-500" size={18} />}
                        {item.status === 'error' && <AlertCircle className="text-red-500" size={18} />}
                        {item.status === 'pending' && <FileText className="text-gray-400" size={18} />}
                      </div>

                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold dark:text-white truncate">{item.filename}</p>
                        {item.status === 'analyzing' && (
                          <p className="text-xs text-gray-400 mt-0.5">Analysing…</p>
                        )}
                        {item.status === 'done' && item.detected_batch && (
                          <div className="mt-1 space-y-1">
                            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              Batch detected: <strong>{item.detected_batch}</strong>
                              {item.batch_total ? ` (${item.batch_total} students)` : ''}
                            </p>
                            {item.subjects.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.subjects.map(s => (
                                  <span
                                    key={s.code}
                                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400"
                                  >
                                    {s.code} — {s.debarred_count} debarred
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {item.status === 'done' && !item.detected_batch && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                            ⚠ Could not match this file to any batch. It will still be sent but may be ignored.
                          </p>
                        )}
                        {item.status === 'error' && (
                          <p className="text-xs text-red-500 mt-0.5">{item.error}</p>
                        )}
                      </div>

                      {/* Remove button */}
                      <button
                        onClick={() => removeDebarredFile(item.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Batch coverage summary */}
              {debarredFiles.length > 0 && Object.keys(batchGroups).length > 0 && (() => {
                const coveredBatches = new Set(debarredFiles.map(f => f.detected_batch).filter(Boolean));
                return (
                  <div className="rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900">
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                        Batch Coverage
                      </h3>
                    </div>
                    <div className="divide-y dark:divide-gray-700">
                      {Object.entries(batchGroups).map(([label, data]) => {
                        const hasList = coveredBatches.has(label);
                        const matchFile = debarredFiles.find(f => f.detected_batch === label);
                        return (
                          <div key={label} className="flex items-center justify-between px-4 py-3">
                            <div>
                              <span className="text-sm font-bold dark:text-white">{label}</span>
                              <span className="ml-2 text-xs text-gray-400">{data?.students?.length || 0} students</span>
                            </div>
                            {hasList ? (
                              <div className="text-right">
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle size={12} /> Debarred list uploaded
                                </span>
                                {matchFile && matchFile.subjects.length > 0 && (
                                  <p className="text-[10px] text-gray-400 mt-0.5">
                                    {matchFile.subjects.length} subject PDF{matchFile.subjects.length > 1 ? 's' : ''} will be generated
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic">Normal attendance PDF</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Generate ZIP button */}
              <button
                onClick={handleDebarredDownload}
                disabled={debarredLoading || !metadata.course_name || !metadata.course_code}
                className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {debarredLoading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <Archive size={20} />
                )}
                {debarredLoading
                  ? 'Generating ZIP…'
                  : `Generate & Download Attendance ZIP (${Object.keys(batchGroups).length} batch${Object.keys(batchGroups).length !== 1 ? 'es' : ''})`
                }
              </button>
            </div>
          )}
        </div>

        {/* Download All Button */}
        {Object.keys(batchGroups).length > 0 && (
          <button
            onClick={handleDownloadRoom}
            disabled={actionLoading === 'room' || !metadata.course_name || !metadata.course_code}
            className="w-full py-4 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {actionLoading === 'room' ? (
              <Loader2 className="animate-spin" size={20}/>
            ) : (
              <FileDown size={20}/>
            )}
            Download Complete Attendance for {roomName} ({totalStudents} students)
          </button>
        )}

        {/* Batch List */}
        <div className="space-y-4">
          <h2 className="text-xs font-black text-orange-500 uppercase tracking-[0.2em] ml-1">Step 2: Export by Batch</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(batchGroups).length > 0 ? (
              Object.entries(batchGroups).map(([label, data]) => {
                // ✅ FIXED: Get actual student count from data
                const studentCount = data?.students?.length || 0;
                
                return (
                  <motion.div 
                    key={label}
                    whileHover={{ y: -5 }}
                    className="bg-white dark:bg-gray-800 rounded-3xl border-2 border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm transition-all"
                  >
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <span className="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full text-[10px] font-black uppercase tracking-wider">
                            {data?.info?.degree || "N/A"}
                          </span>
                          <h3 className="text-xl font-black dark:text-white mt-2">{label}</h3>
                        </div>
                        <button 
                          onClick={() => handlePreview(label)} 
                          className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                          title="Preview students"
                        >
                          <Eye size={20} />
                        </button>
                      </div>
                      
                      <div className="space-y-1 mb-6">
                        <p className="text-xs text-gray-500 font-medium italic">
                          {data?.info?.branch || "General"}
                        </p>
                        {/* ✅ FIXED: Display actual student count */}
                        <div className="flex items-center gap-2">
                          <Users size={14} className="text-blue-500" />
                          <p className="text-sm font-bold dark:text-gray-300">
                            {studentCount} Students
                          </p>
                        </div>
                      </div>

                      <button 
                        onClick={() => handleDownloadSingle(label)}
                        disabled={actionLoading === label || !metadata.course_name || !metadata.course_code}
                        className="w-full py-4 bg-gray-900 dark:bg-orange-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-orange-500 dark:hover:bg-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === label ? (
                          <Loader2 className="animate-spin" size={16}/>
                        ) : (
                          <FileDown size={16}/>
                        )}
                        Download PDF
                      </button>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="col-span-full py-12 text-center bg-gray-100 dark:bg-gray-900 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800">
                <p className="text-gray-400 font-bold uppercase tracking-widest">No batches found for this room</p>
                <p className="text-gray-400 text-sm mt-2">Try selecting a different room above</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewData && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
                <div>
                  <h3 className="font-black dark:text-white uppercase">{previewData.label}</h3>
                  <p className="text-sm text-gray-500">{previewData.students.length} students</p>
                </div>
                <button 
                  onClick={() => setPreviewData(null)} 
                  className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-all"
                >
                  <X size={20} className="dark:text-white"/>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black text-gray-400 uppercase border-b dark:border-gray-700">
                      <th className="pb-3 px-2">#</th>
                      <th className="pb-3">Enrollment</th>
                      <th className="pb-3">Student Name</th>
                      <th className="pb-3 text-right">Set</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {(previewData.students || []).map((s, i) => (
                      <tr key={i} className="text-sm dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="py-3 px-2 text-gray-400">{i + 1}</td>
                        <td className="py-3 font-mono font-bold text-orange-500">
                          {s.roll_number || s.enrollment || s.enrollment_no || 'N/A'}
                        </td>
                        <td className="py-3 font-medium">
                          {s.student_name || s.name || 'N/A'}
                        </td>
                        <td className="py-3 text-right font-black text-gray-400">
                          {s.paper_set || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #f97316; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default AttendancePage;
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getToken } from '../utils/tokenStorage';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, Download, Layout, AlertTriangle, CheckCircle, 
  User, RefreshCw, ChevronLeft, Grid, Box, Maximize2
} from 'lucide-react';

const initialFormState = {
    rows: 8,
    cols: 10,
    numBatches: 3,
    brokenSeatsStr: '',
    batchStudentCountsStr: '1:30, 2:30, 3:30',
    startRollsStr: '', // If empty, defaults are used in the backend/logic
    startSerials: { 1: 1, 2: 101, 3: 201 },
    blockWidth: 3,
    fillByColumn: true,
    enforceAdj: false,
    batchNamesStr: '1:CS, 2:IT, 3:ME',
    roomNo: '101',
};

const getContrastTextColor = (hexcolor) => {
    if (!hexcolor || hexcolor.length !== 7) return 'text-black';
    const r = parseInt(hexcolor.slice(1, 3), 16);
    const g = parseInt(hexcolor.slice(3, 5), 16);
    const b = parseInt(hexcolor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? 'text-black' : 'text-white';
};

const ManualAllocation = ({ showToast }) => {
    const navigate = useNavigate();
    const [form, setForm] = useState(initialFormState);
    const [seatingData, setSeatingData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isPdfGenerating, setIsPdfGenerating] = useState(false);
    const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);

    // --- Dynamic Start Serial Logic ---
    useEffect(() => {
        const serials = {};
        for (let i = 1; i <= form.numBatches; i++) {
            serials[i] = (i - 1) * 100 + 1;
        }
        setForm(prev => ({ ...prev, startSerials: serials }));
    }, [form.numBatches]);

    const handleInputChange = (e) => {
        const { id, value, type, checked } = e.target;
        setForm(prev => ({
            ...prev,
            [id]: type === 'checkbox' ? checked : (type === 'number' ? parseInt(value) || '' : value)
        }));
    };

    const handleStartSerialChange = (idx, value) => {
        setForm(prev => ({
            ...prev,
            startSerials: { ...prev.startSerials, [idx]: parseInt(value) || 1 }
        }));
    };

    const generateSeating = useCallback(async () => {
        setError(null);
        setIsLoading(true);
        
        const startSerialsApiStr = Object.entries(form.startSerials)
            .map(([idx, serial]) => `${idx}:${serial}`).join(',');

        // LOGIC: If startRollsStr is empty, use empty string to let backend generate sequentially
        // The backend will use start_serials to generate roll numbers for each batch
        const finalStartRolls = form.startRollsStr.trim();

        const payload = {
            rows: form.rows,
            cols: form.cols,
            num_batches: form.numBatches,
            block_width: form.blockWidth,
            batch_by_column: form.fillByColumn,
            enforce_no_adjacent_batches: form.enforceAdj,
            broken_seats: form.brokenSeatsStr,
            batch_student_counts: form.batchStudentCountsStr,
            start_rolls: finalStartRolls,
            start_serials: startSerialsApiStr,
            batch_names: form.batchNamesStr,
            room_no: form.roomNo,
        };
        
        try {
            const token = getToken();
            const response = await fetch('/api/manual-generate-seating', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` })
                },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            setSeatingData(data);
            if(showToast) showToast("Seating Generated Successfully", "success");
        } catch (err) {
            setError(err.message);
            if(showToast) showToast(err.message, "error");
        } finally {
            setIsLoading(false);
        }
    }, [form, showToast]);

    const handleDownloadPdf = async () => {
        setIsPdfGenerating(true);
        try {
            const token = getToken();
            const response = await fetch('api/generate-pdf', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` })
                },
                body: JSON.stringify(seatingData)
            });
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `manual_plan_${Date.now()}.pdf`;
            a.click();
        } catch (err) {
            if(showToast) showToast("PDF Generation Failed", "error");
        } finally {
            setIsPdfGenerating(false);
        }
    };

    // --- STYLING CONSTANTS ---
    const inputStyle = "w-full h-12 px-4 rounded-xl border-2 border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:border-orange-500 outline-none transition-all font-bold text-sm placeholder:text-gray-500 dark:placeholder:text-gray-400";
    const labelStyle = "text-[11px] font-black uppercase tracking-widest text-gray-900 dark:text-white mb-2 block ml-1";
    const sectionHeading = "text-sm font-black text-orange-500 uppercase tracking-[0.3em] mb-8 flex items-center gap-2";

    return (
        <div className="min-h-screen bg-white dark:bg-[#050505] text-gray-900 dark:text-white pb-20">
            <div className="max-w-[1800px] mx-auto px-6 pt-12">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                    <div>
                        <Link to="/create-plan" className="flex items-center gap-2 text-gray-400 hover:text-orange-500 transition-colors mb-4 group">
                            <ChevronLeft size={18} />
                            <span className="text-xs font-black uppercase tracking-widest">Back to Planner</span>
                        </Link>
                        <h1 className="text-5xl font-black tracking-tighter uppercase">
                            Manual <span className="text-orange-500">Allocation</span>
                        </h1>
                    </div>
                    <button 
                        onClick={generateSeating} 
                        disabled={isLoading}
                        aria-label={isLoading ? "Generating seating plan" : "Generate seating plan"}
                        className="h-14 px-10 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-2 transition-all shadow-lg disabled:opacity-50"
                    >
                        {isLoading ? <RefreshCw className="animate-spin" /> : <Layout size={20} />}
                        Generate Plan
                    </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                    {/* SIDEBAR */}
                    <div className="xl:col-span-3 space-y-6">
                        <div className="p-6 rounded-3xl bg-gray-50 dark:bg-white/5 border-2 border-gray-100 dark:border-gray-800">
                            <h2 className={sectionHeading}><Grid size={16} /> Grid Geometry</h2>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div><label htmlFor="rows" className={labelStyle}>Rows</label><input type="number" id="rows" value={form.rows} onChange={handleInputChange} className={inputStyle} /></div>
                                <div><label htmlFor="cols" className={labelStyle}>Columns</label><input type="number" id="cols" value={form.cols} onChange={handleInputChange} className={inputStyle} /></div>
                            </div>
                            <div className="mb-4">
                                <label htmlFor="numBatches" className={labelStyle}>Number of Batches</label>
                                <input type="number" id="numBatches" value={form.numBatches} onChange={handleInputChange} className={inputStyle} />
                            </div>
                            <label htmlFor="blockWidth" className={labelStyle}>Block Width</label>
                            <input type="number" id="blockWidth" value={form.blockWidth} onChange={handleInputChange} className={inputStyle} />
                        </div>

                        <div className="p-6 rounded-3xl bg-gray-50 dark:bg-white/5 border-2 border-gray-100 dark:border-gray-800">
                            <h2 className={sectionHeading}><Box size={16} /> Batch Serials</h2>
                            <div className="grid grid-cols-2 gap-3">
                                {Object.entries(form.startSerials).slice(0, form.numBatches).map(([idx, val]) => (
                                    <div key={idx} className="p-3 rounded-xl bg-white dark:bg-black/40 border border-gray-200 dark:border-gray-800">
                                        <label htmlFor={`batchSerial${idx}`} className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 block">Batch {idx} Serial</label>
                                        <input 
                                            type="number" 
                                            id={`batchSerial${idx}`}
                                            value={val} 
                                            onChange={(e) => handleStartSerialChange(idx, e.target.value)} 
                                            className="w-full bg-transparent font-black text-orange-500 outline-none"
                                            aria-label={`Starting serial number for batch ${idx}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* MAIN CONTENT */}
                    <div className="xl:col-span-9 space-y-8">
                        <div className="p-8 rounded-3xl bg-gray-50 dark:bg-white/5 border-2 border-gray-100 dark:border-gray-800 shadow-sm">
                            <h2 className={sectionHeading}><User size={16} /> Batch Enrollment Details</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label htmlFor="batchNamesStr" className={labelStyle}>Batch Names</label>
                                    <input type="text" id="batchNamesStr" value={form.batchNamesStr} onChange={handleInputChange} className={inputStyle} placeholder="1:CS, 2:IT, 3:ME" />
                                </div>
                                <div>
                                    <label htmlFor="roomNo" className={labelStyle}>Room Number</label>
                                    <input type="text" id="roomNo" value={form.roomNo} onChange={handleInputChange} className={inputStyle} placeholder="101" />
                                </div>
                                <div className="md:col-span-2">
                                    <label htmlFor="startRollsStr" className={labelStyle}>Batch Start Roll Numbers (Overrides)</label>
                                    <input 
                                        type="text" id="startRollsStr" value={form.startRollsStr} onChange={handleInputChange} className={inputStyle} 
                                        placeholder="Optional (e.g. 1:BTCS001, 2:BTCS500). Leave blank for auto-generation." 
                                        aria-describedby="startRollsHelp"
                                    />
                                    <p id="startRollsHelp" className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave blank to auto-generate roll numbers sequentially</p>
                                </div>
                                <div className="md:col-span-2">
                                    <label htmlFor="batchStudentCountsStr" className={labelStyle}>Student Counts Per Batch</label>
                                    <input type="text" id="batchStudentCountsStr" value={form.batchStudentCountsStr} onChange={handleInputChange} className={inputStyle} placeholder="1:30, 2:25..." />
                                </div>
                                <div className="md:col-span-2">
                                    <label htmlFor="brokenSeatsStr" className={labelStyle}>Broken Seats (Optional)</label>
                                    <input type="text" id="brokenSeatsStr" value={form.brokenSeatsStr} onChange={handleInputChange} className={inputStyle} placeholder="e.g., 1,2,15,20 (seat positions to mark as broken)" />
                                </div>
                            </div>
                            
                            {/* Constraint Toggles */}
                            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-gray-900 dark:text-white mb-4">Seating Constraints</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <label className="flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-all cursor-pointer group">
                                        <input 
                                            type="checkbox" 
                                            id="fillByColumn" 
                                            checked={form.fillByColumn} 
                                            onChange={handleInputChange}
                                            className="w-5 h-5 rounded border-2 border-gray-300 dark:border-gray-600 accent-orange-500 cursor-pointer"
                                            aria-label="Fill seating by column instead of by row"
                                        />
                                        <div className="flex-1">
                                            <span className="font-bold text-gray-900 dark:text-white block">Fill by Column</span>
                                            <span className="text-xs text-gray-600 dark:text-gray-400">Prefer column-wise seating arrangement</span>
                                        </div>
                                    </label>
                                    
                                    <label className="flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-all cursor-pointer group">
                                        <input 
                                            type="checkbox" 
                                            id="enforceAdj" 
                                            checked={form.enforceAdj} 
                                            onChange={handleInputChange}
                                            className="w-5 h-5 rounded border-2 border-gray-300 dark:border-gray-600 accent-orange-500 cursor-pointer"
                                            aria-label="Prevent students from same batch sitting adjacent to each other"
                                        />
                                        <div className="flex-1">
                                            <span className="font-bold text-gray-900 dark:text-white block">No Adjacent Batches</span>
                                            <span className="text-xs text-gray-600 dark:text-gray-400">Prevent same batch from sitting next to each other</span>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* FULL SCREEN PREVIEW */}
                        <div className="p-8 rounded-3xl bg-white dark:bg-white/5 border-2 border-gray-100 dark:border-gray-800 shadow-2xl min-h-[600px]">
                            <div className="flex justify-between items-center mb-8">
                                <h2 className={sectionHeading}><Maximize2 size={16} /> Visual Arrangement</h2>
                                <div className="flex items-center gap-4">
                                    {seatingData && (
                                        <>
                                            <button 
                                                onClick={() => setIsFullscreenPreview(true)} 
                                                aria-label="View seating arrangement in fullscreen"
                                                className="flex items-center gap-2 text-xs font-black uppercase text-orange-500 hover:scale-105 transition-all"
                                            >
                                                <Maximize2 size={16} /> Fullscreen
                                            </button>
                                            <button 
                                                onClick={handleDownloadPdf}
                                                disabled={isPdfGenerating}
                                                aria-label={isPdfGenerating ? "Generating PDF" : "Export seating plan as PDF"}
                                                className="flex items-center gap-2 text-xs font-black uppercase text-orange-500 hover:scale-105 transition-all disabled:opacity-50"
                                            >
                                                <Download size={16} /> Export PDF
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <AnimatePresence mode="wait">
                                {seatingData ? (
                                    <motion.div initial={{opacity:0}} animate={{opacity:1}} className="overflow-x-auto pb-6 custom-scrollbar">
                                        <div 
                                            className="grid gap-2 min-w-max" 
                                            role="grid"
                                            aria-label="Seating arrangement grid"
                                            aria-rowcount={seatingData.metadata.rows}
                                            aria-colcount={seatingData.metadata.cols}
                                            style={{ gridTemplateColumns: `repeat(${seatingData.metadata.cols}, 120px)` }}
                                        >
                                            {seatingData.seating.map((row, rIdx) => (
                                                row.map((seat, cIdx) => {
                                                    const batchColor = seat.is_broken ? '#ef4444' : (seat.color || '#374151');
                                                    const seatLabel = seat.is_broken 
                                                        ? 'Broken'
                                                        : `Row ${rIdx + 1}, Column ${cIdx + 1}: ${seat.roll_number || 'Empty'} - Batch ${seat.batch}`;
                                                    
                                                    return (
                                                        <div 
                                                            key={`${rIdx}-${cIdx}`} 
                                                            role="gridcell"
                                                            aria-label={seatLabel}
                                                            aria-rowindex={rIdx + 1}
                                                            aria-colindex={cIdx + 1}
                                                            style={{ backgroundColor: batchColor }} 
                                                            className={`h-24 rounded-xl flex flex-col items-center justify-center p-2 text-center shadow-md border border-black/10 ${getContrastTextColor(batchColor)}`}
                                                        >
                                                            {seat.is_broken ? <span className="text-[10px] font-black italic opacity-60">BROKEN</span> : (
                                                                <>
                                                                    <span className="text-[9px] font-black opacity-60 uppercase">Batch {seat.batch}</span>
                                                                    <span className="text-[13px] font-black leading-tight truncate w-full">{seat.roll_number || 'EMPTY'}</span>
                                                                    <span className="text-[10px] font-bold text-inherit opacity-100 mt-1">Set: {seat.paper_set || '-'}</span>
                                                                    <span className="text-[8px] font-bold opacity-40 mt-1">{seat.position}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            ))}
                                        </div>
                                    </motion.div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-40 text-gray-400">
                                        <Layout size={60} strokeWidth={1} className="mb-4 opacity-10" />
                                        <p className="font-bold text-sm tracking-widest uppercase opacity-40">Configure grid and click generate</p>
                                    </div>
                                )}
                            </AnimatePresence>

                            {/* VALIDATION & SUMMARY BOX */}
                            {seatingData && (
                                <div className="mt-8 p-6 bg-green-500/10 border-2 border-green-500/20 rounded-2xl">
                                    <h3 className={`font-black text-xs uppercase mb-4 flex items-center gap-2 ${seatingData.validation.is_valid ? 'text-green-500' : 'text-red-500'}`}>
                                        {seatingData.validation.is_valid ? <CheckCircle size={16} /> : <AlertTriangle size={16} />} Validation & Summary
                                    </h3>
                                    
                                    {/* Summary */}
                                    <div className="mb-6">
                                        <h4 className="text-sm font-bold uppercase mb-3">Seating Summary</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {Object.entries(seatingData.summary.total_per_batch || {}).map(([batch, count]) => (
                                                <div key={batch} className="flex justify-between p-3 bg-white dark:bg-black/20 rounded-xl border border-green-500/30">
                                                    <span className="text-xs font-bold">Batch {batch}</span>
                                                    <span className="text-xs font-black text-green-500">{count} Seated</span>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-sm mt-4 text-gray-600 dark:text-gray-400">
                                            Total Seats: {seatingData.metadata.rows * seatingData.metadata.cols} | 
                                            Broken Seats: {seatingData.summary.broken_seats || 0}
                                        </p>
                                    </div>
                                    
                                    {/* Constraints Applied */}
                                    <div className="mb-6">
                                        <h4 className="text-sm font-bold uppercase mb-3 text-blue-500">Constraints Applied</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                            <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-700">
                                                <CheckCircle size={14} className="text-blue-500" />
                                                <span>Grid: {seatingData.metadata.rows} × {seatingData.metadata.cols}</span>
                                            </div>
                                            <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-700">
                                                <CheckCircle size={14} className="text-blue-500" />
                                                <span>Block Width: {seatingData.metadata.block_width || form.blockWidth}</span>
                                            </div>
                                            {form.fillByColumn && (
                                                <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-700">
                                                    <CheckCircle size={14} className="text-blue-500" />
                                                    <span>Fill by Column</span>
                                                </div>
                                            )}
                                            {form.enforceAdj && (
                                                <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-700">
                                                    <CheckCircle size={14} className="text-blue-500" />
                                                    <span>No Adjacent Same Batch</span>
                                                </div>
                                            )}
                                            {form.brokenSeatsStr && (
                                                <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-700">
                                                    <CheckCircle size={14} className="text-blue-500" />
                                                    <span>Broken Seats: {form.brokenSeatsStr}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Validation Errors */}
                                    {!seatingData.validation.is_valid && seatingData.validation.errors && seatingData.validation.errors.length > 0 && (
                                        <div className="mb-6">
                                            <h4 className="text-sm font-bold uppercase mb-3 text-red-500">Validation Violations</h4>
                                            <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
                                                {seatingData.validation.errors.map((error, idx) => (
                                                    <li key={idx}>{error}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    
                                    {/* Unallocated Students */}
                                    {Object.values(seatingData.summary.unallocated_per_batch || {}).some(count => count > 0) && (
                                        <div>
                                            <h4 className="text-sm font-bold uppercase mb-3 text-orange-500">Unallocated Students</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                {Object.entries(seatingData.summary.unallocated_per_batch).map(([batch, count]) => (
                                                    count > 0 && (
                                                        <div key={batch} className="flex justify-between p-3 bg-white dark:bg-black/20 rounded-xl border border-orange-500/30">
                                                            <span className="text-xs font-bold">Batch {batch}</span>
                                                            <span className="text-xs font-black text-orange-500">{count} Left Unseated</span>
                                                        </div>
                                                    )
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* FULLSCREEN PREVIEW MODAL */}
            <AnimatePresence>
                {isFullscreenPreview && (
                    <motion.div 
                        initial={{opacity: 0}} 
                        animate={{opacity: 1}} 
                        exit={{opacity: 0}}
                        className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4"
                    >
                        <div className="bg-white dark:bg-gray-900 rounded-2xl w-full h-full max-w-7xl max-h-[95vh] overflow-auto custom-scrollbar flex flex-col">
                            {/* Header */}
                            <div className="sticky top-0 flex justify-between items-center p-6 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-10">
                                <h3 className="text-lg font-black text-orange-500 uppercase tracking-widest">Seating Plan - Full View</h3>
                                <button 
                                    onClick={() => setIsFullscreenPreview(false)} 
                                    className="text-2xl text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-auto p-8 flex items-center justify-center">
                                {seatingData ? (
                                    <div className="overflow-auto">
                                        <div 
                                            className="grid gap-3 p-4 bg-gray-50 dark:bg-black/30 rounded-xl"
                                            style={{ gridTemplateColumns: `repeat(${seatingData.metadata.cols}, 140px)` }}
                                        >
                                            {seatingData.seating.map((row, rIdx) => (
                                                row.map((seat, cIdx) => {
                                                    const batchColor = seat.is_broken ? '#ef4444' : (seat.color || '#374151');
                                                    return (
                                                        <div key={`fs-${rIdx}-${cIdx}`} style={{ backgroundColor: batchColor }} className={`h-28 rounded-xl flex flex-col items-center justify-center p-3 text-center shadow-lg border-2 border-black/10 ${getContrastTextColor(batchColor)}`}>
                                                            {seat.is_broken ? <span className="text-[11px] font-black italic opacity-60">BROKEN</span> : (
                                                                <>
                                                                    <span className="text-[10px] font-black opacity-60 uppercase">Batch {seat.batch}</span>
                                                                    <span className="text-[16px] font-black leading-tight truncate w-full">{seat.roll_number || 'EMPTY'}</span>
                                                                    <span className="text-[11px] font-bold text-inherit opacity-100 mt-2">Set: {seat.paper_set || '-'}</span>
                                                                    <span className="text-[9px] font-bold opacity-40 mt-1">{seat.position}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ManualAllocation;
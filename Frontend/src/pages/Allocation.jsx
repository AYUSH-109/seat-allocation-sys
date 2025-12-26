import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { 
  Users, Layout, MapPin, Download, Play, 
  Settings, Monitor, Palette, Hash, Type, 
  Loader2, AlertCircle, RefreshCw, CheckCircle2,
  Database, ChevronRight, FileDown, Zap, Trash2
} from 'lucide-react';

// --- INLINE UI COMPONENTS ---
const Card = ({ className, children }) => <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}>{children}</div>;
const Button = ({ className, children, onClick, disabled, title, variant }) => {
    const base = "inline-flex items-center justify-center rounded-xl font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
    const bg = variant === "destructive" ? "bg-red-100 text-red-600 hover:bg-red-200" : className.includes('bg-') ? "" : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-white";
    return <button onClick={onClick} disabled={disabled} title={title} className={`${base} ${bg} ${className}`}>{children}</button>
};
const Input = (props) => <input {...props} className={`flex h-10 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white ${props.className}`} />;

const AllocationPage = ({ showToast }) => {
  // 1. DATA STATE
  const [classrooms, setClassrooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  
  // 2. CORE PARAMETERS (Auto-filled by room)
  const [rows, setRows] = useState(8);
  const [cols, setCols] = useState(10);
  const [blockWidth, setBlockWidth] = useState(2);
  const [brokenSeats, setBrokenSeats] = useState("");
  
  // 3. EXAM SESSION CONFIG (Manual)
  const [numBatches, setNumBatches] = useState(2);
  const [batchConfigs, setBatchConfigs] = useState([
    { id: 1, label: 'Batch A', startRoll: '101', color: '#3b82f6' },
    { id: 2, label: 'Batch B', startRoll: '201', color: '#ef4444' }
  ]);
  const [useDemoDb, setUseDemoDb] = useState(true);
  const [batchByColumn, setBatchByColumn] = useState(true);
  const [enforceNoAdjacentBatches, setEnforceNoAdjacentBatches] = useState(false);

  // 4. UI STATE
  const [loading, setLoading] = useState(false);
  const [webData, setWebData] = useState(null);
  const [error, setError] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const chartRef = useRef();

  // Load Registry
  useEffect(() => {
    fetch('http://localhost:5000/api/classrooms')
      .then(res => res.json())
      .then(data => setClassrooms(data))
      .catch(err => console.error(err));
  }, []);

  // Sync Batches
  useEffect(() => {
    const count = parseInt(numBatches) || 1;
    setBatchConfigs(prev => {
      const news = [...prev];
      if (count > prev.length) {
         const newBatches = [];
         for(let i = prev.length; i < count; i++) newBatches.push({ id: i+1, label: `Batch ${String.fromCharCode(65+i)}`, startRoll: `${(i+1)*100+1}`, color: '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6, '0') });
         return [...prev, ...newBatches];
      }
      return prev.slice(0, count);
    });
  }, [numBatches]);

  const handleRoomChange = (roomId) => {
    setSelectedRoomId(roomId);
    if (!roomId) return;
    const room = classrooms.find(r => r.id === parseInt(roomId));
    if (room) {
      setRows(room.rows); setCols(room.cols); setBrokenSeats(room.broken_seats || ""); setBlockWidth(room.block_width || 1);
      if(showToast) showToast(`Loaded ${room.name}`, "success");
    }
  };

  const updateBatch = (i, f, v) => {
    const u = [...batchConfigs]; u[i][f] = v; setBatchConfigs(u);
  };

  // --- LOGIC: PREPARE PAYLOAD ---
  const preparePayload = () => {
    const startRolls = {};
    const batchLabels = {};
    const batchColors = {};
    batchConfigs.forEach((b, i) => { startRolls[i+1] = b.startRoll; batchLabels[i+1] = b.label; batchColors[i+1] = b.color; });

    return {
      room_id: selectedRoomId,
      rows, cols, block_width: blockWidth, broken_seats: brokenSeats,
      num_batches: numBatches, batch_by_column: batchByColumn, enforce_no_adjacent_batches: enforceNoAdjacentBatches,
      use_demo_db: useDemoDb, start_rolls: startRolls, batch_labels: batchLabels, batch_colors: batchColors
    };
  };

  // --- LOGIC: GENERATE ---
  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("http://localhost:5000/api/generate-seating", { 
        method: "POST", headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(preparePayload()) 
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error);
      setWebData(data);
      setTimeout(() => chartRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) { if(showToast) showToast(e.message, "error"); } 
    finally { setLoading(false); }
  };

  // --- LOGIC: CONSTRAINTS ---
  const showConstraints = async () => {
    try {
        const res = await fetch("http://localhost:5000/api/constraints-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preparePayload()) });
        const data = await res.json();
        const body = data.constraints ? data.constraints.map(c => `${c.satisfied ? '✅' : '❌'} ${c.name}`).join("\n") : "No constraints data";
        alert(`Constraints:\n\n${body}`);
    } catch (e) { alert("Error checking constraints"); }
  };

  // --- LOGIC: RESET DB ---
  const handleResetDatabase = async () => {
    if (!window.confirm("⚠️ DANGER: Delete ALL student data?")) return;
    setResetting(true);
    try {
        const token = localStorage.getItem('token');
        const res = await fetch("http://localhost:5000/api/reset-data", { method: "POST", headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
        if (res.ok) { if (showToast) showToast("Database cleared", "success"); setWebData(null); }
    } catch (e) { alert(e.message); } finally { setResetting(false); }
  };

  // --- LOGIC: PDF DOWNLOAD (RESTORED FULLY) ---
  const downloadPdf = async (type) => {
    if(!webData) { if(showToast) showToast("Generate first", "error"); return; }
    setPdfLoading(true);
    
    if(type==='client') {
       // --- CLIENT SIDE (html2pdf) ---
       if(!window.html2pdf) { alert("html2pdf missing"); setPdfLoading(false); return; }
       
       const container = document.createElement("div");
       container.style.cssText = "width:1100px; padding:40px; background:#fff; color:#000; font-family:Arial,sans-serif;";
       
       const title = document.createElement("h1"); title.innerText = "Seating Plan"; title.style.textAlign = "center";
       container.appendChild(title);
       
       const info = document.createElement("div"); 
       info.innerText = `Room: ${classrooms.find(r=>r.id===parseInt(selectedRoomId))?.name || 'Manual'} | Date: ${new Date().toLocaleDateString()}`;
       info.style.textAlign = "center"; info.style.marginBottom = "20px";
       container.appendChild(info);
       
       const grid = document.createElement("div");
       grid.style.cssText = `display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:4px; border:2px solid #000; padding:10px;`;
       
       webData.seating.flat().forEach(seat => {
          const el = document.createElement("div");
          el.style.cssText = `border:1px solid #ccc; min-height:60px; display:flex; flex-direction:column; align-items:center; justify-content:center; background-color:${seat.color||'#fff'}; -webkit-print-color-adjust:exact;`;
          if (seat.is_broken) { el.style.backgroundColor="#fee2e2"; el.innerHTML = `<b style='color:red'>X</b>`; }
          else if (!seat.is_unallocated) { el.innerHTML = `<div style='font-weight:bold;font-size:12px'>${seat.roll_number}</div><div style='font-size:9px'>Set ${seat.paper_set}</div>`; }
          grid.appendChild(el);
       });
       
       container.appendChild(grid);
       container.style.position='fixed'; container.style.left='-10000px'; container.style.top='0';
       document.body.appendChild(container);
       
       const opt = { margin: 10, filename: `seating_${Date.now()}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } };
       
       setTimeout(() => {
           window.html2pdf().set(opt).from(container).save().then(() => { document.body.removeChild(container); setPdfLoading(false); });
       }, 500);

    } else {
       // --- SERVER SIDE (ReportLab) ---
       try {
         const payload = { ...preparePayload(), seating: webData.seating, metadata: webData.metadata };
         const res = await fetch('http://localhost:5000/api/generate-pdf', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
         if (!res.ok) throw new Error('Server failed');
         const blob = await res.blob();
         const url = window.URL.createObjectURL(blob);
         const a = document.createElement('a'); a.href = url; a.download = 'seating_hq.pdf'; a.click();
         window.URL.revokeObjectURL(url);
       } catch(e) { alert(e.message); } finally { setPdfLoading(false); }
    }
  };

  // Render Seat Helper
  const renderSeat = (seat, rIdx, cIdx) => (
    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: (rIdx*cols+cIdx)*0.002 }} key={`${rIdx}-${cIdx}`} 
      className={`aspect-square rounded-xl border flex flex-col items-center justify-center p-0.5 shadow-sm transition-all hover:scale-110 z-10 relative ${
        seat.is_broken ? 'bg-red-50 border-red-500 text-red-500' :
        seat.is_unallocated ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-300' :
        'bg-white dark:bg-gray-700 border-transparent text-white'
      }`}
      style={!seat.is_broken && !seat.is_unallocated ? { backgroundColor: seat.color } : {}}
      title={!seat.is_unallocated ? `Roll: ${seat.roll_number}` : 'Empty'}
    >
      {!seat.is_broken && !seat.is_unallocated && (
          <>
            <span className="text-[8px] font-bold uppercase opacity-80">{seat.batch_label || `B${seat.batch}`}</span>
            <span className="text-[10px] md:text-xs font-black mt-0.5">{seat.roll_number}</span>
          </>
      )}
      {seat.is_broken && <span className="text-xs font-black">X</span>}
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8 font-sans transition-colors">
      <div className="max-w-[1600px] mx-auto grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* CONFIG SIDEBAR */}
        <Card className="xl:col-span-4 h-full flex flex-col overflow-hidden bg-white dark:bg-gray-800">
           <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-b dark:border-gray-700">
             <h2 className="text-xl font-bold text-blue-900 dark:text-blue-100 flex items-center gap-2"><Zap size={20} className="text-amber-500"/> Allocation Cockpit</h2>
           </div>
           
           <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
              {/* Room Selection */}
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">1. Venue</label>
                <select value={selectedRoomId} onChange={e=>handleRoomChange(e.target.value)} className="w-full h-12 px-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg font-bold dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                   <option value="">-- Manual Config --</option>
                   {classrooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                {selectedRoomId && <div className="mt-2 flex gap-2 text-xs font-mono text-gray-500"><span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{rows}x{cols}</span><span className="bg-red-50 dark:bg-red-900/20 text-red-500 px-2 py-1 rounded">{brokenSeats.split(',').filter(Boolean).length} Broken</span></div>}
              </div>

              {/* Batch Configuration */}
              <div>
                <div className="flex justify-between items-center mb-3">
                   <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">2. Batches</label>
                   <input type="number" value={numBatches} onChange={e=>setNumBatches(Math.max(1, parseInt(e.target.value)||1))} className="w-12 h-8 text-center border rounded bg-gray-50 dark:bg-gray-700 dark:text-white font-bold" />
                </div>
                <div className="space-y-2">
                   {batchConfigs.map((b, i) => (
                     <div key={b.id} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                        <div className="flex gap-2">
                          <input value={b.label} onChange={e=>updateBatch(i,'label',e.target.value)} className="flex-1 h-8 px-2 text-xs border rounded bg-white dark:bg-gray-800 dark:text-white font-bold" placeholder="Label" />
                          <input type="color" value={b.color} onChange={e=>updateBatch(i,'color',e.target.value)} className="w-8 h-8 p-0 border-0 rounded cursor-pointer" />
                        </div>
                        <div className="flex items-center gap-2">
                           <Hash size={12} className="text-gray-400"/>
                           <input value={b.startRoll} onChange={e=>updateBatch(i,'startRoll',e.target.value)} className="flex-1 h-8 px-2 text-xs border rounded bg-white dark:bg-gray-800 dark:text-white font-mono" placeholder="Start Roll" />
                        </div>
                     </div>
                   ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-col gap-2 pt-4 border-t dark:border-gray-700">
                 <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase cursor-pointer"><input type="checkbox" checked={useDemoDb} onChange={e=>setUseDemoDb(e.target.checked)} className="rounded text-blue-600"/> Use Student DB</label>
                 <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase cursor-pointer"><input type="checkbox" checked={batchByColumn} onChange={e=>setBatchByColumn(e.target.checked)} className="rounded text-blue-600"/> Fill Columns</label>
                 <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase cursor-pointer"><input type="checkbox" checked={enforceNoAdjacentBatches} onChange={e=>setEnforceNoAdjacentBatches(e.target.checked)} className="rounded text-blue-600"/> Enforce Gap</label>
              </div>

              {/* Danger Zone */}
              <div className="pt-4 border-t dark:border-gray-700">
                <Button onClick={handleResetDatabase} variant="destructive" className="w-full h-10 text-xs uppercase" disabled={resetting}>
                  <Trash2 size={14} className="mr-2"/> {resetting ? 'Resetting...' : 'Reset All Data'}
                </Button>
              </div>
           </div>
           
           <div className="p-6 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <Button onClick={generate} disabled={loading} className="w-full h-12 bg-blue-600 text-white hover:bg-blue-700 shadow-lg mb-2">
                {loading ? <Loader2 className="animate-spin mr-2"/> : <Play className="mr-2" size={16}/>} Generate Plan
              </Button>
           </div>
        </Card>

        {/* VISUALIZATION */}
        <Card className="xl:col-span-8 h-full bg-white dark:bg-gray-800 flex flex-col relative overflow-hidden p-6" ref={chartRef}>
           <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black dark:text-white uppercase tracking-tighter">Live Preview</h2>
              {webData && (
                <div className="flex gap-2">
                   <Button onClick={showConstraints} className="h-9 px-4 bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 text-xs font-bold">Rules</Button>
                   <div className="relative group">
                      <Button className="h-9 px-4 bg-green-600 text-white hover:bg-green-700 text-xs font-bold flex gap-2"><Download size={14}/> Export</Button>
                      <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 shadow-xl rounded-xl border border-gray-200 dark:border-gray-700 hidden group-hover:block z-50 p-2">
                        <button onClick={()=>downloadPdf('client')} className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-xs font-bold dark:text-white">Client PDF (Fast)</button>
                        <button onClick={()=>downloadPdf('server')} className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-xs font-bold dark:text-white">Server PDF (HQ)</button>
                      </div>
                   </div>
                </div>
              )}
           </div>
           
           {!webData ? (
             <div className="flex-1 flex flex-col items-center justify-center text-gray-300 dark:text-gray-600">
               <Layout size={64} className="mb-4 opacity-20"/>
               <p className="font-bold uppercase tracking-widest text-xs">Ready to Generate</p>
             </div>
           ) : (
             <div className="flex-1 overflow-auto p-4 custom-scrollbar" id="seat-map-grid">
               <div className="w-1/2 h-1 bg-gray-200 dark:bg-gray-700 mx-auto rounded-full mb-8 relative"><div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-black text-gray-400 uppercase tracking-[0.5em]">Board</div></div>
               <div className="grid gap-2 mx-auto" style={{ gridTemplateColumns: `repeat(${cols}, minmax(45px, 1fr))`, width: 'fit-content' }}>
                  {webData.seating.map((row, rIdx) => row.map((seat, cIdx) => renderSeat(seat, rIdx, cIdx)))}
               </div>
             </div>
           )}
        </Card>
      </div>
      <style>{`.custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; } .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; }`}</style>
    </div>
  );
};
export default AllocationPage;
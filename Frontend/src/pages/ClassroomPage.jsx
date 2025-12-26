import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Save, Trash2, LayoutGrid, AlertCircle, Monitor, X, CheckCircle2 } from "lucide-react";

// --- Styled Components (mimicking Shadcn UI) ---
const Card = ({ className, children }) => <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}>{children}</div>;
const Button = ({ className, variant = "primary", size = "default", children, onClick, disabled, title }) => {
  const base = "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
    secondary: "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600",
    destructive: "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
  };
  const sizes = { default: "h-9 px-4 py-2", icon: "h-9 w-9" };
  return <button className={`${base} ${variants[variant] || variants.primary} ${sizes[size]} ${className}`} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
};
const Input = (props) => <input {...props} className={`flex h-9 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 dark:text-white ${props.className}`} />;
const Label = ({ className, children }) => <label className={`text-xs uppercase font-bold tracking-widest text-gray-500 dark:text-gray-400 ${className}`}>{children}</label>;

export default function Classrooms({ showToast }) {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [loading, setLoading] = useState(false);

  // Active Editing State
  const [roomData, setRoomData] = useState({
    id: null, name: '', rows: 8, cols: 10, broken_seats: '', block_width: 2
  });

  // --- LOGIC: DATA FETCHING ---
  const fetchClassrooms = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:5000/api/classrooms');
      const data = await res.json();
      setClassrooms(data);
      // Sync state if editing
      if (selectedRoomId && selectedRoomId !== 'new') {
        const current = data.find(c => c.id === selectedRoomId);
        if (current) setRoomData(current);
      }
    } catch (err) {
      if (showToast) showToast("Failed to load registry", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchClassrooms(); }, []);

  // --- LOGIC: SELECTION ---
  const handleSelectRoom = (room) => {
    setSelectedRoomId(room.id);
    setRoomData({ ...room }); 
  };

  const handleCreateNew = () => {
    setSelectedRoomId('new');
    setRoomData({ id: null, name: 'New Classroom', rows: 8, cols: 10, broken_seats: '', block_width: 2 });
  };

  // --- LOGIC: INTERACTION ---
  const toggleSeat = (index) => {
    const r = Math.floor(index / roomData.cols) + 1;
    const c = (index % roomData.cols) + 1;
    const seatCoord = `${r}-${c}`;
    
    let brokenList = roomData.broken_seats ? roomData.broken_seats.split(',').map(s => s.trim()).filter(Boolean) : [];
    
    if (brokenList.includes(seatCoord)) {
      brokenList = brokenList.filter(s => s !== seatCoord);
    } else {
      brokenList.push(seatCoord);
    }
    setRoomData({ ...roomData, broken_seats: brokenList.join(', ') });
  };

  const handleSave = async () => {
    if (!roomData.name) return showToast("Room name required", "error");
    try {
      const res = await fetch('http://localhost:5000/api/classrooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roomData)
      });
      if (res.ok) {
        if (showToast) showToast(`Layout for ${roomData.name} saved`, "success");
        fetchClassrooms();
        if (selectedRoomId === 'new') setSelectedRoomId(null);
      } else {
        throw new Error("Save failed");
      }
    } catch (err) {
      if (showToast) showToast("Error saving classroom", "error");
    }
  };

  const handleDelete = async () => {
    if (!roomData.id || !window.confirm("Delete this classroom?")) return;
    try {
      await fetch(`http://localhost:5000/api/classrooms/${roomData.id}`, { method: 'DELETE' });
      if (showToast) showToast("Classroom deleted", "success");
      fetchClassrooms();
      setSelectedRoomId(null);
      setRoomData({ id: null, name: '', rows: 8, cols: 10, broken_seats: '', block_width: 2 });
    } catch (err) {
      if (showToast) showToast("Delete failed", "error");
    }
  };

  const brokenSeatsList = roomData.broken_seats ? roomData.broken_seats.split(',').map(s => s.trim()) : [];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35 }}
      className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-2rem)] p-6 font-sans bg-gray-50/50 dark:bg-gray-900/50"
    >
      {/* SIDEBAR */}
      <Card className="lg:col-span-4 h-full flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Registry</h2>
            <Button size="icon" variant="secondary" onClick={handleCreateNew}>
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          
          <div className="space-y-4">
            <Label>Select Room</Label>
            <div className="h-[calc(100vh-18rem)] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                {classrooms.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => handleSelectRoom(room)}
                    className={`
                      w-full text-left p-4 rounded-xl transition-all duration-200 border-2 relative
                      ${selectedRoomId === room.id 
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md" 
                        : "border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"}
                    `}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className={`font-bold ${selectedRoomId === room.id ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"}`}>
                        {room.name}
                      </span>
                      {room.broken_seats && room.broken_seats.length > 0 && (
                        <span className="flex items-center text-xs text-red-600 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          {room.broken_seats.split(',').length}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono flex gap-3">
                      <span>{room.rows} × {room.cols}</span>
                      <span>CAP: {room.rows * room.cols}</span>
                    </div>
                  </button>
                ))}
                {classrooms.length === 0 && !loading && (
                    <div className="text-center py-10 text-gray-400 text-sm italic">No classrooms found. Create one.</div>
                )}
            </div>
          </div>
        </div>
      </Card>

      {/* MAIN DESIGNER */}
      <Card className="lg:col-span-8 h-full flex flex-col relative overflow-hidden bg-white/50 dark:bg-gray-800/50 backdrop-blur-md">
        {!selectedRoomId ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground border-4 border-dashed border-gray-200 dark:border-gray-700 rounded-[2rem] m-8 bg-gray-50/50 dark:bg-gray-900/20">
            <LayoutGrid className="h-24 w-24 mb-4 opacity-20" />
            <p className="text-xl font-medium">Select a room to edit layout</p>
          </div>
        ) : (
          <div className="flex flex-col h-full">
             {/* Toolbar */}
             <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col md:flex-row gap-6 justify-between items-end">
                <div className="flex-1 w-full grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5"><Label>Name</Label><Input value={roomData.name} onChange={e => setRoomData({...roomData, name: e.target.value})} /></div>
                    <div className="space-y-1.5"><Label>Rows</Label><Input type="number" value={roomData.rows} onChange={e => setRoomData({...roomData, rows: parseInt(e.target.value)||1})} /></div>
                    <div className="space-y-1.5"><Label>Cols</Label><Input type="number" value={roomData.cols} onChange={e => setRoomData({...roomData, cols: parseInt(e.target.value)||1})} /></div>
                    <div className="space-y-1.5"><Label>Block Width</Label><Input type="number" value={roomData.block_width} onChange={e => setRoomData({...roomData, block_width: parseInt(e.target.value)||1})} /></div>
                </div>
                <div className="flex gap-2">
                    {roomData.id && (
                        <Button variant="destructive" size="icon" onClick={handleDelete} title="Delete Room"><Trash2 className="h-5 w-5" /></Button>
                    )}
                    <Button onClick={handleSave} className="min-w-[100px]"><Save className="h-4 w-4 mr-2" /> Save</Button>
                </div>
             </div>

             {/* Canvas */}
             <div className="flex-1 overflow-auto p-8 flex items-center justify-center bg-gray-50/50 dark:bg-gray-900/50">
                <div className="relative">
                    <div className="absolute -top-12 left-0 right-0 flex justify-center">
                        <div className="bg-white dark:bg-gray-700 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-300 flex items-center gap-2 border border-gray-200 dark:border-gray-600 shadow-sm">
                            <Monitor size={14}/> Front of Class
                        </div>
                    </div>

                    <div className="grid gap-2 transition-all duration-300" style={{ gridTemplateColumns: `repeat(${roomData.cols}, minmax(40px, 1fr))` }}>
                        {Array.from({ length: roomData.rows * roomData.cols }).map((_, idx) => {
                            const r = Math.floor(idx / roomData.cols) + 1;
                            const c = (idx % roomData.cols) + 1;
                            const isBroken = brokenSeatsList.includes(`${r}-${c}`);
                            return (
                                <motion.button
                                    key={idx}
                                    initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: idx * 0.002 }}
                                    onClick={() => toggleSeat(idx)} 
                                    className={`
                                        h-10 w-10 md:h-12 md:w-12 rounded-lg flex items-center justify-center text-xs font-bold transition-all duration-200 border-2
                                        ${isBroken 
                                            ? "bg-red-50 dark:bg-red-900/20 border-red-500 text-red-500 hover:bg-red-100" 
                                            : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 hover:border-blue-400 hover:text-blue-400 hover:-translate-y-1 hover:shadow-md"}
                                    `}
                                    title={`Row ${r}, Col ${c}`}
                                >
                                    {isBroken ? <X size={16}/> : <span>{r}-{c}</span>}
                                </motion.button>
                            );
                        })}
                    </div>
                </div>
             </div>
          </div>
        )}
      </Card>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; }
      `}</style>
    </motion.div>
  );
}
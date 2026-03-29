// frontend/src/pages/ClassroomPage.jsx
import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from '../contexts/AuthContext';
import { getToken } from '../utils/tokenStorage';
import SplitText from '../components/SplitText';
import { motion } from "framer-motion";
import { Plus, Save, Trash2, LayoutGrid, AlertCircle, Monitor, X, CheckCircle2, Building, Columns, Minus } from "lucide-react";

// Styled Components
const Card = ({ className, children }) => <div className={`glass-card ${className}`}>{children}</div>;

const Button = ({ className, variant = "primary", size = "default", children, onClick, disabled, title }) => {
  const base = "inline-flex items-center justify-center rounded-xl font-bold transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 hover:scale-105 active:scale-95";
  const variants = {
    primary: "bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-lg",
    secondary: "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600 border-2 border-gray-300 dark:border-gray-600",
    destructive: "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 border-2 border-red-200 dark:border-red-800",
    outline: "border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-orange-500 dark:hover:border-orange-400 shadow-sm"
  };
  const sizes = { default: "h-10 px-5 py-2", icon: "h-10 w-10" };
  return <button className={`${base} ${variants[variant] || variants.primary} ${sizes[size]} ${className}`} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
};

const Input = (props) => (
  <input 
    {...props} 
    className={`flex h-10 w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1 text-sm shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 dark:text-white placeholder:text-gray-400 ${props.className}`} 
  />
);

const Label = ({ className, children }) => (
  <label className={`text-xs uppercase font-bold tracking-widest text-gray-700 dark:text-gray-400 ${className}`}>
    {children}
  </label>
);

export default function ClassroomPage({ showToast }) {
  const { user } = useAuth();
  const [classrooms, setClassrooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Active Editing State
  const [roomData, setRoomData] = useState({
    id: null, 
    name: '', 
    rows: 8, 
    cols: 10, 
    broken_seats: '', 
    block_width: 2,
    block_structure: null  // Variable block widths: [3, 2, 3, 2] etc.
  });
  
  // Use custom block structure mode
  const [useCustomBlocks, setUseCustomBlocks] = useState(false);

  // Compute effective block structure (for display)
  const effectiveBlockStructure = useMemo(() => {
    if (roomData.block_structure && Array.isArray(roomData.block_structure) && roomData.block_structure.length > 0) {
      return roomData.block_structure;
    }
    // Auto-generate from block_width
    const cols = roomData.cols || 1;
    const blockWidth = roomData.block_width || 2;
    const structure = [];
    let remaining = cols;
    while (remaining > 0) {
      const width = Math.min(blockWidth, remaining);
      structure.push(width);
      remaining -= width;
    }
    return structure;
  }, [roomData.block_structure, roomData.block_width, roomData.cols]);

  // Validate block structure sums to cols
  const blockStructureSum = useMemo(() => {
    return effectiveBlockStructure.reduce((sum, w) => sum + w, 0);
  }, [effectiveBlockStructure]);
  
  const isBlockStructureValid = blockStructureSum === roomData.cols;

  // Fetch classrooms
  const fetchClassrooms = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch('/api/classrooms', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      setClassrooms(data);
      if (selectedRoomId && selectedRoomId !== 'new') {
        const current = data.find(c => c.id === selectedRoomId);
        if (current) setRoomData(current);
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Failed to load registry", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchClassrooms(); }, []);

  // Re-fetch when user changes (account switch)
  const userIdentity = user?.email || user?.id;
  useEffect(() => {
    if (userIdentity) {
      setClassrooms([]);
      setSelectedRoomId(null);
      setRoomData({ id: null, name: '', rows: 8, cols: 10, broken_seats: '', block_width: 2, block_structure: null });
      fetchClassrooms();
    }
  }, [userIdentity]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectRoom = (room) => {
    setSelectedRoomId(room.id);
    setRoomData({ ...room }); 
    // Check if this room has custom block structure
    setUseCustomBlocks(room.block_structure && Array.isArray(room.block_structure) && room.block_structure.length > 0);
  };

  const handleCreateNew = () => {
    setSelectedRoomId('new');
    setRoomData({ 
      id: null, 
      name: 'New Classroom', 
      rows: 8, 
      cols: 10, 
      broken_seats: '', 
      block_width: 2,
      block_structure: null
    });
    setUseCustomBlocks(false);
  };

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
    if (!roomData.name.trim()) {
      if (showToast) showToast("Room name required", "error");
      return;
    }

    if (roomData.rows <= 0 || roomData.rows > 50) {
      if (showToast) showToast("Rows must be between 1 and 50", "error");
      return;
    }

    if (roomData.cols <= 0 || roomData.cols > 50) {
      if (showToast) showToast("Columns must be between 1 and 50", "error");
      return;
    }

    // Validate block structure if using custom blocks
    if (useCustomBlocks && !isBlockStructureValid) {
      if (showToast) showToast(`Block widths sum to ${blockStructureSum}, but classroom has ${roomData.cols} columns`, "error");
      return;
    }

    setSaving(true);
    try {
      const token = getToken();
      
      // ✅ Use PUT for updates, POST for creates
      const isEditing = roomData.id != null && selectedRoomId !== 'new';
      const url = isEditing ? `/api/classrooms/${roomData.id}` : '/api/classrooms';
      const method = isEditing ? 'PUT' : 'POST';
      
      const payload = {
        name: roomData.name,
        rows: parseInt(roomData.rows),
        cols: parseInt(roomData.cols),
        block_width: parseInt(roomData.block_width) || 2,
        broken_seats: roomData.broken_seats || ''
      };
      
      // Include block_structure if using custom blocks
      if (useCustomBlocks && roomData.block_structure) {
        payload.block_structure = roomData.block_structure;
      } else {
        payload.block_structure = null; // Clear custom structure
      }
      
      console.log(`📤 ${method} ${url}`, payload);
      
      const res = await fetch(url, {
        method: method,
        headers: { 
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "Save failed");
      }

      if (showToast) {
        showToast(
          isEditing 
            ? `✅ ${roomData.name} updated successfully` 
            : `✅ ${roomData.name} created successfully`, 
          "success"
        );
      }
      
      fetchClassrooms();
      
      // If we just created a new room, select it
      if (!isEditing && data.id) {
        setSelectedRoomId(data.id);
        setRoomData({ ...roomData, id: data.id });
      }
      
    } catch (err) {
      console.error('Save error:', err);
      if (showToast) showToast(err.message || "Error saving classroom", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!roomData.id || !window.confirm(`Delete "${roomData.name}"? This action cannot be undone.`)) return;

    try {
      const token = getToken();
      const res = await fetch(`/api/classrooms/${roomData.id}`, { 
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Delete failed");
      }

      if (showToast) showToast(data.message || "Classroom deleted", "success");
      
      fetchClassrooms();
      setSelectedRoomId(null);
      setRoomData({ id: null, name: '', rows: 8, cols: 10, broken_seats: '', block_width: 2, block_structure: null });
      setUseCustomBlocks(false);
    } catch (err) {
      if (showToast) showToast(err.message || "Delete failed", "error");
    }
  };

  // Block structure management functions
  const initializeCustomBlocks = () => {
    // Initialize with current effective structure
    setRoomData({ ...roomData, block_structure: [...effectiveBlockStructure] });
    setUseCustomBlocks(true);
  };

  const addBlock = () => {
    const current = roomData.block_structure || [...effectiveBlockStructure];
    setRoomData({ ...roomData, block_structure: [...current, 1] });
  };

  const removeBlock = (index) => {
    const current = roomData.block_structure || [...effectiveBlockStructure];
    if (current.length > 1) {
      const newStructure = current.filter((_, i) => i !== index);
      setRoomData({ ...roomData, block_structure: newStructure });
    }
  };

  const updateBlockWidth = (index, newWidth) => {
    const current = roomData.block_structure || [...effectiveBlockStructure];
    const newStructure = [...current];
    newStructure[index] = Math.max(1, parseInt(newWidth) || 1);
    setRoomData({ ...roomData, block_structure: newStructure });
  };

  const resetToUniform = () => {
    setUseCustomBlocks(false);
    setRoomData({ ...roomData, block_structure: null });
  };

  const brokenSeatsList = roomData.broken_seats ? roomData.broken_seats.split(',').map(s => s.trim()).filter(Boolean) : [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#050505] py-8 px-4 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-200 dark:border-gray-800">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="relative w-3 h-3">
                <div className="absolute inset-0 bg-orange-500 rounded-full animate-ping opacity-75"></div>
                <div className="relative w-3 h-3 bg-orange-500 rounded-full border border-orange-400"></div>
              </div>
              <span className="text-xs font-mono text-orange-500 tracking-wider uppercase">Classroom Manager</span>
            </div>
            <SplitText
              text="Classroom Registry"
              className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-gray-900 via-gray-700 to-gray-500 dark:from-gray-100 dark:via-gray-300 dark:to-gray-500 bg-clip-text text-transparent"
              splitType="chars"
              delay={30}
            />
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Design and manage your classroom layouts
            </p>
          </div>
          
          <div className="flex gap-4">
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">Total Rooms</div>
              <div className="font-mono text-2xl text-orange-600 dark:text-orange-400 font-black">
                {classrooms.length}
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
          {/* SIDEBAR */}
          <Card className="lg:col-span-4 flex flex-col overflow-hidden border-2 border-gray-200 dark:border-gray-700 shadow-xl">
            <div className="p-6 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border-b-2 border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building className="text-orange-500" size={24} />
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Room Registry</h2>
                </div>
                <Button size="icon" variant="secondary" onClick={handleCreateNew} title="Create New Room">
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
              <Label className="mb-3 block">Select Room to Edit</Label>
              <div className="space-y-3">
                {classrooms.map((room, idx) => (
                  <motion.button
                    key={room.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => handleSelectRoom(room)}
                    className={`w-full text-left p-4 rounded-xl transition-all duration-200 border-2 group ${
                      selectedRoomId === room.id 
                        ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20 shadow-lg" 
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-orange-500 dark:hover:border-orange-400"
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className={`font-bold ${selectedRoomId === room.id ? "text-orange-600 dark:text-orange-400" : "text-gray-700 dark:text-gray-200"}`}>
                        {room.name}
                      </span>
                      {room.broken_seats && room.broken_seats.split(',').filter(Boolean).length > 0 && (
                        <span className="flex items-center text-xs font-bold text-red-600 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded-lg border border-red-200 dark:border-red-800">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          {room.broken_seats.split(',').filter(Boolean).length}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono flex gap-3">
                      <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600">
                        {room.rows} × {room.cols}
                      </span>
                      <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600">
                        CAP: {room.rows * room.cols}
                      </span>
                    </div>
                  </motion.button>
                ))}
                {classrooms.length === 0 && !loading && (
                  <div className="text-center py-16 text-gray-400">
                    <Building className="mx-auto mb-4 opacity-20" size={48} />
                    <p className="text-sm font-medium">No classrooms found</p>
                    <p className="text-xs mt-1">Click + to create one</p>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* MAIN DESIGNER */}
          <Card className="lg:col-span-8 flex flex-col relative overflow-hidden border-2 border-gray-200 dark:border-gray-700 shadow-xl min-h-[600px]">
            {!selectedRoomId ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 border-4 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl m-8">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-orange-500 rounded-full blur-2xl opacity-20"></div>
                  <LayoutGrid className="h-24 w-24 relative opacity-20" />
                </div>
                <p className="text-xl font-bold">Select a room to edit layout</p>
                <p className="text-sm mt-2">Or create a new one to get started</p>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Toolbar */}
                <div className="p-6 border-b-2 border-gray-200 dark:border-gray-700 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-800 dark:to-gray-750">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                          <Building size={12} className="text-orange-500" />
                          Name
                        </Label>
                        <Input 
                          value={roomData.name} 
                          onChange={e => setRoomData({...roomData, name: e.target.value})} 
                          placeholder="Room name" 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Rows</Label>
                        <Input 
                          type="number" 
                          value={roomData.rows} 
                          onChange={e => setRoomData({...roomData, rows: Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1))})} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Columns</Label>
                        <Input 
                          type="number" 
                          value={roomData.cols} 
                          onChange={e => setRoomData({...roomData, cols: Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1))})} 
                        />
                      </div>
                    </div>
                    
                    {/* Block Structure Editor */}
                    <div className="space-y-3 p-4 bg-white/50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-1">
                          <Columns size={12} className="text-orange-500" />
                          Block Structure
                        </Label>
                        {!useCustomBlocks ? (
                          <button
                            onClick={initializeCustomBlocks}
                            className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors"
                          >
                            Customize Blocks
                          </button>
                        ) : (
                          <button
                            onClick={resetToUniform}
                            className="text-xs font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                          >
                            Reset to Uniform
                          </button>
                        )}
                      </div>
                      
                      {!useCustomBlocks ? (
                        <div className="flex items-center gap-3">
                          <div className="space-y-1 flex-1">
                            <div className="text-xs text-gray-500 dark:text-gray-400">Uniform Width</div>
                            <Input 
                              type="number" 
                              value={roomData.block_width} 
                              onChange={e => setRoomData({...roomData, block_width: Math.max(1, parseInt(e.target.value, 10) || 1)})} 
                            />
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                            = {effectiveBlockStructure.length} blocks
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2 items-center">
                            {(roomData.block_structure || effectiveBlockStructure).map((width, idx) => (
                              <div key={idx} className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg px-2 py-1">
                                <span className="text-xs text-gray-500 dark:text-gray-400">B{idx + 1}:</span>
                                <input
                                  type="number"
                                  min="1"
                                  value={width}
                                  onChange={e => updateBlockWidth(idx, e.target.value)}
                                  className="w-12 h-7 text-center text-sm font-mono bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                                />
                                {(roomData.block_structure || effectiveBlockStructure).length > 1 && (
                                  <button
                                    onClick={() => removeBlock(idx)}
                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                    title="Remove block"
                                  >
                                    <Minus size={12} />
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              onClick={addBlock}
                              className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                            >
                              <Plus size={12} /> Add
                            </button>
                          </div>
                          
                          {/* Validation Status */}
                          <div className={`text-xs flex items-center gap-1 ${isBlockStructureValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {isBlockStructureValid ? (
                              <>
                                <CheckCircle2 size={12} />
                                <span>Sum: {blockStructureSum} = {roomData.cols} columns ✓</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle size={12} />
                                <span>Sum: {blockStructureSum} ≠ {roomData.cols} columns (adjust widths)</span>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2 justify-end">
                      {roomData.id && (
                        <Button variant="destructive" onClick={handleDelete} title="Delete Room">
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </Button>
                      )}
                      <Button onClick={handleSave} disabled={saving || (useCustomBlocks && !isBlockStructureValid)}>
                        {saving ? (
                          <>
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                              <Save className="h-4 w-4 mr-2" />
                            </motion.div>
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" /> Save Layout
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Canvas with Floating Header */}
                <div className="flex-1 overflow-auto overflow-x-auto p-8 bg-gray-50 dark:bg-[#050505] relative">
                  <div className="flex flex-col w-full gap-4">
                    {/* Floating Transparent Header */}
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 z-50 flex justify-center pt-4 pointer-events-none">
                      <div className="bg-gradient-to-r from-orange-500 to-amber-500 opacity-90 backdrop-blur-sm px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2 shadow-lg pointer-events-auto">
                        <Monitor size={16}/> Front of Classroom
                      </div>
                    </div>

                    {/* Grid Container */}
                    <div className="flex flex-col items-center gap-8 mt-16">
                      <div 
                        className="grid gap-2 transition-all duration-300" 
                        style={{ 
                          gridTemplateColumns: `repeat(${roomData.cols}, minmax(45px, auto))`, 
                          width: 'auto' 
                        }}
                      >
                        {Array.from({ length: roomData.rows * roomData.cols }).map((_, idx) => {
                          const r = Math.floor(idx / roomData.cols) + 1;
                          const c = (idx % roomData.cols) + 1;
                          const isBroken = brokenSeatsList.includes(`${r}-${c}`);
                          return (
                            <motion.button
                              key={idx}
                              initial={{ scale: 0, opacity: 0 }} 
                              animate={{ scale: 1, opacity: 1 }} 
                              transition={{ delay: idx * 0.002, type: "spring" }}
                              onClick={() => toggleSeat(idx)} 
                              className={`h-12 w-12 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-200 border-2 shadow-sm ${
                                isBroken 
                                  ? "bg-red-50 dark:bg-red-900/20 border-red-500 dark:border-red-600 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 shadow-red-500/20" 
                                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600 hover:border-orange-500 dark:hover:border-orange-400 hover:text-orange-500 hover:-translate-y-1"
                              }`}
                              title={`Row ${r}, Col ${c}${isBroken ? ' (Broken)' : ''}`}
                            >
                              {isBroken ? <X size={18} className="font-black"/> : <span className="font-mono">{r}-{c}</span>}
                            </motion.button>
                          );
                        })}
                      </div>

                      {/* Legend */}
                      <div className="flex gap-4 justify-center text-xs">
                        <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                          <div className="w-4 h-4 rounded bg-white border-2 border-gray-200"></div>
                          <span className="font-medium text-gray-600 dark:text-gray-400">Available</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                          <div className="w-4 h-4 rounded bg-red-50 border-2 border-red-500 flex items-center justify-center">
                            <X size={10} className="text-red-500"/>
                          </div>
                          <span className="font-medium text-gray-600 dark:text-gray-400">Broken</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
      `}</style>
    </div>
  );
}
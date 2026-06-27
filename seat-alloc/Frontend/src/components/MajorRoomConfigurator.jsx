import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Building2, Users, AlertCircle, Check, Monitor } from 'lucide-react';

/**
 * MajorRoomConfigurator Modal
 * Dynamic room configuration with branch assignment.
 * Each room: name + capacity + which branches to assign.
 */
function MajorRoomConfigurator({ isOpen, onClose, onSubmit, branches = {}, loading = false }) {
  const [rooms, setRooms] = useState([
    { name: '', capacity: '', branches: [] }
  ]);
  const [error, setError] = useState('');

  const branchNames = Object.keys(branches);
  const totalStudents = Object.values(branches).reduce((sum, b) => sum + (b.count || b.length || 0), 0);
  const totalCapacity = rooms.reduce((sum, r) => sum + (parseInt(r.capacity) || 0), 0);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setRooms([{ name: '', capacity: '', branches: [] }]);
      setError('');
    }
  }, [isOpen]);

  const addRoom = () => {
    setRooms(prev => [...prev, { name: '', capacity: '', branches: [] }]);
  };

  const removeRoom = (idx) => {
    if (rooms.length <= 1) return;
    setRooms(prev => prev.filter((_, i) => i !== idx));
  };

  const updateRoom = (idx, field, value) => {
    setRooms(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const toggleBranch = (roomIdx, branchName) => {
    setRooms(prev => prev.map((r, i) => {
      if (i !== roomIdx) return r;
      const branches = r.branches.includes(branchName)
        ? r.branches.filter(b => b !== branchName)
        : [...r.branches, branchName];
      return { ...r, branches };
    }));
  };

  const handleSubmit = () => {
    setError('');
    
    // Validate
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      if (!r.name.trim()) {
        setError(`Room ${i + 1}: Name is required`);
        return;
      }
      if (!r.capacity || parseInt(r.capacity) < 1) {
        setError(`Room "${r.name}": Capacity must be at least 1`);
        return;
      }
      if (r.branches.length === 0) {
        setError(`Room "${r.name}": At least one branch must be assigned`);
        return;
      }
    }

    onSubmit(rooms.map(r => ({
      name: r.name.trim(),
      capacity: parseInt(r.capacity),
      branches: r.branches
    })));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-auto"
        >
          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-[#0a0a0a] border-b border-gray-200 dark:border-gray-800 p-6 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Building2 className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Room Configuration</h2>
                <p className="text-sm text-gray-600 dark:text-gray-500">Assign classrooms and branches for allocation</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Branch summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {branchNames.map(name => (
                <div key={name} className="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{name}</p>
                  <p className="text-xl font-bold text-orange-400">
                    {branches[name]?.count || branches[name]?.length || 0}
                  </p>
                  <p className="text-xs text-gray-600">students</p>
                </div>
              ))}
              <div className="p-3 bg-gray-50 dark:bg-gray-900 border border-orange-300/60 dark:border-orange-800/50 rounded-xl">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Total</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{totalStudents}</p>
                <p className="text-xs text-gray-600">students</p>
              </div>
            </div>

            {/* Capacity indicator */}
            <div className={`p-3 rounded-xl border flex items-center gap-3 ${
              totalCapacity >= totalStudents
                ? 'bg-green-900/20 border-green-800/50 text-green-400'
                : 'bg-yellow-900/20 border-yellow-800/50 text-yellow-400'
            }`}>
              <Users className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">
                Total capacity: <strong>{totalCapacity}</strong> / {totalStudents} students needed
                {totalCapacity < totalStudents && ' — add more rooms'}
              </span>
            </div>

            {/* Classroom Info Cards */}
            {rooms.some(r => r.name || r.capacity) && (
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-widest mb-3">
                  <Monitor size={16} className="text-orange-500" />
                  Classroom Info
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Total Rooms</p>
                    <p className="text-2xl font-bold text-orange-400">{rooms.filter(r => r.name).length}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-500 mt-1">configured</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Total Capacity</p>
                    <p className="text-2xl font-bold text-blue-400">{totalCapacity}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-500 mt-1">seats available</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Free Seats</p>
                    <p className={`text-2xl font-bold ${totalCapacity - totalStudents >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {Math.max(0, totalCapacity - totalStudents)}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-500 mt-1">unallocated</p>
                  </div>
                </div>
              </div>
            )}

            {/* Room list */}
            <div className="space-y-4">
              {rooms.map((room, idx) => (
                <div key={idx} className="p-5 bg-gray-50/90 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Room {idx + 1}
                    </h3>
                    {rooms.length > 1 && (
                      <button
                        onClick={() => removeRoom(idx)}
                        className="p-1.5 hover:bg-red-900/30 text-red-400 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5 font-medium">Room / Lab Name</label>
                      <input
                        type="text"
                        value={room.name}
                        onChange={(e) => updateRoom(idx, 'name', e.target.value)}
                        placeholder="e.g. Lab 104"
                        className="w-full px-3 py-2.5 bg-white dark:bg-black border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:border-orange-500 focus:outline-none transition-colors text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5 font-medium">Capacity</label>
                      <input
                        type="number"
                        min="1"
                        value={room.capacity}
                        onChange={(e) => updateRoom(idx, 'capacity', e.target.value)}
                        placeholder="e.g. 35"
                        className="w-full px-3 py-2.5 bg-white dark:bg-black border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:border-orange-500 focus:outline-none transition-colors text-sm"
                      />
                    </div>
                  </div>

                  {/* Branch selection */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-2 font-medium">Assign Branches</label>
                    <div className="flex flex-wrap gap-2">
                      {branchNames.map(branchName => {
                        const isSelected = room.branches.includes(branchName);
                        return (
                          <button
                            key={branchName}
                            onClick={() => toggleBranch(idx, branchName)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-orange-500/20 border border-orange-500/50 text-orange-300'
                                : 'bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                            {branchName}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Batch Students Info */}
                  {room.branches.length > 0 && (
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                      <label className="block text-xs text-gray-500 mb-2.5 font-medium">Batch Students Info</label>
                      <div className="space-y-2">
                        {room.branches.map(branchName => {
                          const branchData = branches[branchName];
                          const totalInBranch = branchData?.count || branchData?.length || 0;
                          return (
                            <div
                              key={branchName}
                              className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-mono"
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-gray-700 dark:text-gray-300">{branchName}</span>
                                <span className="text-gray-600 dark:text-gray-400">
                                  Total Students: <strong className="text-orange-400">{totalInBranch}</strong>
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add room button */}
            <button
              onClick={addRoom}
              className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-orange-600 rounded-xl text-gray-600 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Room
            </button>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-xl flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Confirm & Allocate
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default MajorRoomConfigurator;

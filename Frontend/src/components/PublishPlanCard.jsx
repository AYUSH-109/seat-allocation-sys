/**
 * PublishPlanCard.jsx
 *
 * "Publish to Exam Locator" card that lives inside the More Options page.
 *
 * What it does:
 *   1. Shows a form with two inputs: Exam Date and Time Slot
 *   2. On submit → POST /api/plans/<planId>/publish  {date, time_slot}
 *   3. Shows live loading / success / error states
 *   4. On success renders a summary (rooms, student count, object URI)
 */

import React, { useState } from 'react';
import { Upload, Calendar, Clock, CheckCircle2, AlertCircle, Loader2, CloudUpload } from 'lucide-react';
import { getToken } from '../utils/tokenStorage';

/* ── Common time-slot presets ─────────────────────────────────────────────── */
const TIME_SLOT_OPTIONS = [
  '09:00-12:00',
  '10:00-13:00',
  '12:00-15:00',
  '14:00-17:00',
  '02:00-05:00',
];

const PublishPlanCard = ({ planId, showToast }) => {
  const [date, setDate]           = useState('');        // raw HTML date input → "YYYY-MM-DD"
  const [timeSlot, setTimeSlot]   = useState(TIME_SLOT_OPTIONS[0]);
  const [customSlot, setCustomSlot] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);      // success payload
  const [error, setError]         = useState(null);

  /* Convert "YYYY-MM-DD" (HTML date input) to "MM-DD-YYYY" (plan format) */
  const formatDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${m}-${d}-${y}`;
  };

  const activeSlot = useCustom ? customSlot : timeSlot;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!date) {
      setError('Please select an exam date.');
      return;
    }
    if (!activeSlot || !activeSlot.includes('-')) {
      setError('Time slot must be in HH:MM-HH:MM format.');
      return;
    }

    const body = {
      date:      formatDate(date),
      time_slot: activeSlot.trim(),
    };

    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/plans/${planId}/publish`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Publish failed');
      }

      setResult(data);
      showToast?.(`✅ Plan published — ${data.total_students} students across ${data.rooms.length} room(s).`, 'success');
    } catch (err) {
      setError(err.message);
      showToast?.(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setDate('');
    setTimeSlot(TIME_SLOT_OPTIONS[0]);
    setCustomSlot('');
    setUseCustom(false);
  };

  /* ── Success view ──────────────────────────────────────────────────────── */
  if (result) {
    return (
      <div className="rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-800 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="font-bold text-emerald-800 dark:text-emerald-200 text-lg">Published Successfully</h3>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono">{result.object_uri}</p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <InfoChip label="Date"       value={result.date}           color="blue" />
          <InfoChip label="Time Slot"  value={result.time_slot}      color="violet" />
          <InfoChip label="Students"   value={result.total_students} color="amber" />
        </div>

        {/* Room list */}
        <div>
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-2 uppercase tracking-wider">
            Rooms Included
          </p>
          <div className="flex flex-wrap gap-2">
            {result.rooms.map((r) => (
              <span key={r} className="px-3 py-1 rounded-full text-xs font-bold bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300">
                {r}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={handleReset}
          className="mt-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors"
        >
          Publish Another
        </button>
      </div>
    );
  }

  /* ── Form view ─────────────────────────────────────────────────────────── */
  return (
    <div className="rounded-2xl border-2 border-orange-200 dark:border-orange-800 bg-white dark:bg-gray-900 overflow-hidden">
      {/* Card header */}
      <div className="px-6 py-4 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/30 border-b border-orange-200 dark:border-orange-800 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
          <CloudUpload className="w-5 h-5 text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base">Publish to Exam Locator</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Exports a cleaned plan file to the student seat-finder service
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        {/* Exam Date */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700 dark:text-gray-300">
            <Calendar className="w-4 h-4 text-orange-500" />
            Exam Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700
                       bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                       focus:outline-none focus:border-orange-400 dark:focus:border-orange-500
                       transition-colors text-sm font-mono"
          />
        </div>

        {/* Time Slot */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700 dark:text-gray-300">
            <Clock className="w-4 h-4 text-orange-500" />
            Time Slot
          </label>

          {/* Toggle: preset vs custom */}
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setUseCustom(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-colors ${
                !useCustom
                  ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-orange-300'
              }`}
            >
              Preset
            </button>
            <button
              type="button"
              onClick={() => setUseCustom(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-colors ${
                useCustom
                  ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-orange-300'
              }`}
            >
              Custom
            </button>
          </div>

          {useCustom ? (
            <input
              type="text"
              placeholder="e.g. 09:00-12:00"
              value={customSlot}
              onChange={(e) => setCustomSlot(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700
                         bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                         focus:outline-none focus:border-orange-400 dark:focus:border-orange-500
                         transition-colors text-sm font-mono placeholder-gray-400"
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {TIME_SLOT_OPTIONS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setTimeSlot(slot)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-colors font-mono ${
                    timeSlot === slot
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-orange-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info box */}
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
            <span className="font-bold">What gets published:</span> a cleaned copy of the plan with
            date &amp; time metadata — room layouts, seat positions, roll numbers &amp; paper sets only.
            Batch groupings and internal cache fields are stripped out.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 dark:text-red-300 font-medium">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl
                     bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600
                     disabled:opacity-60 disabled:cursor-not-allowed
                     text-white font-bold text-sm transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Publishing…
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Publish Plan
            </>
          )}
        </button>
      </form>
    </div>
  );
};

/* ── Tiny helper chip ─────────────────────────────────────────────────────── */
const COLOR_MAP = {
  blue:   'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300',
  violet: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-300',
  amber:  'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300',
};

const InfoChip = ({ label, value, color = 'blue' }) => (
  <div className={`rounded-xl border p-3 text-center ${COLOR_MAP[color]}`}>
    <div className="text-lg font-black">{value}</div>
    <div className="text-xs font-bold opacity-70 uppercase tracking-wider">{label}</div>
  </div>
);

export default PublishPlanCard;

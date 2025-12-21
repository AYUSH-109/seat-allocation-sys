import React, { useState, useEffect } from 'react';
import { User, LogOut, Mail, Edit2, Check, X, Loader2, Shield, Calendar } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ProfilePage = ({ showToast, setCurrentPage }) => {
  const { user, logout, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
  });

  // Update form when user changes
  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        email: user.email || '',
      });
    }
  }, [user]);

  const handleSave = async () => {
    // Validate fields
    if (!formData.username.trim() || !formData.email.trim()) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    setLoading(true);
    const result = await updateProfile(formData.username, formData.email);
    setLoading(false);

    if (result.success) {
      showToast('Profile updated successfully!', 'success');
      setIsEditing(false);
    } else {
      showToast(result.error || 'Failed to update profile', 'error');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({
      username: user?.username || '',
      email: user?.email || '',
    });
  };

  const handleLogout = async () => {
    await logout();
    showToast('Logged out successfully', 'success');
    setCurrentPage('landing');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4 text-blue-600" size={40} />
          <p className="text-gray-600 dark:text-gray-400">Loading your profile...</p>
        </div>
      </div>
    );
  }

  const getInitials = (name) => {
    return name
      ?.split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'U';
  };

  const roleColors = {
    admin: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
    student: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
    staff: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  };

  const roleColor = roleColors[user?.role?.toLowerCase()] || roleColors.student;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-8 px-4 transition-colors duration-300">
      <div className="max-w-2xl mx-auto">
        {/* Main Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden transition-colors duration-300">
          {/* Hero Header with Gradient */}
          <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 dark:from-blue-700 dark:via-blue-800 dark:to-indigo-800 p-8 text-white relative overflow-hidden">
            {/* Decorative circles */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/10 rounded-full -ml-16 -mb-16"></div>

            <div className="relative z-10">
              <div className="flex items-start gap-6">
                {/* Avatar */}
                <div className="w-24 h-24 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center shadow-lg border-4 border-white/20">
                  <span className="text-3xl font-bold text-white">{getInitials(user?.fullName)}</span>
                </div>

                {/* User Info */}
                <div className="flex-1 pt-1">
                  <h1 className="text-3xl font-bold mb-2">{user?.fullName}</h1>
                  <div className="flex items-center gap-2 text-blue-100 mb-4">
                    <Mail size={16} />
                    <p>{user?.email}</p>
                  </div>
                  <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold ${roleColor} capitalize`}>
                    {user?.role}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Profile Content */}
          <div className="p-8">
            {/* Section Header */}
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <Shield size={24} className="text-blue-600 dark:text-blue-400" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Account Settings</h2>
              </div>

              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-all duration-200 font-medium shadow-md hover:shadow-lg"
                >
                  <Edit2 size={18} />
                  Edit Profile
                </button>
              )}
            </div>

            {/* Form Fields */}
            <div className="space-y-6 mb-8">
              {/* Username Field */}
              <div className="group">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Username
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg disabled:bg-gray-50 dark:disabled:bg-slate-700 disabled:cursor-not-allowed bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all duration-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Full Name Field (Read-only from Google) */}
              <div className="group">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Full Name
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-2">(from Google)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled
                    value={user?.fullName || ''}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-slate-700 cursor-not-allowed text-gray-600 dark:text-gray-400 transition-all duration-200"
                  />
                </div>
              </div>

              {/* Email Field */}
              <div className="group">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    disabled={!isEditing}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg disabled:bg-gray-50 dark:disabled:bg-slate-700 disabled:cursor-not-allowed bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all duration-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Role Field (Read-only) */}
              <div className="group">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Role
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled
                    value={user?.role || ''}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-slate-700 cursor-not-allowed text-gray-600 dark:text-gray-400 capitalize transition-all duration-200"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {isEditing && (
              <div className="flex gap-3 mb-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-600 dark:bg-green-600 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-700 transition-all duration-200 font-medium disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      Save Changes
                    </>
                  )}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-200 font-medium disabled:opacity-60"
                >
                  <X size={18} />
                  Cancel
                </button>
              </div>
            )}

            {/* Logout Section */}
            <div className="pt-8 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-500 dark:bg-red-600 text-white rounded-lg hover:bg-red-600 dark:hover:bg-red-700 transition-all duration-200 font-medium shadow-md hover:shadow-lg"
              >
                <LogOut size={20} />
                Logout from Account
              </button>
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="mt-6 bg-blue-50 dark:bg-slate-700 border-l-4 border-blue-500 p-6 rounded-lg">
          <p className="text-sm text-blue-900 dark:text-blue-200">
            <span className="font-semibold">💡 Tip:</span> Your full name is fetched from your Google account and cannot be changed directly. Update your profile picture and name in your Google Account settings if needed.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
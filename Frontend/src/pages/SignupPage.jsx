import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Users, Loader2, ArrowRight, ArrowLeft, Sparkles, Mail, Lock, User, Shield, Code, GraduationCap, Check } from 'lucide-react';
import SplitText from '../components/SplitText';
import { useAuth } from '../contexts/AuthContext';

const ROLE_CONFIG = [
  {
    id: 'developer',
    label: 'Developer',
    icon: Code,
    color: 'from-blue-500 to-cyan-500',
    bgLight: 'bg-blue-50',
    bgDark: 'dark:bg-blue-900/20',
    borderColor: 'border-blue-300 dark:border-blue-700',
    selectedBorder: 'border-blue-500 dark:border-blue-400',
    textColor: 'text-blue-700 dark:text-blue-300',
    description: 'Full system access including database management and developer tools',
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Shield,
    color: 'from-orange-500 to-amber-500',
    bgLight: 'bg-orange-50',
    bgDark: 'dark:bg-orange-900/20',
    borderColor: 'border-orange-300 dark:border-orange-700',
    selectedBorder: 'border-orange-500 dark:border-orange-400',
    textColor: 'text-orange-700 dark:text-orange-300',
    description: 'Administrative access for managing seat plans and system settings',
  },
  {
    id: 'faculty',
    label: 'Faculty',
    icon: GraduationCap,
    color: 'from-emerald-500 to-green-500',
    bgLight: 'bg-emerald-50',
    bgDark: 'dark:bg-emerald-900/20',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    selectedBorder: 'border-emerald-500 dark:border-emerald-400',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    description: 'Faculty access for viewing seat plans and providing feedback',
  },
];

const SignupPage = ({ showToast }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signup, googleLogin } = useAuth();

  // Check if redirected from Google login (needs role selection)
  const googleData = location.state?.googleData || null;
  const isGoogleFlow = !!googleData;

  const [step, setStep] = useState(1); // Step 1: role selection, Step 2: form
  const [selectedRole, setSelectedRole] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Pre-fill email if coming from Google
  useEffect(() => {
    if (googleData) {
      setFormData(prev => ({
        ...prev,
        email: googleData.email || '',
        username: googleData.full_name?.split(' ')[0]?.toLowerCase() || '',
      }));
    }
  }, [googleData]);

  const validateForm = () => {
    const newErrors = {};

    if (!isGoogleFlow) {
      if (!formData.username || formData.username.length < 3) {
        newErrors.username = 'Username must be at least 3 characters';
      }

      if (formData.password.length < 6) {
        newErrors.password = 'Password must be at least 6 characters';
      }

      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRoleSelect = (roleId) => {
    setSelectedRole(roleId);
  };

  const handleContinue = () => {
    if (!selectedRole) {
      showToast('Please select a role to continue', 'error');
      return;
    }

    if (isGoogleFlow) {
      // For Google flow, directly submit with role
      handleGoogleComplete();
    } else {
      // Move to form step
      setStep(2);
    }
  };

  const handleGoogleComplete = async () => {
    setLoading(true);
    try {
      const result = await googleLogin(
        googleData.google_token,
        selectedRole,
        googleData.signup_token
      );

      if (result.success && !result.needs_role) {
        showToast('Account created successfully!', 'success');
        setTimeout(() => navigate('/dashboard'), 1000);
      } else {
        showToast(result.error || 'Failed to create account', 'error');
      }
    } catch (error) {
      showToast('An error occurred. Please try again.', 'error');
    }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    const result = await signup({
      username: formData.username,
      email: formData.email,
      password: formData.password,
      role: selectedRole,
    });
    setLoading(false);

    if (result.success) {
      showToast('Account created successfully!', 'success');
      setTimeout(() => navigate('/dashboard'), 1500);
    } else {
      showToast(result.error || 'Signup failed', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-phantom-black flex items-center justify-center px-4 py-12 transition-colors duration-300 relative overflow-hidden">
      
      {/* Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-orange-500/10 to-amber-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-amber-500/10 to-orange-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-lg relative z-10">
        {/* Card Container */}
        <div className="glass-card rounded-3xl p-8 border border-[#c0c0c0] dark:border-[#8a8a8a] shadow-[0_0_32px_rgba(192,192,192,0.24)] dark:shadow-[0_0_32px_rgba(138,138,138,0.26)] animate-fadeInUp">
          
          {/* Header */}
          <div className="text-center mb-8">
            {/* Icon Badge */}
            <div className="relative inline-block mb-4">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full blur-lg opacity-50"></div>
              <div className="relative bg-gradient-to-br from-orange-500 to-amber-500 w-16 h-16 rounded-full flex items-center justify-center shadow-lg">
                <Users className="text-white" size={32} />
              </div>
            </div>

            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-full mb-4">
              <Sparkles className="text-orange-500" size={16} />
              <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">
                {isGoogleFlow ? 'Complete Registration' : 'New Account'}
              </span>
            </div>

            <SplitText
              text={step === 1 ? 'Select Your Role' : 'Create Account'}
              className="text-4xl font-black text-gray-900 dark:text-white mb-3"
              splitType="chars"
              delay={30}
            />
            <p className="text-gray-600 dark:text-gray-400">
              {step === 1
                ? isGoogleFlow
                  ? `Welcome ${googleData?.full_name || ''}! Choose your role to continue`
                  : 'Choose your role to get started'
                : 'Fill in your details to complete signup'}
            </p>

            {/* Step Indicator */}
            {!isGoogleFlow && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <div className={`h-2 w-12 rounded-full transition-all duration-300 ${step >= 1 ? 'bg-gradient-to-r from-orange-500 to-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                <div className={`h-2 w-12 rounded-full transition-all duration-300 ${step >= 2 ? 'bg-gradient-to-r from-orange-500 to-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
              </div>
            )}
          </div>

          {/* ========== STEP 1: ROLE SELECTION ========== */}
          {step === 1 && (
            <div className="space-y-4">
              {ROLE_CONFIG.map((role) => {
                const Icon = role.icon;
                const isSelected = selectedRole === role.id;
                return (
                  <button
                    key={role.id}
                    onClick={() => handleRoleSelect(role.id)}
                    className={`
                      w-full p-4 rounded-2xl border-2 transition-all duration-300 text-left
                      ${isSelected
                        ? `${role.selectedBorder} ${role.bgLight} ${role.bgDark} shadow-lg scale-[1.02]`
                        : 'border-[#c0c0c0] dark:border-[#555] hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-gray-800/50 hover:shadow-md'
                      }
                    `}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`
                        w-12 h-12 rounded-xl flex items-center justify-center shrink-0
                        ${isSelected
                          ? `bg-gradient-to-br ${role.color} text-white shadow-md`
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }
                      `}>
                        <Icon size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className={`font-bold text-lg ${isSelected ? role.textColor : 'text-gray-900 dark:text-white'}`}>
                            {role.label}
                          </h3>
                          {isSelected && (
                            <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${role.color} flex items-center justify-center`}>
                              <Check size={12} className="text-white" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                          {role.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Continue Button */}
              <button
                onClick={handleContinue}
                disabled={!selectedRole || loading}
                className="group w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-3.5 rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all duration-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed mt-6 flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02]"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    {isGoogleFlow ? 'Creating account...' : 'Continue...'}
                  </>
                ) : (
                  <>
                    {isGoogleFlow ? 'Create Account' : 'Continue'}
                    <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* ========== STEP 2: REGISTRATION FORM ========== */}
          {step === 2 && !isGoogleFlow && (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Back Button */}
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors font-medium"
              >
                <ArrowLeft size={16} />
                Change role ({ROLE_CONFIG.find(r => r.id === selectedRole)?.label})
              </button>

              {/* Username */}
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                  <User size={14} className="text-orange-500" />
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-4 py-3.5 border border-[#c0c0c0] dark:border-[#8a8a8a] rounded-xl focus:border-orange-500 dark:focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-300 shadow-[0_0_18px_rgba(192,192,192,0.16)] dark:shadow-[0_0_18px_rgba(138,138,138,0.2)]"
                  placeholder="john_doe"
                />
                {errors.username && (
                  <p className="text-red-500 dark:text-red-400 text-sm mt-2 flex items-center gap-1">
                    <span className="font-semibold">!</span> {errors.username}
                  </p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                  <Mail size={14} className="text-orange-500" />
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3.5 border border-[#c0c0c0] dark:border-[#8a8a8a] rounded-xl focus:border-orange-500 dark:focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-300 shadow-[0_0_18px_rgba(192,192,192,0.16)] dark:shadow-[0_0_18px_rgba(138,138,138,0.2)]"
                  placeholder="you@example.com"
                />
              </div>

              {/* Password */}
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                  <Lock size={14} className="text-orange-500" />
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-3.5 border border-[#c0c0c0] dark:border-[#8a8a8a] rounded-xl focus:border-orange-500 dark:focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-300 shadow-[0_0_18px_rgba(192,192,192,0.16)] dark:shadow-[0_0_18px_rgba(138,138,138,0.2)]"
                  placeholder="••••••••"
                />
                {errors.password && (
                  <p className="text-red-500 dark:text-red-400 text-sm mt-2 flex items-center gap-1">
                    <span className="font-semibold">!</span> {errors.password}
                  </p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                  <Lock size={14} className="text-orange-500" />
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full px-4 py-3.5 border border-[#c0c0c0] dark:border-[#8a8a8a] rounded-xl focus:border-orange-500 dark:focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-300 shadow-[0_0_18px_rgba(192,192,192,0.16)] dark:shadow-[0_0_18px_rgba(138,138,138,0.2)]"
                  placeholder="••••••••"
                />
                {errors.confirmPassword && (
                  <p className="text-red-500 dark:text-red-400 text-sm mt-2 flex items-center gap-1">
                    <span className="font-semibold">!</span> {errors.confirmPassword}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="group w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-3.5 rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all duration-200 font-bold disabled:opacity-60 disabled:cursor-not-allowed mt-6 flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02]"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Creating account...
                  </>
                ) : (
                  <>
                    Sign Up
                    <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              Already have an account?{' '}
              <button
                onClick={() => navigate('/login')}
                className="text-orange-600 dark:text-orange-400 font-bold hover:underline transition-colors duration-200"
              >
                Login here
              </button>
            </p>
          </div>

          {/* Security Note */}
          <div className="mt-6 pt-6 border-t border-[#c0c0c0] dark:border-[#8a8a8a]">
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Shield size={14} className="text-orange-500" />
              <p>Your data is secure and encrypted</p>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            By signing up, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeInUp {
          animation: fadeInUp 0.6s ease-out;
        }
      `}</style>
    </div>
  );
};

export default SignupPage;
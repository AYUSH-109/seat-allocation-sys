import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Loader2, ArrowRight, Shield, Sparkles } from 'lucide-react';
import SplitText from '../components/SplitText';
import { useAuth } from '../contexts/AuthContext';
import GoogleLoginComponent from '../components/GoogleLoginComponent';

const LoginPage = ({ showToast }) => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const result = await login(formData.email, formData.password);
    setLoading(false);
    
    if (result.success) {
      showToast('Login successful!', 'success');
      setTimeout(() => navigate('/dashboard'), 1000);
    } else {
      showToast(result.error || 'Login failed', 'error');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-phantom-black flex items-center justify-center px-4 py-12 transition-colors duration-300 relative overflow-hidden">
      
      {/* Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-orange-500/10 to-amber-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-amber-500/10 to-orange-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Card Container */}
        <div className="glass-card rounded-3xl p-8 border border-[#c0c0c0] dark:border-[#8a8a8a] shadow-[0_0_32px_rgba(192,192,192,0.24)] dark:shadow-[0_0_32px_rgba(138,138,138,0.26)] animate-fadeInUp">
          
          {/* Header */}
          <div className="text-center mb-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-full mb-4">
              <Sparkles className="text-orange-500" size={16} />
              <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">
                Secure Login
              </span>
            </div>

            <SplitText text={`Welcome Back`} className="text-4xl font-black text-gray-900 dark:text-white mb-3" splitType="chars" delay={30} />
            <p className="text-gray-600 dark:text-gray-400">
              Login to your account to continue
            </p>
          </div>

          {/* ========== GOOGLE LOGIN COMPONENT ========== */}
          <GoogleLoginComponent
            showToast={showToast}
            onNeedsRole={(googleData) => {
              showToast('Please select your role to complete registration', 'info');
              navigate('/signup', { state: { googleData } });
            }}
          />
          {/* ========== END GOOGLE LOGIN ========== */}

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Input */}
            <div>
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                <Mail size={14} className="text-orange-500" />
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  required
                  className="w-full pl-4 pr-4 py-3.5 border border-[#c0c0c0] dark:border-[#8a8a8a] rounded-xl focus:border-orange-500 dark:focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-300 shadow-[0_0_18px_rgba(192,192,192,0.16)] dark:shadow-[0_0_18px_rgba(138,138,138,0.2)]"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                <Lock size={14} className="text-orange-500" />
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                  className="w-full pl-4 pr-4 py-3.5 border border-[#c0c0c0] dark:border-[#8a8a8a] rounded-xl focus:border-orange-500 dark:focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-300 shadow-[0_0_18px_rgba(192,192,192,0.16)] dark:shadow-[0_0_18px_rgba(138,138,138,0.2)]"
                />
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="group w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-3.5 rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all duration-200 font-bold disabled:opacity-60 disabled:cursor-not-allowed mt-6 flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02]"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Signup Link */}
          <div className="mt-6 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              Don't have an account?{' '}
              <button
                onClick={() => navigate('/signup')}
                className="text-orange-600 dark:text-orange-400 font-bold hover:underline transition-colors duration-200"
              >
                Sign up here
              </button>
            </p>
          </div>

          {/* Divider Note */}
          <div className="mt-6 pt-6 border-t border-[#c0c0c0] dark:border-[#8a8a8a]">
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Shield size={14} className="text-orange-500" />
              <p>Secured with Google Sign-In and JWT authentication</p>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            By signing in, you agree to our Terms of Service and Privacy Policy
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

export default LoginPage;
import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Layout,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  LayoutDashboard,
  User,
  MessageSquare,
  Info,
  FileEdit,
  Plus,
  Shield
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import PillNav from './PillNav';

const Navbar = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/landing');
    setMobileMenuOpen(false);
  };

  const navItems = useMemo(() => {
    if (!user) return [];
    const items = [
      { name: 'Dashboard', page: '/dashboard', icon: LayoutDashboard },
      { name: 'Create', page: '/create-plan', icon: Plus },
      { name: 'Template Editor', page: '/template-editor', icon: FileEdit },
      { name: 'Feedback', page: '/feedback', icon: MessageSquare },
      { name: 'About us', page: '/aboutus', icon: Info }
    ];
    
    // Add admin-only feedback link for administrators and developers
    if (user.role && ['developer', 'admin', 'ADMIN'].includes(user.role)) {
      items.push({ name: 'Admin Feedback', page: '/admin-feedback', icon: Shield });
    }
    
    return items;
  }, [user]);

  const isActive = (page) => location.pathname === page;

  const pillItems = useMemo(
    () =>
      navItems.map((item) => ({
        label: item.name,
        value: item.page,
        icon: item.icon,
        ariaLabel: item.name
      })),
    [navItems]
  );

  return (
    <>
      {/* Desktop Navbar */}
      <motion.nav
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="sticky top-0 z-40 hidden md:block"
      >
        <div className="w-[95%] max-w-7xl mx-auto pt-4 transition-all duration-500">
          <div className="bg-white/30 dark:bg-black/20 backdrop-blur-2xl rounded-2xl px-6 h-20 flex items-center justify-between shadow-2xl shadow-black/5 border border-white/40 dark:border-white/10 font-sans">
          {/* Logo */}
          <div
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate('/dashboard')}
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Layout className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none uppercase tracking-tighter bg-gradient-to-r from-gray-900 dark:from-white to-gray-600 dark:to-gray-400 bg-clip-text text-transparent">
                SeatAlloc
              </h1>
              <span className="text-[8px] font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400"></span>
            </div>
          </div>

          {/* Navigation Links */}
          {user && (
            <PillNav
              initialLoadAnimation
              className="ml-2"
              items={pillItems}
              activeValue={location.pathname}
              onSelect={(page) => navigate(page)}
              baseColor="rgb(var(--pillnav-base) / 0.35)"
              pillColor={
                theme === 'light'
                  ? 'rgb(var(--pillnav-pill) / 0.12)'
                  : 'rgb(var(--pillnav-pill) / 1)'
              }
              pillTextColor="rgb(var(--pillnav-pill-text) / 1)"
              hoveredPillTextColor="rgb(var(--pillnav-hover-text) / 1)"
              pillBorderColor={
                theme === 'light'
                  ? 'rgba(0, 0, 0, 0.1)'
                  : 'rgba(255, 255, 255, 0.1)'
              }
              groupBorderColor={
                theme === 'light'
                  ? 'rgba(0, 0, 0, 0.15)'
                  : 'rgba(255, 255, 255, 0.15)'
              }
            />
          )}

          {/* Actions */}
          <div className="flex items-center gap-4">
            <motion.button
              onClick={toggleTheme}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-10 h-10 rounded-full border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-200/40 dark:hover:bg-gray-700/40 flex items-center justify-center transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? (
                <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              ) : (
                <Sun className="w-5 h-5 text-amber-500" />
              )}
            </motion.button>

            <div className="h-8 w-px bg-gray-200/40 dark:bg-gray-600/40" />

            {user ? (
              <div className="flex items-center gap-2">
                <motion.button
                  onClick={() => navigate('/profile')}
                  className="w-10 h-10 rounded-full border border-gray-200/60 dark:border-gray-600/60 hover:bg-gray-200/40 dark:hover:bg-gray-700/40 flex items-center justify-center transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label="Profile"
                >
                  <User className="w-5 h-5 text-gray-700 dark:text-gray-200" />
                </motion.button>

                <motion.button
                  onClick={handleLogout}
                  className="flex items-center gap-2 bg-red-500 text-white px-3 py-3 rounded-full border border-red-400/60 hover:bg-red-600 transition-all duration-200 font-bold text-sm uppercase tracking-wide shadow-md"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <LogOut size={14} />
                </motion.button>
              </div>
            ) : (
              <div className="flex gap-2">
                <motion.button
                  onClick={() => navigate('/login')}
                  className="text-orange-600 dark:text-orange-400 px-4 py-2 rounded-lg border border-orange-600/60 dark:border-orange-400/60 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition font-bold text-sm uppercase tracking-wide"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Login
                </motion.button>
                <motion.button
                  onClick={() => navigate('/signup')}
                  className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-2 rounded-lg border border-orange-500/60 hover:from-orange-600 hover:to-amber-600 transition font-bold text-sm uppercase tracking-wide shadow-md"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Sign Up
                </motion.button>
              </div>
            )}
          </div>
        </div>
        </div>
      </motion.nav>

      {/* Mobile Navbar */}
      <motion.nav
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="sticky top-0 z-40 w-full md:hidden bg-white/30 dark:bg-phantom-black/20 border-b border-white/20 dark:border-white/10 shadow-xl font-sans backdrop-blur-xl"
      >
        <div className="px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg">
              <Layout className="text-white w-5 h-5" />
            </div>
            <span className="text-lg font-bold uppercase tracking-tighter text-gray-900 dark:text-white">
              SeatAlloc
            </span>
          </div>

          {/* Mobile Actions */}
          <div className="flex items-center gap-2">
            <motion.button
              onClick={toggleTheme}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 rounded-lg border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-100/40 dark:hover:bg-gray-700/40 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? (
                <Moon className="text-gray-700 dark:text-gray-300" size={20} />
              ) : (
                <Sun className="text-amber-500" size={20} />
              )}
            </motion.button>

            {user && (
              <motion.button
                onClick={() => {
                  navigate('/profile');
                  setMobileMenuOpen(false);
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-lg border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-100/40 dark:hover:bg-gray-700/40 transition-colors"
                aria-label="Profile"
              >
                <User className="text-gray-700 dark:text-gray-300" size={20} />
              </motion.button>
            )}

            <motion.button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-gray-700 dark:text-gray-300 p-2"
              whileTap={{ scale: 0.95 }}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </motion.button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        <motion.div
          initial={false}
          animate={mobileMenuOpen ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-white/60 dark:bg-phantom-black/40 border-t border-white/10 dark:border-white/5 overflow-hidden backdrop-blur-2xl"
        >
          <div className="px-4 py-4 space-y-2">
            {user ? (
              <>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.page);

                  return (
                    <motion.button
                      key={item.page}
                      onClick={() => {
                        navigate(item.page);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center gap-3 font-bold text-sm uppercase tracking-wide ${
                        active
                          ? 'bg-orange-100/60 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border border-orange-400/40'
                          : 'text-gray-700 dark:text-gray-300 border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-100/40 dark:hover:bg-gray-700/40'
                      }`}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Icon className="w-5 h-5" />
                      {item.name}
                    </motion.button>
                  );
                })}

                <motion.button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-3 rounded-lg border border-red-400/50 text-red-600 dark:text-red-400 hover:bg-red-50/40 dark:hover:bg-red-900/20 transition-all duration-200 flex items-center gap-3 font-bold text-sm uppercase tracking-wide"
                  whileTap={{ scale: 0.98 }}
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </motion.button>
              </>
            ) : (
              <>
                <motion.button
                  onClick={() => {
                    navigate('/login');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-gray-700 dark:text-gray-300 border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-100/40 dark:hover:bg-gray-700/40 rounded-lg font-bold text-sm uppercase tracking-wide transition-all"
                  whileTap={{ scale: 0.98 }}
                >
                  Login
                </motion.button>
                <motion.button
                  onClick={() => {
                    navigate('/signup');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-gray-700 dark:text-gray-300 border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-100/40 dark:hover:bg-gray-700/40 rounded-lg font-bold text-sm uppercase tracking-wide transition-all"
                  whileTap={{ scale: 0.98 }}
                >
                  Sign Up
                </motion.button>
              </>
            )}
          </div>
        </motion.div>
      </motion.nav>
    </>
  );
};

export default Navbar;

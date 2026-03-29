import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
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
  const prefersReducedMotion = useReducedMotion();

  const handleLogout = async () => {
    await logout();
    navigate('/');
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
        initial={prefersReducedMotion ? false : { y: -100, opacity: 0 }}
        animate={prefersReducedMotion ? undefined : { y: 0, opacity: 1 }}
        transition={prefersReducedMotion ? undefined : { duration: 0.5, ease: 'easeOut' }}
        className="sticky top-0 z-40 hidden md:block"
      >
        <div className="w-[95%] max-w-7xl mx-auto pt-4 transition-all duration-500">
          <div className="bg-white/50 dark:bg-black/35 backdrop-blur-sm rounded-2xl px-6 h-20 flex items-center justify-between shadow-xl shadow-black/5 border border-white/40 dark:border-white/10 font-sans">
          {/* Logo */}
          <button
            type="button"
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity rounded-md"
            onClick={() => navigate('/dashboard')}
            aria-label="Go to dashboard"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Layout className="text-white w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <span className="text-lg font-bold leading-none uppercase tracking-tighter text-gray-900 dark:text-gray-100">
                SeatAlloc
              </span>
              <span className="text-[8px] font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400"></span>
            </div>
          </button>

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
              type="button"
              onClick={toggleTheme}
              whileHover={prefersReducedMotion ? undefined : { scale: 1.05 }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
              className="w-10 h-10 rounded-full border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-200/40 dark:hover:bg-gray-700/40 flex items-center justify-center transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? (
                <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" aria-hidden="true" />
              ) : (
                <Sun className="w-5 h-5 text-amber-500" aria-hidden="true" />
              )}
            </motion.button>

            <div className="h-8 w-px bg-gray-200/40 dark:bg-gray-600/40" />

            {user ? (
              <div className="flex items-center gap-2">
                <motion.button
                  type="button"
                  onClick={() => navigate('/profile')}
                  className="w-10 h-10 rounded-full border border-gray-200/60 dark:border-gray-600/60 hover:bg-gray-200/40 dark:hover:bg-gray-700/40 flex items-center justify-center transition-colors"
                  whileHover={prefersReducedMotion ? undefined : { scale: 1.05 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                  aria-label="Profile"
                >
                  <User className="w-5 h-5 text-gray-700 dark:text-gray-200" aria-hidden="true" />
                </motion.button>

                <motion.button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2 bg-red-500 text-white px-3 py-3 rounded-full border border-red-400/60 hover:bg-red-600 transition-all duration-200 font-bold text-sm uppercase tracking-wide shadow-md"
                  whileHover={prefersReducedMotion ? undefined : { scale: 1.02 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                  aria-label="Log out"
                >
                  <LogOut size={14} aria-hidden="true" />
                </motion.button>
              </div>
            ) : (
              <div className="flex gap-2">
                <motion.button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-orange-600 dark:text-orange-400 px-4 py-2 rounded-lg border border-orange-600/60 dark:border-orange-400/60 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition font-bold text-sm uppercase tracking-wide"
                  whileHover={prefersReducedMotion ? undefined : { scale: 1.02 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                >
                  Login
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => navigate('/signup')}
                  className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-2 rounded-lg border border-orange-500/60 hover:from-orange-600 hover:to-amber-600 transition font-bold text-sm uppercase tracking-wide shadow-md"
                  whileHover={prefersReducedMotion ? undefined : { scale: 1.02 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
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
        initial={prefersReducedMotion ? false : { y: -100, opacity: 0 }}
        animate={prefersReducedMotion ? undefined : { y: 0, opacity: 1 }}
        transition={prefersReducedMotion ? undefined : { duration: 0.5, ease: 'easeOut' }}
        className="sticky top-0 z-40 w-full md:hidden bg-white/55 dark:bg-phantom-black/35 border-b border-white/20 dark:border-white/10 shadow-lg font-sans backdrop-blur-sm"
      >
        <div className="px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <button type="button" className="flex items-center gap-2 cursor-pointer rounded-md" onClick={() => navigate('/')} aria-label="Go to home">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg">
              <Layout className="text-white w-5 h-5" aria-hidden="true" />
            </div>
            <span className="text-lg font-bold uppercase tracking-tighter text-gray-900 dark:text-white">
              SeatAlloc
            </span>
          </button>

          {/* Mobile Actions */}
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              onClick={toggleTheme}
              whileHover={prefersReducedMotion ? undefined : { scale: 1.05 }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
              className="p-2 rounded-lg border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-100/40 dark:hover:bg-gray-700/40 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? (
                <Moon className="text-gray-700 dark:text-gray-300" size={20} aria-hidden="true" />
              ) : (
                <Sun className="text-amber-500" size={20} aria-hidden="true" />
              )}
            </motion.button>

            {user && (
              <motion.button
                type="button"
                onClick={() => {
                  navigate('/profile');
                  setMobileMenuOpen(false);
                }}
                whileHover={prefersReducedMotion ? undefined : { scale: 1.05 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                className="p-2 rounded-lg border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-100/40 dark:hover:bg-gray-700/40 transition-colors"
                aria-label="Profile"
              >
                <User className="text-gray-700 dark:text-gray-300" size={20} aria-hidden="true" />
              </motion.button>
            )}

            <motion.button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-gray-700 dark:text-gray-300 p-2"
              whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-menu"
            >
              {mobileMenuOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
            </motion.button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        <motion.div
          id="mobile-nav-menu"
          initial={false}
          animate={mobileMenuOpen ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3 }}
          className="bg-white/70 dark:bg-phantom-black/55 border-t border-white/10 dark:border-white/5 overflow-hidden backdrop-blur-sm"
        >
          <div className="px-4 py-4 space-y-2">
            {user ? (
              <>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.page);

                  return (
                    <motion.button
                      type="button"
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
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                    >
                      <Icon className="w-5 h-5" aria-hidden="true" />
                      {item.name}
                    </motion.button>
                  );
                })}

                <motion.button
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-3 rounded-lg border border-red-400/50 text-red-600 dark:text-red-400 hover:bg-red-50/40 dark:hover:bg-red-900/20 transition-all duration-200 flex items-center gap-3 font-bold text-sm uppercase tracking-wide"
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  Logout
                </motion.button>
              </>
            ) : (
              <>
                <motion.button
                  type="button"
                  onClick={() => {
                    navigate('/login');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-gray-700 dark:text-gray-300 border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-100/40 dark:hover:bg-gray-700/40 rounded-lg font-bold text-sm uppercase tracking-wide transition-all"
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                >
                  Login
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => {
                    navigate('/signup');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-gray-700 dark:text-gray-300 border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-100/40 dark:hover:bg-gray-700/40 rounded-lg font-bold text-sm uppercase tracking-wide transition-all"
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
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

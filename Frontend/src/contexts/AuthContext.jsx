import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  getToken, setToken, removeToken,
  getUser as getStoredUser, setUserData, clearAuth,
  migrateFromLocalStorage, getAuthHeaders
} from '../utils/tokenStorage';

const AuthContext = createContext();

// API base URL - Use environment variable if provided, otherwise default to relative path
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    // Load dark mode from localStorage on initial load
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  // ============================================================================
  // INITIALIZE AUTH ON MOUNT (Restore user session)
  // ============================================================================
  useEffect(() => {
    const initializeAuth = () => {
      try {
        // One-time migration from localStorage → sessionStorage
        migrateFromLocalStorage();

        // Get token from sessionStorage (per-tab isolation)
        const token = getToken();
        const userData = getStoredUser();

        if (token && userData) {
          // User was previously logged in - restore session
          setUser(userData);
          console.log('✅ User session restored from sessionStorage (tab-isolated)');
        } else {
          console.log('ℹ️  No saved session found');
        }
      } catch (error) {
        console.error('Error restoring session:', error);
        // Clear corrupted data
        clearAuth();
      }
      
      setLoading(false);
    };

    initializeAuth();
  }, []);

  // ============================================================================
  // PERSIST DARK MODE TO localStorage
  // ============================================================================
  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    console.log(`🌓 Dark mode ${darkMode ? 'enabled' : 'disabled'}`);
  }, [darkMode]);

  // ============================================================================
  // APPLY DARK MODE TO DOCUMENT
  // ============================================================================
  useEffect(() => {
    const htmlElement = document.documentElement;
    if (darkMode) {
      htmlElement.classList.add('dark');
    } else {
      htmlElement.classList.remove('dark');
    }
  }, [darkMode]);

  // ============================================================================
  // TOGGLE DARK MODE
  // ============================================================================
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  // ============================================================================
  // Google OAuth Login
  // ============================================================================
  const googleLogin = async (googleToken, role = null, signupToken = null) => {
    try {
      const body = { token: googleToken };
      if (role) body.role = role;
      if (signupToken) body.signup_token = signupToken;

      const response = await fetch(`${API_BASE_URL}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      // Check if response is JSON (not HTML error page)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Server returned non-JSON response. Is Flask running?');
        return { success: false, error: 'Server unavailable. Please ensure the backend is running.' };
      }

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || data.error || 'Google login failed' };
      }

      // Handle needs_role response (new Google user without role)
      if (data.status === 'needs_role' || data.needs_role) {
        console.log('🔄 New Google user — role selection required');
        return {
          success: true,
          needs_role: true,
          email: data.email,
          full_name: data.full_name,
          signup_token: data.signup_token,
          available_roles: data.available_roles,
        };
      }

      // Store token and user data in sessionStorage (per-tab isolation)
      setToken(data.token);
      setUserData(data.user);
      setUser(data.user);

      console.log('✅ Google login successful');
      return { success: true, user: data.user };
    } catch (error) {
      console.error('Google login error:', error);
      return { success: false, error: 'Server unavailable. Please ensure the backend is running.' };
    }
  };

  // ============================================================================
  // Email/Password Login
  // ============================================================================
  const login = async (email, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      // Check if response is JSON (not HTML error page)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Server returned non-JSON response. Is Flask running?');
        return { success: false, error: 'Server unavailable. Please ensure the backend is running.' };
      }

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || data.error || 'Login failed' };
      }

      // Store token and user data in sessionStorage (per-tab isolation)
      setToken(data.token);
      setUserData(data.user);
      setUser(data.user);

      console.log('✅ Email login successful');
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Server unavailable. Please ensure the backend is running.' };
    }
  };

  // ============================================================================
// Signup
// ============================================================================
const signup = async (userData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    // Check if response is JSON (not HTML error page)
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('Server returned non-JSON response. Is Flask running?');
      return { success: false, error: 'Server unavailable. Please ensure the backend is running.' };
    }

    const data = await response.json();

    if (!response.ok) {
      return { 
        success: false, 
        error: data.message || data.error || 'Signup failed' 
      };
    }

    // ✅ Auto-login on successful signup
    if (data.token && data.user) {
      // Store token and user data in sessionStorage (per-tab isolation)
      setToken(data.token);
      setUserData(data.user);
      setUser(data.user);

      console.log('✅ Signup successful - User auto-logged in');
      return { 
        success: true, 
        message: data.message || 'Signup successful. You are now logged in!',
        user: data.user 
      };
    }

    return { 
      success: false, 
      error: 'Signup response incomplete' 
    };
  } catch (error) {
    console.error('Signup error:', error);
    return { 
      success: false, 
      error: 'Server unavailable. Please ensure the backend is running.' 
    };
  }
};
  // ============================================================================
  // Logout (Clear everything)
  // ============================================================================
  const logout = async () => {
    try {
      const token = getToken();

      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear sessionStorage auth data (per-tab)
      clearAuth();
      setUser(null);
      console.log('✅ Logged out successfully');
    }
  };

  // ============================================================================
  // Get Profile
  // ============================================================================
  const getProfile = async () => {
    try {
      const token = getToken();
      if (!token) {
        return { success: false, error: 'No token found' };
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      // Check if response is JSON (not HTML error page)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Server returned non-JSON response. Is Flask running?');
        return { success: false, error: 'Server unavailable' };
      }

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || data.error || 'Failed to fetch profile' };
      }

      return { success: true, user: data.user };
    } catch (error) {
      console.error('Profile fetch error:', error);
      return { success: false, error: 'Server unavailable' };
    }
  };

  // ============================================================================
  // Update Profile
  // ============================================================================
  const updateProfile = async (username, email) => {
    try {
      const token = getToken();
      if (!token) {
        return { success: false, error: 'No token found' };
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ username, email }),
      });

      // Check if response is JSON (not HTML error page)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Server returned non-JSON response. Is Flask running?');
        return { success: false, error: 'Server unavailable' };
      }

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || data.error || 'Failed to update profile' };
      }

      // Update sessionStorage with new user data
      if (data.user) {
        setUserData(data.user);
        setUser(data.user);
      }

      return { success: true, message: data.message };
    } catch (error) {
      console.error('Profile update error:', error);
      return { success: false, error: 'Server unavailable' };
    }
  };

  const value = {
    user,
    login,
    signup,
    logout,
    getProfile,
    updateProfile,
    googleLogin,
    loading,
    darkMode,
    toggleDarkMode,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
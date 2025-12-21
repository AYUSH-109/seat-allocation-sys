import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

// API base URL
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

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
        // Get token from localStorage
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');

        if (token && userData) {
          // User was previously logged in - restore session
          setUser(JSON.parse(userData));
          console.log('✅ User session restored from localStorage');
        } else {
          console.log('ℹ️  No saved session found');
        }
      } catch (error) {
        console.error('Error restoring session:', error);
        // Clear corrupted data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
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
  const googleLogin = async (googleToken) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: googleToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Google login failed' };
      }

      // Store token and user data in localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);

      console.log('✅ Google login successful');
      return { success: true, user: data.user };
    } catch (error) {
      return { success: false, error: error.message || 'Google login failed' };
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

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Login failed' };
      }

      // Store token and user data in localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);

      console.log('✅ Email login successful');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message || 'Login failed' };
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

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Signup failed' };
      }

      return { success: true, message: data.message };
    } catch (error) {
      return { success: false, error: error.message || 'Signup failed' };
    }
  };

  // ============================================================================
  // Logout (Clear everything)
  // ============================================================================
  const logout = async () => {
    try {
      const token = localStorage.getItem('token');

      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear localStorage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
      console.log('✅ Logged out successfully');
    }
  };

  // ============================================================================
  // Get Profile
  // ============================================================================
  const getProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        return { success: false, error: 'No token found' };
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to fetch profile' };
      }

      return { success: true, user: data.user };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to fetch profile' };
    }
  };

  // ============================================================================
  // Update Profile
  // ============================================================================
  const updateProfile = async (username, email) => {
    try {
      const token = localStorage.getItem('token');
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

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to update profile' };
      }

      // Update localStorage with new user data
      if (data.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
      }

      return { success: true, message: data.message };
    } catch (error) {
      return { success: false, error: error.message || 'Failed to update profile' };
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
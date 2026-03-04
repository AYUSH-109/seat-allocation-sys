import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const GoogleLoginComponent = ({ showToast, onNeedsRole }) => {
  const navigate = useNavigate();
  const { googleLogin } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [googleAvailable, setGoogleAvailable] = React.useState(true);

  useEffect(() => {
    // Check if Google Client ID is configured
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    if (!clientId || clientId === 'your_client_id' || clientId.length < 20) {
      console.warn('⚠️ Google Client ID not configured. Hiding Google Sign-In button.');
      setGoogleAvailable(false);
      return;
    }

    // Initialize Google Sign-In when component mounts
    if (window.google) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          ux_mode: 'popup',
          auto_select: false,
          // Help diagnose origin issues
          context: 'signin',
          itp_support: true,
        });

        // Log configuration for debugging (redacted sensitive parts)
        console.log('🛠️ GSI Configured:', {
          clientId: clientId?.substring(0, 20) + '...',
          origin: window.location.origin,
          apiBase: process.env.REACT_APP_API_BASE_URL || '/'
        });

        window.google.accounts.id.renderButton(
          document.getElementById('google-signin-button'),
          {
            theme: 'outline',
            size: 'large',
            width: '100%',
            text: 'signin_with',
            locale: 'en',
          }
        );

        console.log('✅ Google Sign-In button rendered');
      } catch (error) {
        console.error('❌ Google initialization error:', error);
        // Hide Google button on error instead of showing toast
        setGoogleAvailable(false);
      }
    } else {
      console.warn('⚠️ Google API not loaded');
      setGoogleAvailable(false);
    }
  }, []);  // Remove showToast dependency to prevent re-renders

  const handleCredentialResponse = async (response) => {
    try {
      setLoading(true);

      // response.credential is the JWT token from Google
      if (!response.credential) {
        showToast('No token received from Google', 'error');
        setLoading(false);
        return;
      }

      console.log('🔐 Google token received, authenticating...');

      // Send token to backend
      const result = await googleLogin(response.credential);

      setLoading(false);

      if (result.success) {
        // Check if new user needs role selection
        if (result.needs_role) {
          console.log('🔄 Redirecting to role selection...');
          if (onNeedsRole) {
            onNeedsRole({
              google_token: response.credential,
              email: result.email,
              full_name: result.full_name,
            });
          } else {
            // Fallback: navigate to signup with Google data
            navigate('/signup', {
              state: {
                googleData: {
                  google_token: response.credential,
                  email: result.email,
                  full_name: result.full_name,
                }
              }
            });
          }
          return;
        }

        console.log('✅ Google login successful');
        showToast('Welcome! Logged in with Google', 'success');
        // Navigate to dashboard after a short delay
        setTimeout(() => {
          navigate('/dashboard');
        }, 500);
      } else {
        console.error('❌ Google login failed:', result.error);
        showToast(result.error || 'Google login failed', 'error');
      }
    } catch (error) {
      setLoading(false);
      console.error('❌ Google login error:', error);
      showToast(error.message || 'Google login error', 'error');
    }
  };

  return (
    <div className="w-full">
      {/* Google Sign-In Button Container - only show if Google is available */}
      {googleAvailable && (
        <>
          <div
            id="google-signin-button"
            className="w-full flex justify-center min-h-12"
          >
            {loading && (
              <div className="flex items-center gap-2 text-gray-600">
                <Loader2 className="animate-spin" size={20} />
                <span>Signing in with Google...</span>
              </div>
            )}
          </div>

          {/* OR Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400 font-medium">
                Or continue with email
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GoogleLoginComponent;
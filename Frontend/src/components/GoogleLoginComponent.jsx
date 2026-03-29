import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const GOOGLE_GSI_SCRIPT_ID = 'google-gsi-client-script';

const GoogleLoginComponent = ({ showToast, onNeedsRole }) => {
  const navigate = useNavigate();
  const { googleLogin } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [googleAvailable, setGoogleAvailable] = React.useState(true);

  const handleCredentialResponse = useCallback(async (response) => {
    try {
      setLoading(true);

      // response.credential is the JWT token from Google
      if (!response.credential) {
        showToast('No token received from Google', 'error');
        setLoading(false);
        return;
      }

      // Send token to backend
      const result = await googleLogin(response.credential);

      setLoading(false);

      if (result.success) {
        // Check if new user needs role selection
        if (result.needs_role) {
          if (onNeedsRole) {
            onNeedsRole({
              google_token: response.credential,
              email: result.email,
              full_name: result.full_name,
              signup_token: result.signup_token,
            });
          } else {
            // Fallback: navigate to signup with Google data
            navigate('/signup', {
              state: {
                googleData: {
                  google_token: response.credential,
                  email: result.email,
                  full_name: result.full_name,
                  signup_token: result.signup_token,
                }
              }
            });
          }
          return;
        }

        showToast('Welcome! Logged in with Google', 'success');
        // Navigate to dashboard after a short delay
        setTimeout(() => {
          navigate('/dashboard');
        }, 500);
      } else {
        showToast(result.error || 'Google login failed', 'error');
      }
    } catch (error) {
      setLoading(false);
      showToast(error.message || 'Google login error', 'error');
    }
  }, [googleLogin, navigate, onNeedsRole, showToast]);

  useEffect(() => {
    let cancelled = false;

    // Check if Google Client ID is configured
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    if (!clientId || clientId === 'your_client_id' || clientId.length < 20) {
      setGoogleAvailable(false);
      return;
    }

    const initializeGsi = () => {
      if (cancelled || !window.google) {
        if (!cancelled) setGoogleAvailable(false);
        return;
      }

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
      } catch (error) {
        // Hide Google button on error instead of showing toast
        if (!cancelled) setGoogleAvailable(false);
      }
    };

    const existingScript = document.getElementById(GOOGLE_GSI_SCRIPT_ID);
    if (window.google) {
      initializeGsi();
    } else if (existingScript) {
      existingScript.addEventListener('load', initializeGsi, { once: true });
    } else {
      const script = document.createElement('script');
      script.id = GOOGLE_GSI_SCRIPT_ID;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initializeGsi;
      script.onerror = () => {
        if (!cancelled) setGoogleAvailable(false);
      };
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [handleCredentialResponse]);

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
// ============================================================================
// Centralized Token Storage - Uses sessionStorage for per-tab isolation
// ============================================================================
// sessionStorage is per-tab: two tabs can hold different user tokens simultaneously.
// localStorage is shared across all tabs, which caused the "same data in both tabs" bug.
//
// Dark mode preference stays in localStorage (shared across tabs is desired).
// Auth tokens + user data go to sessionStorage (per-tab isolation required).
// ============================================================================

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

/**
 * Get the stored auth token for this tab.
 */
export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

/**
 * Store the auth token for this tab.
 */
export function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

/**
 * Remove the auth token for this tab.
 */
export function removeToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

/**
 * Get the stored user data for this tab.
 */
export function getUser() {
  const data = sessionStorage.getItem(USER_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Store the user data for this tab.
 */
export function setUserData(user) {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Remove the user data for this tab.
 */
export function removeUserData() {
  sessionStorage.removeItem(USER_KEY);
}

/**
 * Clear all auth data for this tab.
 */
export function clearAuth() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

/**
 * Migrate from localStorage to sessionStorage (one-time on first load).
 * If the user had an active session in localStorage, move it to sessionStorage
 * so they don't get logged out after this update.
 */
export function migrateFromLocalStorage() {
  const lsToken = localStorage.getItem(TOKEN_KEY);
  const lsUser = localStorage.getItem(USER_KEY);
  
  // Only migrate if sessionStorage is empty and localStorage has data
  if (!sessionStorage.getItem(TOKEN_KEY) && lsToken) {
    sessionStorage.setItem(TOKEN_KEY, lsToken);
    if (lsUser) {
      sessionStorage.setItem(USER_KEY, lsUser);
    }
  }
  
  // Clean up localStorage auth keys (keep darkMode there - it's meant to be shared)
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Build an Authorization header object for fetch calls.
 */
export function getAuthHeaders() {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

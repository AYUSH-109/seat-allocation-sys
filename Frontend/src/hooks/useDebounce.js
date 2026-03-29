import { useEffect, useState } from 'react';

/**
 * Custom hook for debouncing values
 * @param {*} value - The value to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {*} The debounced value
 */
export const useDebounce = (value, delay = 500) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Custom hook for throttling callbacks
 */
export const useThrottle = (callback, delay = 500) => {
  const [lastCall, setLastCall] = useState(0);

  return (...args) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      setLastCall(now);
      callback(...args);
    }
  };
};

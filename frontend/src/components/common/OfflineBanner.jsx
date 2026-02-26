/**
 * Offline Banner
 *
 * Shows a banner when the user is offline.
 */
import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      className="offline-banner"
      role="alert"
      aria-live="assertive"
    >
      <WifiOff size={18} />
      <span>You're offline. Some features may not work.</span>
    </div>
  );
}

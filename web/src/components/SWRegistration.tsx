'use client';

import { useEffect } from 'react';
import { Workbox } from 'workbox-window';

export default function SWRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const wb = new Workbox('/sw.js');

    wb.addEventListener('installed', (event) => {
      if (!event.isUpdate) {
        console.log('Service worker installed for offline use');
      } else {
        console.log('Service worker updated');
        // Optionally show a toast to refresh
        if (confirm('A new version is available. Refresh to update?')) {
          window.location.reload();
        }
      }
    });

    wb.addEventListener('waiting', () => {
      console.log('Service worker waiting to activate');
    });

    wb.addEventListener('controlling', () => {
      console.log('Service worker controlling page');
    });

    wb.register().catch((err) => {
      console.error('Service worker registration failed:', err);
    });

    return () => {
      // Cleanup not needed for Workbox
    };
  }, []);

  return null;
}

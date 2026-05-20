import { useEffect, useRef } from 'react';

interface UseVisibilityPollingOptions {
  enabled?: boolean;
  runImmediately?: boolean;
}

export function useVisibilityPolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  options: UseVisibilityPollingOptions = {},
) {
  const { enabled = true, runImmediately = true } = options;
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      if (document.visibilityState === 'visible') {
        void callbackRef.current();
      }
    };

    if (runImmediately) {
      run();
    }

    const intervalId = window.setInterval(run, intervalMs);
    document.addEventListener('visibilitychange', run);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', run);
    };
  }, [enabled, intervalMs, runImmediately]);
}

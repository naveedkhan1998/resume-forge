declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

/**
 * Resolves the Google Analytics 4 Measurement ID / Token from environment variables.
 * Supports multiple common naming conventions:
 * - VITE_GA_MEASUREMENT_ID
 * - VITE_GA4_MEASUREMENT_ID
 * - VITE_G4A_TOKEN
 * - VITE_GA_TRACKING_ID
 * - GA_MEASUREMENT_ID
 * - G4A_TOKEN
 */
export const getGaMeasurementId = (): string => {
  const env = import.meta.env;
  return (
    env.VITE_GA_MEASUREMENT_ID ||
    env.VITE_GA4_MEASUREMENT_ID ||
    env.VITE_G4A_TOKEN ||
    env.VITE_GA_TRACKING_ID ||
    (env as Record<string, any>).GA_MEASUREMENT_ID ||
    (env as Record<string, any>).GA4_MEASUREMENT_ID ||
    (env as Record<string, any>).G4A_TOKEN ||
    (env as Record<string, any>).GOOGLE_ANALYTICS_ID ||
    ''
  ).trim();
};

let isInitialized = false;

/**
 * Initializes Google Analytics 4 (gtag.js) if a Measurement ID is configured.
 */
export const initGA = (): void => {
  if (isInitialized || typeof window === 'undefined') return;

  const measurementId = getGaMeasurementId();
  if (!measurementId) {
    if (import.meta.env.DEV) {
      console.info('[Analytics] Google Analytics 4 disabled: No measurement ID found in .env (e.g. VITE_GA_MEASUREMENT_ID).');
    }
    return;
  }

  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag(...args: any[]) {
      window.dataLayer?.push(args);
    };
  }

  // Prevent duplicate script tags if already injected in index.html at build time
  const existingScript =
    typeof document !== 'undefined'
      ? document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}"]`) ||
        document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${measurementId}"]`)
      : null;

  if (!existingScript && typeof document !== 'undefined') {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);

    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      send_page_view: false, // Handled dynamically on route changes for SPA
    });
  }

  isInitialized = true;
  if (import.meta.env.DEV) {
    console.info(`[Analytics] Google Analytics 4 initialized with ID: ${measurementId}`);
  }
};

/**
 * Tracks a page view for single-page application route transitions.
 */
export const trackPageView = (path: string, title?: string): void => {
  if (typeof window === 'undefined' || !window.gtag) return;
  const measurementId = getGaMeasurementId();
  if (!measurementId) return;

  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title || document.title,
    page_location: window.location.href,
  });
};

/**
 * Tracks a custom event in GA4.
 */
export const trackEvent = (eventName: string, params?: Record<string, any>): void => {
  if (typeof window === 'undefined' || !window.gtag) return;
  const measurementId = getGaMeasurementId();
  if (!measurementId) return;

  window.gtag('event', eventName, params);
};

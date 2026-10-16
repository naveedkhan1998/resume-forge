import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { getGaMeasurementId, initGA, trackPageView, trackEvent } from './analytics';

describe('analytics service', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    (globalThis as any).window = {
      location: { href: 'http://localhost/' },
      dataLayer: [],
      gtag: undefined,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (globalThis as any).window = originalWindow;
  });

  it('resolves measurement ID or empty string gracefully', () => {
    const id = getGaMeasurementId();
    expect(typeof id).toBe('string');
  });

  it('trackPageView and trackEvent do not throw when GA is not initialized', () => {
    expect(() => trackPageView('/test')).not.toThrow();
    expect(() => trackEvent('test_event', { key: 'value' })).not.toThrow();
  });

  it('delegates trackPageView and trackEvent to window.gtag if present', () => {
    const mockGtag = vi.fn();
    (window as any).gtag = mockGtag;
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST12345');

    trackPageView('/jobs', 'Job Tracker');
    expect(mockGtag).toHaveBeenCalledWith('event', 'page_view', expect.objectContaining({
      page_path: '/jobs',
      page_title: 'Job Tracker',
    }));

    trackEvent('resume_tailored', { role: 'Software Engineer' });
    expect(mockGtag).toHaveBeenCalledWith('event', 'resume_tailored', { role: 'Software Engineer' });

    vi.unstubAllEnvs();
  });
});

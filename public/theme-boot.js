/*
 * Pre-hydration theme bootstrap. Loaded synchronously via <Script
 * strategy="beforeInteractive"> in app/layout.tsx so the html.dark class
 * is applied before the body paints — no flash of the wrong palette.
 *
 * Marketing + auth routes are intentionally light-only (designed as such).
 * Dashboard respects the user's stored preference and system preference.
 */
(function () {
  try {
    var key = 'claimrail.theme';
    var pathname = location.pathname;
    var marketingRe = /^\/(?:$|login|signup|forgot-password|reset-password|verify-email|accept-invite|status|api-docs)/;
    var isMarketing = marketingRe.test(pathname);

    var el = document.documentElement;
    if (isMarketing) {
      el.classList.remove('dark');
      el.style.colorScheme = 'light';
      return;
    }

    var stored = localStorage.getItem(key);
    var mode =
      stored === 'light' || stored === 'dark'
        ? stored
        : matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    if (mode === 'dark') el.classList.add('dark');
    else el.classList.remove('dark');
    el.style.colorScheme = mode;
  } catch (e) {
    /* storage may be blocked — default to light */
  }
})();

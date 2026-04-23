/*
 * Pre-hydration theme bootstrap. Loaded synchronously via <script src> in
 * app/layout.tsx so the html.dark class is applied before the body paints
 * — no flash of the wrong palette.
 *
 * Stays in sync with `STORAGE_KEY` in components/theme/theme-provider.tsx.
 */
(function () {
  try {
    var key = 'claimrail.theme';
    var stored = localStorage.getItem(key);
    var mode =
      stored === 'light' || stored === 'dark'
        ? stored
        : matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    var el = document.documentElement;
    if (mode === 'dark') el.classList.add('dark');
    el.style.colorScheme = mode;
  } catch (e) {
    /* storage may be blocked — default to light, fall through */
  }
})();

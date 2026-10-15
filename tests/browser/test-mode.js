// Loaded into the app (before anything else) only when the test runner opens it.
// Makes runs repeatable: the clock starts at the same moment every run, and animations are off,
// so "Saved 12:01", charts of the last 30 days and the style snapshots come out the same each time.
(() => {
  const START = new Date(2026, 0, 15, 12, 0, 0).getTime();   // 15 Jan 2026, 12:00 local time
  const began = performance.now();
  const RealDate = Date;
  const now = () => START + Math.round(performance.now() - began);
  class TestDate extends RealDate {
    constructor(...args) { if (args.length) super(...args); else super(now()); }
    static now() { return now(); }
  }
  window.Date = TestDate;

  const style = document.createElement("style");
  style.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
  document.documentElement.appendChild(style);

  // Browsers pause animation frames in a tab that isn't showing; the app waits for frames before
  // revealing a new tab's content. Use a timer instead, so a run doesn't depend on the tab being in front.
  window.requestAnimationFrame = fn => setTimeout(() => fn(performance.now()), 16);
  window.cancelAnimationFrame = id => clearTimeout(id);
  window.__testMode = true;
})();

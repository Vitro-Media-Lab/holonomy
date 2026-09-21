/**
 * Publishes the real size of the window as CSS custom properties.
 *
 * Mobile browsers make this harder than it sounds. `100vh` is the height with
 * the URL bar hidden, so it is too tall while the bar is showing. `100vw`
 * ignores whether anything is overlaying the edge. `dvh` fixes the height but
 * a browser toolbar sliding away does not reliably fire a window resize, so
 * the value changes while nothing is listening.
 *
 * visualViewport reports what is actually on screen right now, and fires when
 * that changes, which is the only source that agrees with what the player can
 * see.
 */
export function trackViewport(onChange) {
  const view = window.visualViewport;
  const root = document.documentElement;

  const apply = () => {
    const width = Math.round(view ? view.width : window.innerWidth);
    const height = Math.round(view ? view.height : window.innerHeight);
    root.style.setProperty('--app-width', `${width}px`);
    root.style.setProperty('--app-height', `${height}px`);
    onChange?.(width, height);
  };

  apply();

  if (view) {
    view.addEventListener('resize', apply);
    // A toolbar sliding away scrolls the visual viewport without resizing it.
    view.addEventListener('scroll', apply);
  }
  window.addEventListener('resize', apply);
  // Safari reports stale dimensions straight after the rotation begins.
  window.addEventListener('orientationchange', () => setTimeout(apply, 120));

  return apply;
}

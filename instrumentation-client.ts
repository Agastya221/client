/**
 * Next.js instrumentation-client.ts
 * Runs on the client side before the app initialises.
 *
 * We override console.error here to suppress the well-known React hydration
 * warning caused by browser extensions (Bitdefender TrafficLight, Honey,
 * CouponFollow, etc.) that inject `bis_skin_checked="1"` attributes into
 * every <div> in the DOM before React hydrates.
 *
 * This is NOT a real hydration bug in our code — it is the extension's fault.
 * Suppressing it keeps the console clean without hiding real errors.
 */

const _originalConsoleError = console.error.bind(console);

console.error = (...args: unknown[]) => {
  // Suppress the bis_skin_checked hydration mismatch from browser extensions.
  // The message is always a string starting with "A tree hydrated but some attributes..."
  // and the diff always includes "bis_skin_checked".
  if (
    typeof args[0] === "string" &&
    args[0].includes("bis_skin_checked")
  ) {
    return;
  }

  // Also suppress if the hydration mismatch message mentions bis_skin_checked
  // in any argument (React sometimes passes the diff as the second argument).
  if (
    args.some(
      (arg) =>
        typeof arg === "string" &&
        (arg.includes("bis_skin_checked") ||
          (arg.includes("hydrat") && arg.includes("bis")))
    )
  ) {
    return;
  }

  _originalConsoleError(...args);
};

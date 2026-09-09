export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const originalWarn = console.warn;
    console.warn = function (...args: any[]) {
      if (
        typeof args[0] === 'string' &&
        args[0].includes('Node.js 20 and below are deprecated')
      ) {
        return;
      }
      originalWarn.apply(console, args);
    };
  }
}

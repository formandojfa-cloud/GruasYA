export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DISPATCH_TICKER !== "off") {
    const { startDispatchTicker } = await import("./lib/ticker");
    startDispatchTicker();
  }
}

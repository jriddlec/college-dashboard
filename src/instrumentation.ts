/** Server start-up: background reminders (only when NOTIFY_URL and STATE_DIR are set). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startReminders } = await import("./lib/reminders");
  startReminders();
}

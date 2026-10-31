// Process-wide gate in front of every Gemini call. Spaces call starts to stay under a
// requests-per-minute quota (rpm 0 = no spacing), and when any call gets a 429, pause() holds
// every other call too - so one rate-limit answer doesn't turn into a burst of failed ones.
const sleep = ms => new Promise(r => setTimeout(r, ms));

export default function createRateGate(rpm) {
  let nextStart = 0, pausedUntil = 0;
  return {
    async wait() {
      for (;;) {
        const now = Date.now(), at = Math.max(nextStart, pausedUntil);
        if (at <= now) { nextStart = now + (rpm > 0 ? 60000 / rpm : 0); return; }
        await sleep(at - now);
      }
    },
    pause(ms) { pausedUntil = Math.max(pausedUntil, Date.now() + ms); }
  };
}

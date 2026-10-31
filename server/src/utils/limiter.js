// Tiny FIFO concurrency limiter: at most `max` tasks run at once, the rest wait in order.
// run(fn) resolves with fn's result; fn receives how long it waited for a slot (ms).
export default function createLimiter(max) {
  const queue = [];
  const l = {
    max, active: 0,
    get waiting() { return queue.length; },
    run(fn) {
      const enqueued = performance.now();
      return new Promise((resolve, reject) => {
        queue.push(() => {
          l.active++;
          Promise.resolve().then(() => fn(performance.now() - enqueued)).then(resolve, reject)
            .finally(() => { l.active--; next(); });
        });
        next();
      });
    }
  };
  function next() { while (l.active < l.max && queue.length) queue.shift()(); }
  return l;
}

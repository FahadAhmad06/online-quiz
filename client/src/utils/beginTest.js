import save from './save';
// Stores the test the server gave us (no correct answers inside) so the page can run it.
export default function beginTest(p) {
  save('qr_test', {
    attemptId: p.attemptId, run: p.run, preview: !!p.preview, perQ: p.perQ, idx: 0,
    answers: p.run.map(() => -1), qEnd: p.perQ ? Date.now() + p.perQ * 1000 : 0
  }, sessionStorage);
}

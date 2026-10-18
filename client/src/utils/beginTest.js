import save from './save';
// Stores the test the server gave us (no correct answers inside) so the page can run it.
// idx/qEnd/answers now come from the server — it's the authority on timing, not the client.
export default function beginTest(p) {
  save('qr_test', {
    attemptId: p.attemptId, run: p.run, preview: !!p.preview, perQ: p.perQ,
    idx: p.idx, answers: p.answers, qEnd: p.qEnd ? new Date(p.qEnd).getTime() : 0
  }, sessionStorage);
}

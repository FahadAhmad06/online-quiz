import app from '../src/app.js';
import connectDb from '../src/db.js';
// Vercel serverless entry: no app.listen() here, just hand each request to Express
// once the (cached) DB connection is ready.
export default async function handler(req, res) {
  await connectDb();
  app(req, res);
}

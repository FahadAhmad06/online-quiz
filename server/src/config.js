import 'dotenv/config';
const need = k => { if (!process.env[k]) throw new Error('Missing environment variable: ' + k); return process.env[k]; };
export default {
  port: process.env.PORT || 5000,
  mongoUri: need('MONGO_URI'),
  jwtSecret: need('JWT_SECRET'),
  ownerEmail: need('OWNER_EMAIL').trim().toLowerCase(),
  ownerPassword: need('OWNER_PASSWORD'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173'
};

import jwt from 'jsonwebtoken';
import config from '../config.js';
export default function signToken(payload) { return jwt.sign(payload, config.jwtSecret, { expiresIn: '12h' }); }

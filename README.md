# QuizRoom (React + Express + MongoDB)

## Run (development)
1. Start MongoDB (local `mongod`, or a free MongoDB Atlas URI).
2. Server:
   cd server && cp .env.example .env     # edit MONGO_URI, JWT_SECRET, OWNER_EMAIL, OWNER_PASSWORD
   npm install && npm run dev            # http://localhost:5000
3. Client (new terminal):
   cd client && npm install && npm run dev   # http://localhost:5173

## Run (production, one server)
   cd client && npm install && npm run build
   cd ../server && npm install && npm start   # serves the React app and the API on PORT

Owner login = OWNER_EMAIL / OWNER_PASSWORD from server/.env (the owner is not stored in the database).
Other admins are stored in MongoDB with bcrypt-hashed passwords.

## Deploy to Vercel (two projects)

**Server** - new Vercel project, root directory `server`. It deploys as a serverless function
(`server/api/index.js`, routed by `server/vercel.json`); no `npm start` needed. Set these in
Project Settings -> Environment Variables (see `server/.env.example`): `MONGO_URI`, `JWT_SECRET`,
`OWNER_EMAIL`, `OWNER_PASSWORD`, `CLIENT_ORIGIN` (the client project's URL, once you have it).

**Client** - new Vercel project, root directory `client`. Vite builds automatically; set
`VITE_API_URL` to the server project's URL (see `client/.env.example`), then redeploy.

Deploy the server first, use its URL for `CLIENT_ORIGIN`/`VITE_API_URL`, then deploy the client.

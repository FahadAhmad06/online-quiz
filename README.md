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

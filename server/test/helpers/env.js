// Must be imported before anything that loads src/config.js. Points dotenv at a file that does not
// exist so the real .env (and its secrets / production MONGO_URI) is never read by tests.
process.env.DOTENV_CONFIG_PATH = '__no_env_file_for_tests__';
process.env.MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27999/quizroom_test';
process.env.JWT_SECRET = 'test-secret';
process.env.OWNER_EMAIL = 'owner@test.local';
process.env.OWNER_PASSWORD = 'test-password';
process.env.GEMINI_API_KEY = 'fake-test-key';
process.env.GEMINI_MODEL = process.env.GEMINI_MODEL_TEST || 'gemini-test-model';
process.env.AI_RETRY_BASE_DELAY_MS ??= '20';

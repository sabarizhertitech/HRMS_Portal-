require('dotenv').config();
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT;
const JWT_SECRET = process.env.JWT_SECRET;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";
const CHAT_MAX_INPUT_CHARS = Number(process.env.CHAT_MAX_INPUT_CHARS || 1000);
const CHAT_TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS || 30000);
const CHAT_MEMORY_TURNS = Number(process.env.CHAT_MEMORY_TURNS || 6);
const CHAT_MAX_STORED_MESSAGES = Number(process.env.CHAT_MAX_STORED_MESSAGES || 200);

module.exports = {
  MONGODB_URI,
  PORT,
  JWT_SECRET,
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
  CHAT_MAX_INPUT_CHARS,
  CHAT_TIMEOUT_MS,
  CHAT_MEMORY_TURNS,
  CHAT_MAX_STORED_MESSAGES,
};

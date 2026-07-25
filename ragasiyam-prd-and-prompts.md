# Ragasiyam — PRD

## 1. Overview
Ragasiyam is a Claude/ChatGPT-style chatbot: conversational chat, RAG over uploaded documents, persistent chat history, and image understanding as a stretch feature. Built as a task/assessment, deadline Monday, from a blank repo. No written spec exists — this PRD is derived from a verbal brief, so scope is deliberately locked now to prevent drift.

## 2. Goals
- Demonstrate a working end-to-end RAG pipeline (upload → chunk → embed → retrieve → grounded answer).
- Demonstrate persistent multi-turn chat.
- Ship something functional by Monday over something architecturally ideal.

## 3. Non-goals (explicitly out of scope)
- Multi-tenant user isolation.
- Production-grade rate limiting, billing, or cost controls.
- Provider failover / multi-LLM abstraction.
- Polished custom UI design.
- Auth beyond a basic session ID (unless the evaluator specifically asks).

## 4. Features
**Must-have (graded on these):**
1. Conversational chat via LLM.
2. Document upload → RAG: retrieval must be grounded — if no relevant chunk is found, the bot says so instead of hallucinating.
3. Persistent chat history per session (MongoDB).
4. App is deployed/running (satisfies "available anytime").

**Nice-to-have (only after must-haves are solid):**
5. Image upload + vision understanding (Gemini handles this natively).
6. Streaming responses.

## 5. Tech stack
| Layer | Choice |
|---|---|
| LLM | Gemini Flash (free tier) — chat + vision in one API |
| RAG framework | LangChain or LlamaIndex |
| Embeddings | Hosted (Cohere free embed or Gemini embeddings) — not self-hosted, to save setup time |
| Vector DB | Qdrant (local via Docker) |
| Chat history DB | MongoDB Atlas (free cloud cluster) |
| Backend | FastAPI |
| Frontend | Minimal HTML/fetch or lightweight React |

## 6. Architecture
Frontend → FastAPI (`/chat`, `/upload`) → `/chat` checks Qdrant for relevant chunks first, then calls Gemini with that context; both endpoints log to MongoDB Atlas. `/upload` chunks documents, embeds them, and writes vectors to Qdrant.

## 7. Success criteria
- A user can upload a document and ask a question about it, and get a correct, grounded answer.
- A user can ask something unrelated to the uploaded docs and the bot doesn't fabricate an answer from them.
- Chat history persists across messages in a session.
- (Stretch) A user can upload an image and get a relevant description/answer.

## 8. Timeline
- **Day 1 (today):** Chat loop + Mongo persistence working end-to-end.
- **Day 2:** Full RAG pipeline (upload → chunk → embed → Qdrant → retrieval → grounded chat).
- **Day 3 (Monday, before deadline):** Polish, streaming if time allows, image support if time allows, test the "no relevant context" fallback case.

---

# Execution prompts

Use these in order with your coding assistant (e.g. Claude Code). Each builds on the last — don't skip ahead, verify each step works before moving on.

### Prompt 1 — Repo scaffold + basic chat loop
```
Scaffold a FastAPI project called "ragasiyam". Set up:
- A `/chat` POST endpoint that accepts {session_id, message} and calls the
  Gemini Flash API (use google-generativeai SDK), returning the model's reply.
- Environment variable config via .env (GEMINI_API_KEY).
- A minimal single-page HTML frontend (plain JS fetch, no framework) with a
  text input and a message list, calling /chat.
- requirements.txt and a README with setup steps.
Keep it minimal — no database yet, no RAG yet. Just prove the chat loop works
end to end: browser -> FastAPI -> Gemini -> back to browser.
```

### Prompt 2 — MongoDB persistence
```
Add MongoDB Atlas persistence to the existing FastAPI app:
- A `chats` collection storing {session_id, role, content, timestamp} per message.
- /chat should: save the incoming user message, load prior messages for that
  session_id to include as conversation context, call Gemini, save the
  assistant's reply, and return it.
- Add a GET /history/{session_id} endpoint returning the full message list.
- Use pymongo or motor, connection string from .env (MONGODB_URI).
- Update the frontend to generate a session_id client-side (a JS variable
  or a URL query param is enough for this demo) and load/display prior
  history for that session on page load.
```

### Prompt 3 — Document upload + RAG pipeline
```
Add a RAG pipeline to the FastAPI app:
- POST /upload accepting a PDF or text file. Use LangChain's document
  loaders and a RecursiveCharacterTextSplitter (chunk_size ~800, overlap ~100).
- Embed chunks using [Cohere free embed API / Gemini embeddings — pick one]
  and store them in a local Qdrant instance (docker-compose service),
  tagged with session_id and source filename.
- Modify /chat: before calling Gemini, embed the user's message, do a
  similarity search against Qdrant scoped to that session_id, and if
  relevant chunks are found (above a similarity threshold), inject them
  into the prompt as context with clear instructions to answer only from
  that context. If no relevant chunks are found, tell Gemini to answer
  normally OR explicitly say it doesn't have relevant document context —
  don't let it silently hallucinate from irrelevant chunks.
- Add a docker-compose.yml running Qdrant locally.
- Add file upload UI to the frontend (a simple <input type="file">).
```

### Prompt 4 — Grounding test + polish
```
Add a manual test script (or a few example curl commands in the README)
that: (1) uploads a sample document, (2) asks a question answerable from
it and checks the answer is grounded, (3) asks an unrelated question and
checks the bot does NOT fabricate an answer from the uploaded document.
Then, if time allows: add streaming responses from /chat using Server-Sent
Events, and add image upload support to /chat using Gemini's vision input
(accept an image file alongside the text message).
```

---

**Reminder on sequencing:** don't run Prompt 3 before Prompt 1 and 2 are verified working. Each prompt assumes the previous layer is solid — debugging RAG on top of a broken chat loop wastes the time you don't have.

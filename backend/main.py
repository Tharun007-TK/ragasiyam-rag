"""
Ragasiyam — Step 3: RAG pipeline
FastAPI -> MongoDB (history) -> Qdrant (vector search) -> Gemini Flash

Design notes:
- Qdrant startup check retries up to 10 x 2s (20s total) to handle Docker warmup lag.
- ensure_collection() is also called lazily before every upload as a fallback guard.
"""

import os
import uuid
import tempfile
import asyncio
import threading
import json
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
import google.generativeai as genai
import jwt
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from motor.motor_asyncio import AsyncIOMotorClient
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue,
)
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document
from dotenv import load_dotenv
import groq
from google.api_core.exceptions import ResourceExhausted

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY   = os.getenv("GROQ_API_KEY")
MONGODB_URI    = os.getenv("MONGODB_URI")
QDRANT_HOST    = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT    = int(os.getenv("QDRANT_PORT", "6333"))
JWT_SECRET     = os.getenv("JWT_SECRET")

if not GEMINI_API_KEY: raise RuntimeError("GEMINI_API_KEY not set in .env")
if not MONGODB_URI:    raise RuntimeError("MONGODB_URI not set in .env")
if not JWT_SECRET:     raise RuntimeError("JWT_SECRET not set in .env")

limiter = Limiter(key_func=get_remote_address)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

# ── Gemini ────────────────────────────────────────────────────────────────────
genai.configure(api_key=GEMINI_API_KEY)
# We use the Gemini 2.5 Flash model for chat (to stay within free tier limits)
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
EMBED_MODEL = os.getenv("EMBED_MODEL", "models/gemini-embedding-2")   # 768-dim, free tier

# ── MongoDB ───────────────────────────────────────────────────────────────────
mongo_client = AsyncIOMotorClient(MONGODB_URI)
db           = mongo_client["ragasiyam"]
chats_col    = db["chats"]

# ── Qdrant ────────────────────────────────────────────────────────────────────
COLLECTION_NAME      = "ragasiyam_documents"
VECTOR_SIZE          = 3072   # matches gemini-embedding-2
SIMILARITY_THRESHOLD = 0.65   # cosine score below this = not relevant
TOP_K                = 4      # chunks to retrieve

qdrant   = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)

# ── FastAPI ───────────────────────────────────────────────────────────────────
app = FastAPI(title="Ragasiyam", version="0.3.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def get_current_user_or_session(
    request: Request,
    token: str = Depends(oauth2_scheme)
):
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user_id = payload.get("sub")
            if user_id:
                return user_id
        except jwt.PyJWTError:
            pass # fallback to session_id if token is invalid or expired
            
    # Fallback to session_id (used for guests)
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=401, detail="Unauthenticated: No valid JWT or X-Session-ID provided")
    
    # Prefix guest session IDs to avoid collision with real user IDs in the DB
    return f"guest_{session_id}"

app.mount("/static", StaticFiles(directory="static"), name="static")


def ensure_collection():
    """Create the Qdrant collection if it doesn't exist (idempotent)."""
    existing = {c.name for c in qdrant.get_collections().collections}
    if COLLECTION_NAME not in existing:
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )


@app.on_event("startup")
async def startup():
    """Attempt to create Qdrant collection on startup with retries (Docker warmup lag)."""
    import time
    for attempt in range(10):
        try:
            await asyncio.to_thread(ensure_collection)
            return
        except Exception as exc:
            if attempt < 9:
                await asyncio.sleep(2)
            else:
                # Non-fatal: collection will be created lazily on first /upload
                print(f"[startup] Qdrant not ready after 10 attempts: {exc}")


@app.get("/")
async def root():
    return FileResponse("static/index.html")


# ── Schemas ───────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str
    grounded: bool   # True = RAG context was injected

class MessageOut(BaseModel):
    role: str
    content: str
    timestamp: str


# ── Embedding helper (sync, run in thread pool) ───────────────────────────────
def _embed_sync(text: str, task_type: str) -> list[float]:
    result = genai.embed_content(
        model=EMBED_MODEL,
        content=text,
        task_type=task_type,
    )
    return result["embedding"]

async def embed(text: str, task_type: str = "retrieval_document") -> list[float]:
    return await asyncio.to_thread(_embed_sync, text, task_type)


# ── MongoDB helpers ───────────────────────────────────────────────────────────
async def load_history(user_id: str) -> list[dict]:
    """Return chat history in Gemini SDK format."""
    cursor = chats_col.find(
        {"user_id": user_id},
        {"_id": 0, "role": 1, "content": 1},
    ).sort("timestamp", 1)

    history = []
    async for doc in cursor:
        gemini_role = "model" if doc["role"] == "assistant" else "user"
        history.append({"role": gemini_role, "parts": [doc["content"]]})
    return history

async def save_message(user_id: str, role: str, content: str):
    await chats_col.insert_one({
        "user_id":    user_id,
        "role":       role,
        "content":    content,
        "timestamp":  datetime.now(timezone.utc),
    })


# ── POST /upload ──────────────────────────────────────────────────────────────
@app.post("/upload")
@limiter.limit("20/minute")
async def upload(request: Request, file: UploadFile = File(...), user_id: str = Depends(get_current_user_or_session)):
    filename = file.filename or "document"
    
    if file.content_type not in ["application/pdf", "text/plain"]:
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are allowed.")
    
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit.")

    # Load with LangChain
    if filename.lower().endswith(".pdf"):
        # PyPDFLoader needs a real file path
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        try:
            from langchain_community.document_loaders import PyPDFLoader
            loader = PyPDFLoader(tmp_path)
            docs   = await asyncio.to_thread(loader.load)
        finally:
            os.unlink(tmp_path)
    else:
        # Plain text / markdown
        text = content.decode("utf-8", errors="replace")
        docs = [Document(page_content=text, metadata={"source": filename})]

    # Chunk
    chunks = splitter.split_documents(docs)
    if not chunks:
        raise HTTPException(400, "No content could be extracted from the file.")

    # Embed + upsert into Qdrant (lazy collection creation as fallback)
    await asyncio.to_thread(ensure_collection)
    points = []
    for i, chunk in enumerate(chunks):
        vector = await embed(chunk.page_content, "retrieval_document")
        points.append(PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload={
                "user_id":     user_id,
                "source":      filename,
                "chunk_index": i,
                "text":        chunk.page_content,
            },
        ))

    await asyncio.to_thread(
        qdrant.upsert, collection_name=COLLECTION_NAME, points=points
    )

    return {
        "status": "ok",
        "file":   filename,
        "chunks": len(chunks),
    }


# ── POST /chat ────────────────────────────────────────────────────────────────
@app.post("/chat", response_model=ChatResponse)
@limiter.limit("20/minute")
async def chat(request: Request, req: ChatRequest, user_id: str = Depends(get_current_user_or_session)):
    if not req.message.strip():
        raise HTTPException(400, "message cannot be empty")

    # Persist user turn
    await save_message(user_id, "user", req.message)

    # 1. Embed the query and search Qdrant (scoped to this session)
    query_vector = await embed(req.message, "retrieval_query")

    results = await asyncio.to_thread(
        qdrant.search,
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
        query_filter=Filter(must=[
            FieldCondition(key="user_id", match=MatchValue(value=user_id))
        ]),
        limit=TOP_K,
        with_payload=True,
    )

    relevant = [r for r in results if r.score >= SIMILARITY_THRESHOLD]
    grounded = len(relevant) > 0

    # 2. Load prior conversation history
    history      = await load_history(user_id)
    prior_history = history[:-1]   # exclude the turn we just saved

    model        = genai.GenerativeModel(MODEL_NAME)
    chat_session = model.start_chat(history=prior_history)

    # 3. Build the prompt
    if grounded:
        context_text = "\n\n---\n\n".join(
            f"[Source: {r.payload['source']}, chunk {r.payload['chunk_index'] + 1}]\n"
            f"{r.payload['text']}"
            for r in relevant
        )
        prompt = (
            "You are a helpful assistant. Answer the user's question using ONLY "
            "the document excerpts provided below.\n"
            "If the answer is not contained in the excerpts, respond with exactly: "
            "\"I don't have that information in the uploaded documents.\"\n"
            "Do NOT use any knowledge outside of the excerpts below.\n\n"
            f"=== Document Excerpts ===\n{context_text}\n"
            f"=== End of Excerpts ===\n\n"
            f"User question: {req.message}"
        )
    else:
        # No relevant docs — answer as a normal conversational assistant
        # Do NOT mention or draw from any uploaded documents
        prompt = req.message

    try:
        response = chat_session.send_message(prompt)
        reply_text = response.text
        provider = "gemini"
    except Exception as exc:
        is_429 = isinstance(exc, ResourceExhausted) or "429" in str(exc) or "ResourceExhausted" in str(exc)
        if is_429 and GROQ_API_KEY:
            print("[INFO] Gemini rate limit hit (429), falling back to Groq...")
            # Convert Gemini history format to Groq format
            groq_messages = []
            for m in prior_history:
                groq_role = "assistant" if m["role"] == "model" else "user"
                groq_messages.append({"role": groq_role, "content": m["parts"][0]})
            groq_messages.append({"role": "user", "content": prompt})
            
            client = groq.AsyncGroq(api_key=GROQ_API_KEY)
            groq_res = await client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=groq_messages,
            )
            reply_text = groq_res.choices[0].message.content
            provider = "groq"
        else:
            raise HTTPException(502, f"Gemini error: {exc}") from exc

    print(f"[INFO] Chat request successfully served by: {provider}")

    await save_message(user_id, "assistant", reply_text)

    return ChatResponse(reply=reply_text, grounded=grounded)


# ── GET /history ─────────────────────────────────────────────────
@app.get("/history", response_model=list[MessageOut])
async def get_history(user_id: str = Depends(get_current_user_or_session)):
    cursor = chats_col.find(
        {"user_id": user_id},
        {"_id": 0, "role": 1, "content": 1, "timestamp": 1},
    ).sort("timestamp", 1)

    messages = []
    async for doc in cursor:
        messages.append(MessageOut(
            role=doc["role"],
            content=doc["content"],
            timestamp=doc["timestamp"].isoformat(),
        ))
    return messages

    return messages


# ── GET /health ───────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    # MongoDB ping
    try:
        await mongo_client.admin.command("ping")
        mongo_ok = "ok"
    except Exception as e:
        mongo_ok = f"error: {e}"

    # Qdrant collection info
    try:
        info = qdrant.get_collection(COLLECTION_NAME)
        qdrant_ok = f"ok ({info.points_count} vectors)"
    except Exception as e:
        qdrant_ok = f"error: {e}"

    return {
        "status": "ok",
        "model":  MODEL_NAME,
        "embed":  EMBED_MODEL,
        "mongo":  mongo_ok,
        "qdrant": qdrant_ok,
    }


# ── POST /chat/stream  (Server-Sent Events) ────────────────────────────────────────
@app.post("/chat/stream")
@limiter.limit("20/minute")
async def chat_stream(request: Request, req: ChatRequest, user_id: str = Depends(get_current_user_or_session)):
    """Same RAG logic as /chat, but streams the reply via SSE chunks."""
    if not req.message.strip():
        raise HTTPException(400, "message cannot be empty")

    await save_message(user_id, "user", req.message)

    # RAG retrieval (same as /chat)
    query_vector = await embed(req.message, "retrieval_query")
    results = await asyncio.to_thread(
        qdrant.search,
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
        query_filter=Filter(must=[
            FieldCondition(key="user_id", match=MatchValue(value=user_id))
        ]),
        limit=TOP_K,
        with_payload=True,
    )
    relevant = [r for r in results if r.score >= SIMILARITY_THRESHOLD]
    grounded = len(relevant) > 0

    history      = await load_history(user_id)
    prior_history = history[:-1]

    model_obj = genai.GenerativeModel(MODEL_NAME)

    if grounded:
        context_text = "\n\n---\n\n".join(
            f"[Source: {r.payload['source']}, chunk {r.payload['chunk_index'] + 1}]\n"
            f"{r.payload['text']}"
            for r in relevant
        )
        prompt = (
            "You are a helpful assistant. Answer the user's question using ONLY "
            "the document excerpts provided below.\n"
            "If the answer is not contained in the excerpts, respond with exactly: "
            "\"I don't have that information in the uploaded documents.\"\n"
            "Do NOT use any knowledge outside of the excerpts below.\n\n"
            f"=== Document Excerpts ===\n{context_text}\n"
            f"=== End of Excerpts ===\n\n"
            f"User question: {req.message}"
        )
    else:
        prompt = req.message

    # Bridge sync Gemini streaming -> async SSE via thread + Queue
    loop = asyncio.get_event_loop()
    q: asyncio.Queue = asyncio.Queue()

    def gemini_thread():
        try:
            chat_session = model_obj.start_chat(history=prior_history)
            response = chat_session.send_message(prompt, stream=True)
            for chunk in response:
                if chunk.text:
                    asyncio.run_coroutine_threadsafe(q.put(("chunk", chunk.text)), loop)
        except Exception as exc:
            asyncio.run_coroutine_threadsafe(q.put(("error", str(exc))), loop)
        finally:
            asyncio.run_coroutine_threadsafe(q.put(("done", None)), loop)

    threading.Thread(target=gemini_thread, daemon=True).start()

    async def event_generator():
        full_reply = ""
        while True:
            kind, data = await q.get()
            if kind == "chunk":
                full_reply += data
                payload = json.dumps({"text": data, "done": False})
                yield f"data: {payload}\n\n"
            elif kind == "error":
                yield f"data: {json.dumps({'error': data, 'done': True})}\n\n"
                break
            elif kind == "done":
                # Persist the complete reply now that streaming finished
                await save_message(user_id, "assistant", full_reply)
                final = json.dumps({"text": "", "done": True, "grounded": grounded})
                yield f"data: {final}\n\n"
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering if behind proxy
        },
    )

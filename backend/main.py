"""
Ragasiyam — Step 3: RAG pipeline
FastAPI -> MongoDB (history) -> Qdrant (vector search) -> Gemini Flash

Design notes:
- Qdrant startup check retries up to 10 x 2s (20s total) to handle Docker warmup lag.
- ensure_collection() is also called lazily before every upload as a fallback guard.
"""

import os
import uuid
import base64
import tempfile
import asyncio
import threading
import json
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Request, BackgroundTasks
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
uploads_col  = db["uploads"]
memory_col   = db["user_memory"]

# ── Qdrant ────────────────────────────────────────────────────────────────────
COLLECTION_NAME      = "ragasiyam_documents_cohere"
VECTOR_SIZE          = 1024   # matches cohere embed-english-v3.0
SIMILARITY_THRESHOLD = 0.55   # cosine score below this = not relevant enough to inject as RAG context
TOP_K                = 4      # chunks to retrieve

# ── Cohere ────────────────────────────────────────────────────────────────────
import cohere
COHERE_API_KEY = os.getenv("COHERE_API_KEY", "")
# Fallback to empty string or a dummy key to prevent startup crash if missing
co = cohere.Client(api_key=COHERE_API_KEY if COHERE_API_KEY else "dummy_key")

QDRANT_URL     = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")

if QDRANT_URL and QDRANT_API_KEY:
    print(f"[init] QdrantClient config: url={QDRANT_URL}, prefer_grpc=False, timeout=60")
    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, prefer_grpc=False, timeout=60)
else:
    print(f"[init] QdrantClient config: host={QDRANT_HOST}, port={QDRANT_PORT}, prefer_grpc=False, timeout=60")
    qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT, prefer_grpc=False, timeout=60)
splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)

# ── FastAPI ───────────────────────────────────────────────────────────────────
app = FastAPI(title="Ragasiyam", version="0.3.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"] + ([os.getenv("FRONTEND_URL")] if os.getenv("FRONTEND_URL") else []),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def get_current_user_or_session(
    request: Request,
    token: str = Depends(oauth2_scheme)
):
    print(f"[debug auth] token: {token}")
    print(f"[debug auth] request headers: {request.headers}")
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user_id = payload.get("sub")
            if user_id:
                print(f"[debug auth] success with token for user: {user_id}")
                return user_id
        except jwt.PyJWTError as e:
            print(f"[debug auth] jwt error: {e}")
            pass # fallback to session_id if token is invalid or expired
            
    # Fallback to session_id (used for guests)
    session_id = request.headers.get("X-Session-ID")
    print(f"[debug auth] session_id header: {session_id}")
    if not session_id:
        raise HTTPException(status_code=401, detail="Unauthenticated: No valid JWT or X-Session-ID provided")
    
    # Prefix guest session IDs to avoid collision with real user IDs in the DB
    return f"guest_{session_id}"

app.mount("/static", StaticFiles(directory="static"), name="static")


def ensure_collection():
    if not qdrant.collection_exists(COLLECTION_NAME):
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )
    # Always try to create the index to support Qdrant Cloud filtering requirements
    try:
        qdrant.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name="user_id",
            field_schema="keyword"
        )
    except Exception as e:
        pass
        
    try:
        qdrant.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name="session_id",
            field_schema="keyword"
        )
    except Exception as e:
        pass


@app.on_event("startup")
async def startup():
    """Attempt to create Qdrant collection on startup with retries (Docker warmup lag)."""
    import time
    
    # Standalone diagnostic test
    print("[startup] Running standalone Qdrant connection test...")
    try:
        collections = await asyncio.to_thread(qdrant.get_collections)
        print(f"[startup] Standalone test SUCCESS. Collections found: {len(collections.collections)}")
    except Exception as e:
        print(f"[startup] Standalone test FAILED: {type(e).__name__}: {e}")
    collection_ready = False
    for attempt in range(10):
        try:
            await asyncio.to_thread(ensure_collection)
            collection_ready = True
            break
        except Exception as exc:
            if attempt < 9:
                await asyncio.sleep(2)
            else:
                # Non-fatal: collection will be created lazily on first /upload
                print(f"[startup] Qdrant not ready after 10 attempts: {exc}")

    if collection_ready:
        print("[startup] Running standalone Qdrant trivial upsert test...")
        try:
            dummy_point = PointStruct(
                id=str(uuid.uuid4()),
                vector=[0.0] * VECTOR_SIZE,
                payload={"test": True}
            )
            await asyncio.to_thread(
                qdrant.upsert, collection_name=COLLECTION_NAME, points=[dummy_point]
            )
            print("[startup] Trivial upsert test SUCCESS.")
        except Exception as e:
            print(f"[startup] Trivial upsert test FAILED: {type(e).__name__}: {e}")


@app.get("/")
async def root():
    return FileResponse("static/index.html")


# ── Schemas ───────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    session_id: str = ""   # UUID generated by frontend per conversation
    model: str = "gemini-2.5-flash"

class ChatResponse(BaseModel):
    reply: str
    grounded: bool   # True = RAG context was injected

class MessageOut(BaseModel):
    role: str
    content: str
    timestamp: str

class SessionOut(BaseModel):
    session_id: str
    title: str
    created_at: str
    message_count: int

class MemoryOut(BaseModel):
    id: str
    fact: str
    source_session_id: str
    created_at: str


# ── Embedding helper (sync, run in thread pool) ───────────────────────────────
def _embed_sync(text: str, task_type: str) -> list[float]:
    import time
    for attempt in range(5):
        try:
            response = co.embed(
                texts=[text],
                model="embed-english-v3.0",
                input_type=task_type,
            )
            return response.embeddings[0]
        except Exception as e:
            if attempt < 4:
                time.sleep(2 ** attempt)
            else:
                raise e

def _embed_batch_sync(texts: list[str], task_type: str) -> list[list[float]]:
    import time
    for attempt in range(5):
        try:
            response = co.embed(
                texts=texts,
                model="embed-english-v3.0",
                input_type=task_type,
            )
            return response.embeddings
        except Exception as e:
            if attempt < 4:
                time.sleep(2 ** attempt)
            else:
                raise e

async def embed(text: str, task_type: str = "search_document") -> list[float]:
    return await asyncio.to_thread(_embed_sync, text, task_type)

async def embed_batch(texts: list[str], task_type: str = "search_document") -> list[list[float]]:
    return await asyncio.to_thread(_embed_batch_sync, texts, task_type)


# ── MongoDB helpers ───────────────────────────────────────────────────────────
async def load_history(user_id: str, session_id: str = "") -> list[dict]:
    """Return chat history in Gemini SDK format, scoped to a session if provided."""
    query: dict = {"user_id": user_id}
    if session_id:
        query["session_id"] = session_id

    cursor = chats_col.find(
        query,
        {"_id": 0, "role": 1, "content": 1},
    ).sort("timestamp", 1)

    history = []
    async for doc in cursor:
        gemini_role = "model" if doc["role"] == "assistant" else "user"
        history.append({"role": gemini_role, "parts": [doc["content"]]})
    return history

async def save_message(user_id: str, role: str, content: str, session_id: str = ""):
    await chats_col.insert_one({
        "user_id":    user_id,
        "role":       role,
        "content":    content,
        "session_id": session_id,
        "timestamp":  datetime.now(timezone.utc),
    })

async def generate_chat_title(session_id: str, user_id: str, user_msg: str, assistant_msg: str, image_filename: str = None):
    """Background task to generate a title for a new session."""
    try:
        if not GROQ_API_KEY:
            raise ValueError("No GROQ_API_KEY")
        
        is_image_msg = image_filename or user_msg.strip().lower().startswith("[image]")
        
        if is_image_msg:
            # Don't pass the raw placeholder, base title purely on assistant's semantic response
            prompt_user_context = "User uploaded an image."
        else:
            prompt_user_context = f"User: {user_msg}"

        prompt = (
            "Summarize this conversation in 4-6 words as a title, no punctuation at the end, no quotes. "
            "Do not use bracketed tags like [Image].\n"
            f"{prompt_user_context}\nAssistant: {assistant_msg}"
        )
        
        client = groq.AsyncGroq(api_key=GROQ_API_KEY)
        res = await asyncio.wait_for(
            client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=20
            ),
            timeout=10.0
        )
        title = res.choices[0].message.content.strip(' ".\'\n')
        # Sometimes it still returns [Image], fallback to assistant message
        if not title or title.strip().lower().startswith("[image"):
            raise ValueError("Bad title generated")
    except Exception as e:
        print(f"[title] Groq title generation failed or returned bad title: {e}")
        is_image_msg = image_filename or (user_msg and user_msg.strip().lower().startswith("[image]"))
        if is_image_msg:
            title = f"Image: {image_filename}" if image_filename else "Image Upload"
        else:
            title = (user_msg[:40] + "...") if len(user_msg) > 40 else user_msg

    try:
        await chats_col.update_many(
            {"session_id": session_id, "user_id": user_id},
            {"$set": {"title": title}}
        )
        print(f"[title] Generated title for {session_id}: {title}")
    except Exception as e:
        print(f"[title] Failed to save title for {session_id}: {e}")

async def extract_memory_task(user_id: str, session_id: str, messages: list[dict]):
    """Background task to extract durable facts from the conversation history."""
    try:
        if not GROQ_API_KEY:
            return
        
        # Format history for the prompt
        formatted_history = "\n".join([f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['parts'][0]}" for m in messages])
        
        prompt = (
            "Extract any durable facts about the user worth remembering for future conversations - "
            "preferences, ongoing projects, decisions made, personal details. "
            "Return EXACTLY a JSON array of strings containing short factual statements. "
            "If nothing durable was discussed, return an empty array [].\n"
            "Example: [\"User loves writing code in Rust\", \"User is currently working on an AI project\"]\n"
            "Do NOT include conversational filler, backticks, or any text other than the JSON array.\n\n"
            f"=== Conversation ===\n{formatted_history}"
        )
        
        client = groq.AsyncGroq(api_key=GROQ_API_KEY)
        res = await asyncio.wait_for(
            client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
                temperature=0.1
            ),
            timeout=15.0
        )
        content = res.choices[0].message.content.strip()
        
        # Parse JSON
        if content.startswith("```json"):
            content = content[7:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()
        
        facts = json.loads(content)
        if not isinstance(facts, list):
            raise ValueError("LLM did not return a JSON array")
            
        if facts:
            print(f"[memory] Extracted {len(facts)} facts for user {user_id}")
            now = datetime.now(timezone.utc)
            # Insert each fact
            for fact in facts:
                if isinstance(fact, str) and fact.strip():
                    await memory_col.insert_one({
                        "user_id": user_id,
                        "fact": fact.strip(),
                        "source_session_id": session_id,
                        "created_at": now
                    })
    except Exception as e:
        print(f"[memory] Memory extraction failed: {e}")


# ── POST /upload ──────────────────────────────────────────────────────────────
async def process_upload_task(doc_id: str, filename: str, user_id: str, session_id: str, content: bytes):
    try:
        # Load with LangChain
        if filename.lower().endswith(".pdf"):
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
            text = content.decode("utf-8", errors="replace")
            docs = [Document(page_content=text, metadata={"source": filename})]

        chunks = splitter.split_documents(docs)
        if not chunks:
            await uploads_col.update_one({"doc_id": doc_id}, {"$set": {"status": "failed", "error": "No content could be extracted."}})
            return

        await asyncio.to_thread(ensure_collection)
        points = []
        batch_size = 96

        for i in range(0, len(chunks), batch_size):
            batch_chunks = chunks[i:i+batch_size]
            texts = [c.page_content for c in batch_chunks]
            
            import time
            start_t = time.time()
            vectors = await embed_batch(texts, "search_document")
            duration = time.time() - start_t
            print(f"[upload] Embedded batch of {len(texts)} chunks in {duration:.2f}s")

            for j, vector in enumerate(vectors):
                points.append(PointStruct(
                    id=str(uuid.uuid4()),
                    vector=vector,
                    payload={
                        "user_id":     user_id,
                        "session_id":  session_id,
                        "source":      filename,
                        "chunk_index": i + j,
                        "text":        texts[j],
                    },
                ))

        import json
        if points:
            dim = len(points[0].vector)
            payload_size = sum(len(json.dumps(p.payload)) for p in points)
            print(f"[upload] Preparing to upsert {len(points)} points. First vector dimension: {dim}. Approx payload size: {payload_size} bytes.")
            
            upsert_batch_size = 5
            total_batches = (len(points) + upsert_batch_size - 1) // upsert_batch_size
            for idx in range(0, len(points), upsert_batch_size):
                batch_pts = points[idx:idx+upsert_batch_size]
                batch_num = (idx // upsert_batch_size) + 1
                
                # Retry loop for upserts
                success = False
                for attempt in range(3):
                    try:
                        print(f"[upload] Upserting batch {batch_num}/{total_batches} ({len(batch_pts)} points, attempt {attempt + 1})...")
                        await asyncio.to_thread(
                            qdrant.upsert, collection_name=COLLECTION_NAME, points=batch_pts
                        )
                        success = True
                        print(f"[upload] Batch {batch_num}/{total_batches} SUCCESS.")
                        break
                    except Exception as e:
                        print(f"[upload] Batch {batch_num}/{total_batches} FAILED on attempt {attempt + 1}: {type(e).__name__}: {e}")
                        if attempt < 2:
                            import time
                            time.sleep(2)
                
                if not success:
                    print(f"[upload] Batch {batch_num}/{total_batches} completely FAILED after 3 attempts.")
        await uploads_col.update_one({"doc_id": doc_id}, {"$set": {"status": "ready"}})
    except Exception as e:
        import logging
        logging.exception(f"[upload] Task failed for {doc_id}")
        await uploads_col.update_one({"doc_id": doc_id}, {"$set": {"status": "failed", "error": f"{type(e).__name__}: {str(e)}"}})


@app.post("/upload")
@limiter.limit("20/minute")
async def upload(request: Request, background_tasks: BackgroundTasks, file: UploadFile = File(...), session_id: str = Form(""), user_id: str = Depends(get_current_user_or_session)):
    filename = file.filename or "document"
    
    if file.content_type not in ["application/pdf", "text/plain"]:
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are allowed.")
    
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 50MB limit.")

    doc_id = str(uuid.uuid4())
    await uploads_col.insert_one({
        "doc_id": doc_id,
        "filename": filename,
        "user_id": user_id,
        "status": "processing",
        "timestamp": datetime.now(timezone.utc)
    })

    background_tasks.add_task(process_upload_task, doc_id, filename, user_id, session_id, content)

    return {
        "status": "processing",
        "doc_id": doc_id,
        "file":   filename,
    }


@app.get("/upload/status/{doc_id}")
async def upload_status(doc_id: str, user_id: str = Depends(get_current_user_or_session)):
    doc = await uploads_col.find_one({"doc_id": doc_id, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Upload not found")
    response = {"status": doc["status"]}
    if "error" in doc:
        response["error"] = doc["error"]
    return response


# ── POST /chat ────────────────────────────────────────────────────────────────
@app.post("/chat", response_model=ChatResponse)
@limiter.limit("20/minute")
async def chat(request: Request, req: ChatRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user_or_session)):
    """Standard conversational endpoint with RAG context."""
    try:
        if not req.message.strip():
            raise HTTPException(400, "message cannot be empty")

        session_id = req.session_id or ""
        print(f"[chat] Processing request: user_id={user_id}, session_id={session_id}")

        await save_message(user_id, "user", req.message, session_id)

        is_summarize = any(word in req.message.lower() for word in ["summarize", "summary", "describe", "what is this document about"])
        
        if is_summarize:
            print("[chat] Summarization intent detected. Bypassing similarity search.")
            scroll_res = await asyncio.to_thread(
                qdrant.scroll,
                collection_name=COLLECTION_NAME,
                scroll_filter=Filter(must=[
                    FieldCondition(key="user_id", match=MatchValue(value=user_id)),
                    FieldCondition(key="session_id", match=MatchValue(value=session_id))
                ]),
                limit=20,
                with_payload=True,
            )
            results = scroll_res[0]
        else:
            query_vector = await embed(req.message, "search_query")
            results = await asyncio.to_thread(
                qdrant.search,
                collection_name=COLLECTION_NAME,
                query_vector=query_vector,
                query_filter=Filter(must=[
                    FieldCondition(key="user_id", match=MatchValue(value=user_id)),
                    FieldCondition(key="session_id", match=MatchValue(value=session_id))
                ]),
                limit=TOP_K,
                with_payload=True,
            )

        relevant = [r for r in results if getattr(r, 'score', 1.0) >= SIMILARITY_THRESHOLD]
        grounded = len(relevant) > 0

        if results:
            score_summary = ", ".join(f"{getattr(r, 'score', 1.0):.3f}" for r in results)
            print(f"[chat] Top scores for user {user_id} session {session_id}: [{score_summary}] | grounded={grounded}")
            print("[chat] Retrieved chunks:")
            for r in relevant:
                print(f"  - Source: {r.payload.get('source')} | Session: {r.payload.get('session_id')}")

        history      = await load_history(user_id, session_id)
        prior_history = history[:-1]

        # Fetch user memory if it's the start of a new session
        memory_block = ""
        if len(prior_history) == 0:
            memories = await memory_col.find({"user_id": user_id}).to_list(100)
            if memories:
                facts = [m["fact"] for m in memories]
                memory_block = "\n\n=== What you know about this user ===\n" + "\n".join(f"- {fact}" for fact in facts) + "\n====================================="

        SYSTEM_PERSONA = (
            "You are Ragasiyam Core, a smart and friendly AI assistant. "
            "You help users with general questions AND with understanding documents they upload. "
            "Respond in a natural, conversational way.\n"
            "IMPORTANT RULES:\n"
            "- Refuse harmful or unsafe requests.\n"
            "- Do not fabricate facts when answering from document context. If nothing relevant was retrieved, say so.\n"
            "- Stay on-topic for a document-assistant use case.\n"
            "- Use structured output formatting: use headers (##), bullet points, numbered steps, and fenced code blocks with language tags where relevant. Avoid writing a wall of plain text."
            f"{memory_block}"
        )

        if grounded:
            context_text = "\n\n---\n\n".join(
                f"[Source: {r.payload['source']}, chunk {r.payload['chunk_index'] + 1}]\n"
                f"{r.payload['text']}"
                for r in relevant
            )
            prompt = (
                f"{SYSTEM_PERSONA}\n\n"
                "The user has uploaded documents. Relevant excerpts are provided below as context. "
                "Use them to answer document-related questions. "
                "For general conversation or questions not related to the documents, respond naturally "
                "without mentioning the excerpts.\n\n"
                f"=== Relevant Document Excerpts ===\n{context_text}\n"
                f"=== End of Excerpts ===\n\n"
                f"User: {req.message}"
            )
        else:
            prompt = f"{SYSTEM_PERSONA}\n\nUser: {req.message}"

        is_groq_model = req.model in ["llama-3.3-70b-versatile", "deepseek-r1-distill-llama-70b"]
        
        try:
            if is_groq_model and GROQ_API_KEY:
                groq_messages = []
                for m in prior_history:
                    groq_role = "assistant" if m["role"] == "model" else "user"
                    groq_messages.append({"role": groq_role, "content": m["parts"][0]})
                groq_messages.append({"role": "user", "content": prompt})
                
                client = groq.AsyncGroq(api_key=GROQ_API_KEY)
                groq_res = await asyncio.wait_for(
                    client.chat.completions.create(model=req.model, messages=groq_messages),
                    timeout=30.0
                )
                reply_text = groq_res.choices[0].message.content
                provider = "groq"
            else:
                gemini_model_name = req.model if req.model.startswith("gemini") else MODEL_NAME
                model = genai.GenerativeModel(gemini_model_name)
                chat_session = model.start_chat(history=prior_history)
                response = await asyncio.wait_for(
                    asyncio.to_thread(chat_session.send_message, prompt),
                    timeout=30.0
                )
                reply_text = response.text
                provider = "gemini"
        except asyncio.TimeoutError:
            raise HTTPException(504, "LLM request timed out")
        except Exception as exc:
            is_429 = isinstance(exc, ResourceExhausted) or "429" in str(exc) or "ResourceExhausted" in str(exc)
            if is_429 and GROQ_API_KEY:
                print("[INFO] Gemini rate limit hit (429), falling back to Groq...")
                groq_messages = []
                for m in prior_history:
                    groq_role = "assistant" if m["role"] == "model" else "user"
                    groq_messages.append({"role": groq_role, "content": m["parts"][0]})
                groq_messages.append({"role": "user", "content": prompt})
                
                client = groq.AsyncGroq(api_key=GROQ_API_KEY)
                groq_res = await asyncio.wait_for(
                    client.chat.completions.create(model="llama-3.3-70b-versatile", messages=groq_messages),
                    timeout=30.0
                )
                reply_text = groq_res.choices[0].message.content
                provider = "groq_fallback"
            else:
                raise HTTPException(502, f"Model error: {exc}") from exc

        print(f"[INFO] Chat request successfully served by: {provider}")
        await save_message(user_id, "assistant", reply_text, session_id)
        
        if len(prior_history) == 0:
            background_tasks.add_task(generate_chat_title, session_id, user_id, req.message, reply_text)
        elif len(prior_history) > 0 and len(prior_history) % 4 == 0:
            # Trigger memory extraction periodically (e.g. after 5 messages total = 4 prior)
            full_history = history + [{"role": "model", "parts": [reply_text]}]
            background_tasks.add_task(extract_memory_task, user_id, session_id, full_history[-6:])

        return ChatResponse(reply=reply_text, grounded=grounded)

    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.exception("[chat] Unhandled exception in chat endpoint")
        raise HTTPException(status_code=500, detail="Internal Server Error")


# ── POST /chat/vision ─────────────────────────────────────────────────
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

@app.post("/chat/vision")
@limiter.limit("10/minute")
async def chat_vision(
    request: Request,
    background_tasks: BackgroundTasks,
    message: str = Form(""),
    session_id: str = Form(""),
    image: UploadFile = File(...),
    user_id: str = Depends(get_current_user_or_session),
):
    """Send an image (+ optional text) to Gemini Vision and return a reply."""
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            400,
            f"Unsupported image type '{image.content_type}'. "
            "Supported: JPEG, PNG, WebP, GIF."
        )

    image_bytes = await image.read()
    if len(image_bytes) > 50 * 1024 * 1024:
        raise HTTPException(400, "Image size exceeds 50 MB limit.")

    user_text = message.strip() or "Describe this image."
    print(f"[vision] user={user_id} session={session_id} file={image.filename} text={user_text[:80]!r}")

    # Persist user turn (text record; image bytes are not stored in DB)
    await save_message(user_id, "user", f"[Image] {user_text}", session_id)

    # Load prior text history so Gemini has conversation context
    history     = await load_history(user_id, session_id)
    prior_history = history[:-1]  # exclude the turn we just saved

    # Build the multimodal prompt
    system_persona = (
        "You are Ragasiyam Core, a smart and friendly AI assistant. "
        "You help users with general questions AND with understanding images and documents. "
        "Respond in a natural, conversational way."
    )
    image_part = {
        "mime_type": image.content_type,
        "data": image_bytes,
    }
    text_part = f"{system_persona}\n\nUser: {user_text}"

    # Vision uses generate_content (not chat session) because images can't
    # be stored in chat history across turns.
    try:
        model   = genai.GenerativeModel(MODEL_NAME)
        response = await asyncio.to_thread(
            model.generate_content, [image_part, text_part]
        )
        reply_text = response.text
        provider   = "gemini-vision"
    except Exception as exc:
        is_429 = isinstance(exc, ResourceExhausted) or "429" in str(exc)
        if is_429 and GROQ_API_KEY:
            # Groq doesn't support vision, so fall back to text-only description
            print("[vision] Gemini rate-limited, falling back to Groq (text only)...")
            client = groq.AsyncGroq(api_key=GROQ_API_KEY)
            groq_res = await client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": f"{system_persona}\n\n[User sent an image but vision is temporarily unavailable.] {user_text}"}],
            )
            reply_text = groq_res.choices[0].message.content
            provider   = "groq-fallback"
        else:
            raise HTTPException(502, f"Vision error: {exc}") from exc

    print(f"[INFO] Vision request served by: {provider}")
    await save_message(user_id, "assistant", reply_text, session_id)
    
    if len(prior_history) == 0:
        background_tasks.add_task(generate_chat_title, session_id, user_id, f"[Image] {user_text}", reply_text, image.filename)

    return {"reply": reply_text, "grounded": False}


# ── GET /sessions ─────────────────────────────────────────────────
@app.get("/sessions", response_model=list[SessionOut])
async def get_sessions(user_id: str = Depends(get_current_user_or_session)):
    """Return a list of the user's distinct conversation sessions."""
    pipeline = [
        # Only docs that belong to this user AND have a real session_id
        {"$match": {"user_id": user_id, "session_id": {"$exists": True, "$ne": ""}}},
        {"$sort": {"timestamp": 1}},
        {"$group": {
            "_id": "$session_id",
            # Collect all (role, content) pairs so we can pick the first user message fallback
            "msgs": {"$push": {"role": "$role", "content": "$content"}},
            "title": {"$first": "$title"},
            "created_at": {"$first": "$timestamp"},
            "last_at": {"$last": "$timestamp"},
            "message_count": {"$sum": 1},
        }},
        {"$sort": {"last_at": -1}},
        {"$limit": 50},
    ]
    results = await chats_col.aggregate(pipeline).to_list(50)

    sessions = []
    for r in results:
        # Fallback to first user message if generated title doesn't exist
        title = r.get("title")
        if not title:
            first_user = next((m["content"] for m in r["msgs"] if m["role"] == "user"), None)
            title = (first_user or "Conversation")[:60].strip()
        sessions.append(SessionOut(
            session_id=r["_id"],
            title=title,
            created_at=r["created_at"].isoformat(),
            message_count=r["message_count"],
        ))
    return sessions


# ── GET /history ─────────────────────────────────────────────────
@app.get("/history", response_model=list[MessageOut])
async def get_history(session_id: str = "", user_id: str = Depends(get_current_user_or_session)):
    query: dict = {"user_id": user_id}
    if session_id:
        query["session_id"] = session_id

    cursor = chats_col.find(
        query,
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
async def chat_stream(request: Request, req: ChatRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user_or_session)):
    """Same RAG logic as /chat, but streams the reply via SSE chunks."""
    try:
        if not req.message.strip():
            raise HTTPException(400, "message cannot be empty")

        session_id = req.session_id or ""
        await save_message(user_id, "user", req.message, session_id)

        is_summarize = any(word in req.message.lower() for word in ["summarize", "summary", "describe", "what is this document about"])
        
        if is_summarize:
            print("[chat_stream] Summarization intent detected. Bypassing similarity search.")
            scroll_res = await asyncio.to_thread(
                qdrant.scroll,
                collection_name=COLLECTION_NAME,
                scroll_filter=Filter(must=[
                    FieldCondition(key="user_id", match=MatchValue(value=user_id)),
                    FieldCondition(key="session_id", match=MatchValue(value=session_id))
                ]),
                limit=20,
                with_payload=True,
            )
            results = scroll_res[0]
        else:
            query_vector = await embed(req.message, "search_query")
            results = await asyncio.to_thread(
                qdrant.search,
                collection_name=COLLECTION_NAME,
                query_vector=query_vector,
                query_filter=Filter(must=[
                    FieldCondition(key="user_id", match=MatchValue(value=user_id)),
                    FieldCondition(key="session_id", match=MatchValue(value=session_id))
                ]),
                limit=TOP_K,
                with_payload=True,
            )

        relevant = [r for r in results if getattr(r, 'score', 1.0) >= SIMILARITY_THRESHOLD]
        grounded = len(relevant) > 0

        history      = await load_history(user_id, session_id)
        prior_history = history[:-1]

        memory_block = ""
        if len(prior_history) == 0:
            memories = await memory_col.find({"user_id": user_id}).to_list(100)
            if memories:
                facts = [m["fact"] for m in memories]
                memory_block = "\n\n=== What you know about this user ===\n" + "\n".join(f"- {fact}" for fact in facts) + "\n=====================================\n\n"

        model_obj = genai.GenerativeModel(MODEL_NAME)

        if grounded:
            context_text = "\n\n---\n\n".join(
                f"[Source: {r.payload.get('source', 'Unknown')}, chunk {r.payload.get('chunk_index', 0) + 1}]\n"
                f"{r.payload.get('text', '')}"
                for r in relevant
            )
            prompt = (
                f"{memory_block}"
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
            prompt = memory_block + req.message

        # Bridge sync Gemini streaming -> async SSE via thread + Queue
        loop = asyncio.get_event_loop()
        q: asyncio.Queue = asyncio.Queue()

        def gemini_thread():
            try:
                chat_session = model_obj.start_chat(history=prior_history)
                response = chat_session.send_message(prompt, stream=True)
                # Apply a manual timeout approach for the generator if needed, but streaming 
                # usually waits on the first chunk. To be safe, we just let it run 
                # and rely on the underlying library timeouts.
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
            try:
                while True:
                    # Apply a timeout on the queue get to avoid hanging indefinitely if thread dies
                    kind, data = await asyncio.wait_for(q.get(), timeout=30.0)
                    if kind == "chunk":
                        full_reply += data
                        payload = json.dumps({"text": data, "done": False})
                        yield f"data: {payload}\n\n"
                    elif kind == "error":
                        yield f"data: {json.dumps({'error': data, 'done': True})}\n\n"
                        break
                    elif kind == "done":
                        # Persist the complete reply now that streaming finished
                        await save_message(user_id, "assistant", full_reply, session_id)
                        
                        if len(prior_history) == 0:
                            background_tasks.add_task(generate_chat_title, session_id, user_id, req.message, full_reply)
                        elif len(prior_history) > 0 and len(prior_history) % 4 == 0:
                            full_history = history + [{"role": "model", "parts": [full_reply]}]
                            background_tasks.add_task(extract_memory_task, user_id, session_id, full_history[-6:])

                        final = json.dumps({"text": "", "done": True, "grounded": grounded})
                        yield f"data: {final}\n\n"
                        break
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'error': 'LLM stream timed out', 'done': True})}\n\n"
            except Exception as e:
                import logging
                logging.exception("[chat_stream] Error in event generator")
                yield f"data: {json.dumps({'error': 'Internal Server Error', 'done': True})}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",   # disable nginx buffering if behind proxy
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.exception("[chat_stream] Unhandled exception in stream endpoint")
        raise HTTPException(status_code=500, detail="Internal Server Error")


# ── GET /sessions/search ──────────────────────────────────────────────
@app.get("/sessions/search", response_model=list[SessionOut])
async def search_sessions(q: str, user_id: str = Depends(get_current_user_or_session)):
    """Search sessions by matching the query against title or message content."""
    if not q.strip():
        return []
    
    pipeline = [
        {"$match": {"user_id": user_id, "session_id": {"$exists": True, "$ne": ""}}},
        {"$sort": {"timestamp": 1}},
        {"$group": {
            "_id": "$session_id",
            "msgs": {"$push": {"role": "$role", "content": "$content"}},
            "title": {"$first": "$title"},
            "created_at": {"$first": "$timestamp"},
            "last_at": {"$last": "$timestamp"},
            "message_count": {"$sum": 1},
        }},
        {"$match": {
            "$or": [
                {"title": {"$regex": q, "$options": "i"}},
                {"msgs.content": {"$regex": q, "$options": "i"}}
            ]
        }},
        {"$sort": {"last_at": -1}},
        {"$limit": 50},
    ]
    results = await chats_col.aggregate(pipeline).to_list(50)

    sessions = []
    for r in results:
        title = r.get("title")
        if not title:
            first_user = next((m["content"] for m in r["msgs"] if m["role"] == "user"), None)
            title = (first_user or "Conversation")[:60].strip()
        sessions.append(SessionOut(
            session_id=r["_id"],
            title=title,
            created_at=r["created_at"].isoformat(),
            message_count=r["message_count"],
        ))
    return sessions


# ── DELETE /sessions/{session_id} ──────────────────────────────────────
@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user_id: str = Depends(get_current_user_or_session)):
    """Delete a chat session and its associated vectors."""
    try:
        # Delete from MongoDB
        res = await chats_col.delete_many({"session_id": session_id, "user_id": user_id})
        
        # Delete from Qdrant
        await asyncio.to_thread(
            qdrant.delete,
            collection_name=COLLECTION_NAME,
            points_selector=Filter(must=[
                FieldCondition(key="session_id", match=MatchValue(value=session_id)),
                FieldCondition(key="user_id", match=MatchValue(value=user_id))
            ])
        )
        return {"status": "ok", "deleted_messages": res.deleted_count}
    except Exception as e:
        import logging
        logging.exception(f"[delete] Error deleting session {session_id}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


# ── GET /memory ───────────────────────────────────────────────────────────────
@app.get("/memory", response_model=list[MemoryOut])
async def get_memory(user_id: str = Depends(get_current_user_or_session)):
    """Return all stored memories for the user."""
    cursor = memory_col.find({"user_id": user_id}).sort("created_at", -1)
    memories = []
    async for doc in cursor:
        memories.append(MemoryOut(
            id=str(doc["_id"]),
            fact=doc["fact"],
            source_session_id=doc.get("source_session_id", ""),
            created_at=doc["created_at"].isoformat(),
        ))
    return memories


# ── DELETE /memory/{fact_id} ──────────────────────────────────────────────────
@app.delete("/memory/{fact_id}")
async def delete_memory(fact_id: str, user_id: str = Depends(get_current_user_or_session)):
    """Delete a specific memory fact."""
    from bson.objectid import ObjectId
    try:
        obj_id = ObjectId(fact_id)
        res = await memory_col.delete_one({"_id": obj_id, "user_id": user_id})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Memory not found")
        return {"status": "ok"}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=400, detail="Invalid memory ID")

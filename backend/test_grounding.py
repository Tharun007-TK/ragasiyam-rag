#!/usr/bin/env python3
"""
Ragasiyam — Step 4 Grounding Test
===================================
Uploads a known test document, then runs 3 questions:
  1. Answerable from the doc   → expects grounded=True
  2. Unrelated topic           → expects grounded=False (no hallucination)
  3. Topic not in doc          → expects refusal or grounded=False

Usage:
  cd backend
  python test_grounding.py               # runs against localhost:8000
  python test_grounding.py http://host:8000
"""

import sys
import json
import uuid
import os
import tempfile

try:
    import requests
except ImportError:
    print("Install requests first: pip install requests")
    sys.exit(1)

BASE_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:8000"
SESSION_ID = f"grounding_test_{uuid.uuid4().hex[:6]}"

# ── Sample document (known ground truth) ──────────────────────────────────────
SAMPLE_DOC = """\
Ragasiyam AI Platform — Technical Specification v1.0
======================================================

Overview
--------
Ragasiyam is an open-source RAG (Retrieval-Augmented Generation) chatbot
platform built on FastAPI and Google Gemini 1.5 Flash.
It was founded in 2024 by Arjun Krishnamurthy in Chennai, India.

Key Features
------------
- Conversational chat powered by Google Gemini 1.5 Flash (free tier)
- Document upload: PDF and plain-text support
- Vector search via Qdrant (cosine similarity, 768-dim embeddings)
- Persistent chat history stored in MongoDB Atlas per session
- Per-session document isolation — uploaded docs are scoped to one session

Pricing
-------
The platform is free during the public beta (until December 2025).
Pro plans are available at USD 29 per month, which include:
  - Priority Gemini API quota
  - Up to 500 MB of document storage per session
  - Dedicated support via email

Technical Stack
---------------
  Backend:    FastAPI (Python 3.11+)
  LLM:        Google Gemini 1.5 Flash
  Embeddings: Google embedding-001 (768 dimensions)
  Vector DB:  Qdrant (local Docker, port 6333)
  Database:   MongoDB Atlas (free M0 cluster)
"""

# ── Grounding questions & expected behaviour ──────────────────────────────────
TESTS = [
    {
        "label": "Grounded Q — answer IS in the document",
        "question": "What is the price of the Pro plan and what does it include?",
        "expect_grounded": True,
        "doc_keywords": ["29", "pro", "support"],
    },
    {
        "label": "Unrelated Q — answer is NOT in any uploaded doc",
        "question": "What is the boiling point of water in Celsius?",
        "expect_grounded": False,
        "doc_keywords": [],
    },
    {
        "label": "Out-of-scope Q — about the doc's domain but not in it",
        "question": "What is the revenue of Ragasiyam for fiscal year 2023?",
        "expect_grounded": False,  # not in doc; OR grounded but bot should refuse
        "doc_keywords": [],
    },
]


# ── Helpers ───────────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
RESET  = "\033[0m"
BOLD   = "\033[1m"


def ok(msg):   print(f"  {GREEN}[OK]{RESET}  {msg}")
def fail(msg): print(f"  {RED}[FAIL]{RESET} {msg}")
def info(msg): print(f"  {YELLOW}[INFO]{RESET} {msg}")


def upload_document(session_id: str, content: str, filename: str = "test_doc.txt"):
    print(f"\n{BOLD}[Upload]{RESET} Session: {session_id}")
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False, encoding="utf-8"
    ) as f:
        f.write(content)
        tmp_path = f.name

    try:
        with open(tmp_path, "rb") as f:
            resp = requests.post(
                f"{BASE_URL}/upload",
                data={"session_id": session_id},
                files={"file": (filename, f, "text/plain")},
                timeout=60,
            )
        resp.raise_for_status()
        result = resp.json()
        print(f"  Uploaded '{filename}' — {result['chunks']} chunks indexed")
        return result
    finally:
        os.unlink(tmp_path)


def ask(session_id: str, question: str) -> dict:
    resp = requests.post(
        f"{BASE_URL}/chat",
        json={"session_id": session_id, "message": question},
        timeout=60,
    )
    if not resp.ok:
        print(f"Error from /chat: {resp.text}")
    resp.raise_for_status()
    return resp.json()


# ── Main test runner ──────────────────────────────────────────────────────────
def run_tests() -> bool:
    print(f"\n{BOLD}{'=' * 60}")
    print("Ragasiyam — Grounding Test Suite")
    print(f"Target: {BASE_URL}")
    print(f"{'=' * 60}{RESET}")

    # Verify server is up
    try:
        health = requests.get(f"{BASE_URL}/health", timeout=5).json()
        print(f"Server health: {json.dumps(health)}")
    except Exception as e:
        print(f"{RED}Cannot reach server: {e}{RESET}")
        return False

    # Upload the sample doc
    upload_document(SESSION_ID, SAMPLE_DOC)

    passed = 0
    failed = 0

    for i, test in enumerate(TESTS, 1):
        print(f"\n{BOLD}[Test {i}/{ len(TESTS)}]{RESET} {test['label']}")
        print(f"  Q: {test['question']}")

        result = ask(SESSION_ID, test["question"])
        reply    = result["reply"]
        grounded = result["grounded"]

        # Truncate reply for display
        display = reply.replace("\n", " ")[:220]
        print(f"  A: {display}{'…' if len(reply) > 220 else ''}")
        print(f"  grounded={grounded}")

        if grounded == test["expect_grounded"]:
            ok(f"grounded={grounded} as expected")
            passed += 1
        else:
            # Special case: grounded=True but bot said "I don't have that info"
            if grounded and not test["expect_grounded"]:
                refused = any(
                    phrase in reply.lower()
                    for phrase in ["don't have", "not in", "cannot find", "no information"]
                )
                if refused:
                    ok("Grounded=True but bot correctly refused to answer (hallucination prevented)")
                    passed += 1
                else:
                    fail(
                        f"Expected grounded={test['expect_grounded']}, got {grounded}. "
                        "Bot may have hallucinated from unrelated chunks."
                    )
                    failed += 1
            else:
                fail(f"Expected grounded={test['expect_grounded']}, got {grounded}")
                failed += 1

        # Check expected keywords for grounded tests
        if test["expect_grounded"] and grounded and test["doc_keywords"]:
            found = [kw for kw in test["doc_keywords"] if kw.lower() in reply.lower()]
            if found:
                info(f"Reply contains expected terms: {found}")
            else:
                info(f"Warning: reply didn't mention expected terms {test['doc_keywords']}")

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{BOLD}{'=' * 60}")
    print(f"Results: {passed} passed, {failed} failed out of {len(TESTS)} tests")
    if failed == 0:
        print(f"{GREEN}All grounding tests PASSED [OK]{RESET}")
    else:
        print(f"{RED}{failed} test(s) FAILED [FAIL]{RESET}")
        print("  Tips:")
        print("    - Increase SIMILARITY_THRESHOLD in main.py if too many false positives")
        print("    - Decrease it if grounded answers aren't triggering")
        print(f"{'=' * 60}{RESET}")

    return failed == 0


if __name__ == "__main__":
    try:
        success = run_tests()
        sys.exit(0 if success else 1)
    except requests.exceptions.ConnectionError:
        print(f"\n{RED}⚠ Cannot connect to {BASE_URL}{RESET}")
        print("  Make sure the server is running: uvicorn main:app --reload")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nAborted.")
        sys.exit(1)

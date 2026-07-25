# <span style="color: #6366f1">RAG</span>'asiam 🤖

**RAG'asiam** is an intelligent, full-stack conversational assistant powered by Retrieval-Augmented Generation (RAG). Featuring a premium Claude-inspired user interface, it seamlessly handles textual conversations, contextual document Q&A, and multimodal image analysis.

---

## ✨ Features

- **Contextual RAG (Document Q&A):** Upload PDF or TXT files. RAG'asiam automatically ingests the documents into a vector database and grounds its answers based on your data.
- **Multimodal Vision:** Upload images (JPEG, PNG, WebP, GIF) to ask questions, describe content, or analyze visual data effortlessly using Gemini Vision models.
- **Premium User Interface:** A sleek, Claude-inspired design with an ambient pulsing glow around the input box, smooth micro-animations, and a responsive layout.
- **Dark Mode Support:** Visually stunning dark and light modes, fully togglable via the user settings modal and persisted to your local storage.
- **Persistent Sessions:** Your chat history is saved securely, allowing you to revisit and continue previous conversations from the sidebar.

## 🛠️ Tech Stack

**Frontend:**
- [Next.js](https://nextjs.org/) (App Router, Turbopack)
- [React](https://react.dev/) & [Tailwind CSS](https://tailwindcss.com/)
- [Lucide React](https://lucide.dev/) (Icons)

**Backend:**
- [FastAPI](https://fastapi.tiangolo.com/) (Python)
- [Qdrant Cloud](https://qdrant.tech/) (Vector Database for RAG)
- [MongoDB](https://www.mongodb.com/) (Session & Chat History Storage)
- [Google Gemini API](https://ai.google.dev/) (LLM and Vision Engine)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.9+
- API Keys: Google Gemini, Qdrant Cloud (URL & API Key), MongoDB URI.

### 1. Backend Setup

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install the required Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Set up your environment variables by copying the example file:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` and fill in your `GEMINI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, and `MONGODB_URI`.*
4. Start the FastAPI development server:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

### 2. Frontend Setup

1. Open a new terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install the Node modules:
   ```bash
   npm install
   ```
3. Start the Next.js development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser to interact with RAG'asiam!

---

## 📜 License
This project is open source and available under the [MIT License](LICENSE).

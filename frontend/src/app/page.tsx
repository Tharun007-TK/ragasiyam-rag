"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Paperclip, Bot, LogOut, Menu, X, Plus,
  Image as ImageIcon, Search, SlidersHorizontal,
  MoreHorizontal, PenSquare,
} from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  imagePreview?: string;
};

type Session = {
  session_id: string;
  title: string;
  created_at: string;
  message_count: number;
};

function generateSessionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [guestSessionId, setGuestSessionId] = useState<string>("");
  const [guestMessageCount, setGuestMessageCount] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);

  // Image state
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const API_BASE = "/api/py";
  const GUEST_LIMIT = 3;

  // ── Init guest session ──────────────────────────────────────────
  useEffect(() => {
    let storedSession = localStorage.getItem("guest_session_id");
    if (!storedSession) {
      storedSession = Math.random().toString(36).substring(2, 15);
      localStorage.setItem("guest_session_id", storedSession);
    }
    setGuestSessionId(storedSession);
    const count = parseInt(localStorage.getItem(`guest_count_${storedSession}`) || "0");
    setGuestMessageCount(count);
  }, []);

  useEffect(() => {
    if (!currentSessionId) setCurrentSessionId(generateSessionId());
  }, []);

  const getHeaders = useCallback((): Record<string, string> => {
    if (status === "authenticated" && (session as any)?.accessToken) {
      return { Authorization: `Bearer ${(session as any).accessToken}` };
    }
    return { "X-Session-ID": guestSessionId };
  }, [status, session, guestSessionId]);

  const updateGuestCount = () => {
    if (status === "unauthenticated") {
      const newCount = guestMessageCount + 1;
      setGuestMessageCount(newCount);
      localStorage.setItem(`guest_count_${guestSessionId}`, newCount.toString());
      return newCount;
    }
    return guestMessageCount;
  };

  // ── Fetch sessions list ─────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    if (status === "loading" || (!guestSessionId && status === "unauthenticated")) return;
    setSessionsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sessions`, { headers: getHeaders() });
      if (res.ok) setSessions(await res.json());
    } catch (err) {
      console.error("Failed to fetch sessions", err);
    } finally {
      setSessionsLoading(false);
    }
  }, [status, guestSessionId, getHeaders]);

  const loadSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setMessages([]);
    clearPendingImage();
    try {
      const res = await fetch(
        `${API_BASE}/history?session_id=${encodeURIComponent(sessionId)}`,
        { headers: getHeaders() }
      );
      if (res.ok) {
        const data: Message[] = await res.json();
        setMessages(data || []);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    } catch (err) {
      console.error("Failed to load session", err);
    }
    setMobileMenuOpen(false);
  }, [getHeaders]);

  const startNewChat = useCallback(() => {
    setCurrentSessionId(generateSessionId());
    setMessages([]);
    clearPendingImage();
    setMobileMenuOpen(false);
  }, []);

  useEffect(() => {
    if (status !== "loading") fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, guestSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Image helpers ───────────────────────────────────────────────
  const clearPendingImage = () => {
    setPendingImage(null);
    setPendingImagePreview("");
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      alert("Only JPEG, PNG, WebP, and GIF images are supported.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("Image must be smaller than 10 MB.");
      return;
    }
    setPendingImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPendingImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ── Send message ────────────────────────────────────────────────
  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const textToSend = inputText;
    if ((!textToSend.trim() && !pendingImage) || isLoading) return;

    if (status === "unauthenticated" && guestMessageCount >= GUEST_LIMIT) {
      alert("You have reached your free guest limit. Please log in or sign up to continue.");
      router.push("/signup");
      return;
    }

    const imageSnap = pendingImage;
    const imagePreviewSnap = pendingImagePreview;

    const newUserMsg: Message = {
      role: "user",
      content: textToSend,
      imagePreview: imagePreviewSnap || undefined,
    };
    setMessages((prev) => [...prev, newUserMsg]);
    setInputText("");
    clearPendingImage();
    setIsLoading(true);
    updateGuestCount();

    try {
      let data: { reply: string; grounded: boolean };

      if (imageSnap) {
        const formData = new FormData();
        formData.append("image", imageSnap);
        formData.append("message", textToSend || "Describe this image.");
        formData.append("session_id", currentSessionId);
        const res = await fetch(`${API_BASE}/chat/vision`, {
          method: "POST",
          headers: getHeaders(),
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Vision request failed");
        }
        data = await res.json();
      } else {
        const res = await fetch(`${API_BASE}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getHeaders() },
          body: JSON.stringify({ message: textToSend, session_id: currentSessionId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Failed to send message");
        }
        data = await res.json();
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      setTimeout(() => fetchSessions(), 500);
    } catch (error: any) {
      console.error(error);
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${error.message}` }]);
    }
    setIsLoading(false);
  };

  // ── File (PDF/TXT) upload ───────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: getHeaders(),
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        const docId = data.doc_id;
        if (fileInputRef.current) fileInputRef.current.value = "";
        const pollStatus = setInterval(async () => {
          try {
            const statusRes = await fetch(`${API_BASE}/upload/status/${docId}`, { headers: getHeaders() });
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.status === "ready") {
                clearInterval(pollStatus);
                setIsUploading(false);
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: `Successfully ingested document: ${file.name}` },
                ]);
              } else if (statusData.status === "failed") {
                clearInterval(pollStatus);
                setIsUploading(false);
                alert("Failed to process document");
              }
            }
          } catch (e) {
            clearInterval(pollStatus);
            setIsUploading(false);
          }
        }, 2000);
        return;
      }
      const err = await res.json();
      throw new Error(err.detail || "Upload failed");
    } catch (error: any) {
      alert(error.message || "Failed to upload document");
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (status === "loading") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0f0f11]">
        <div className="animate-pulse text-zinc-600">Loading...</div>
      </div>
    );
  }

  const isGuestLimitReached = status === "unauthenticated" && guestMessageCount >= GUEST_LIMIT;
  const displayName = session?.user?.name
    ? session.user.name.split(" ")[0]
    : status === "unauthenticated" ? "Guest" : "Tharun";

  // Sidebar content (shared between desktop and mobile drawer)
  const SidebarContent = () => (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <span className="text-[17px] font-semibold tracking-tight">
            <span className="text-indigo-400 font-bold">RAG</span>
            <span className="text-white">'asiam</span>
          </span>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors" title="Search">
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={startNewChat}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="New chat"
          >
            <PenSquare className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── New Chat button ── */}
      <div className="px-3 pb-3">
        <button
          onClick={startNewChat}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors text-sm font-medium border border-zinc-700/40"
        >
          <Plus className="w-4 h-4" />
          New chat
        </button>
      </div>

      {/* ── Recents Section ── */}
      <div className="flex items-center justify-between px-4 pt-1 pb-2">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Recents</span>
        <button className="p-1 rounded text-zinc-600 hover:text-zinc-400 transition-colors" title="Filter">
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Conversation List ── */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 no-scrollbar">
        {sessionsLoading ? (
          <div className="flex flex-col gap-1 px-2 py-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 rounded-lg bg-zinc-800/60 animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-zinc-600 px-3 py-4 text-center">
            No conversations yet.<br />
            <span className="text-zinc-700">Start chatting to see history here.</span>
          </p>
        ) : (
          sessions.map((s) => {
            const isActive = s.session_id === currentSessionId;
            const isHovered = hoveredSession === s.session_id;
            return (
              <div
                key={s.session_id}
                className="relative group"
                onMouseEnter={() => setHoveredSession(s.session_id)}
                onMouseLeave={() => setHoveredSession(null)}
              >
                <button
                  onClick={() => loadSession(s.session_id)}
                  className={`w-full text-left px-3 py-2 rounded-xl transition-colors text-sm leading-snug ${
                    isActive
                      ? "bg-zinc-800 text-white font-semibold"
                      : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white font-normal"
                  }`}
                >
                  <span className="block truncate pr-5">
                    {s.title}
                  </span>
                </button>

                {/* Three-dot menu on hover/active */}
                {(isHovered || isActive) && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── User Profile ── */}
      <div className="mt-auto px-3 py-4 border-t border-zinc-800/60">
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-3 w-full px-2 py-2 rounded-xl hover:bg-zinc-800 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : "G"}
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-white truncate leading-tight">
                {session?.user?.name || "Guest"}
              </p>
              {status === "authenticated" && (
                <p className="text-[10px] text-zinc-500 truncate">
                  {(session.user as any).username ? `@${(session.user as any).username}` : session.user?.email}
                </p>
              )}
            </div>
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl py-1 z-50">
              {status === "authenticated" ? (
                <button
                  onClick={() => signOut()}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-zinc-800 flex items-center gap-2 rounded-lg mx-1"
                  style={{ width: "calc(100% - 8px)" }}
                >
                  <LogOut className="w-4 h-4" /> Log out
                </button>
              ) : (
                <>
                  <Link href="/login" className="block px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-lg mx-1" style={{ display: "block", margin: "2px 4px" }}>Log in</Link>
                  <Link href="/signup" className="block px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-lg" style={{ display: "block", margin: "2px 4px" }}>Sign up</Link>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-[#0f0f11] text-zinc-100 overflow-hidden font-sans">

      {/* ── Desktop Sidebar ── */}
      <aside
        className={`hidden md:flex flex-col shrink-0 border-r border-zinc-800/60 bg-[#141416] transition-all duration-200 ${
          sidebarOpen ? "w-[260px]" : "w-0 overflow-hidden border-none"
        }`}
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile Sidebar Overlay ── */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed left-0 top-0 bottom-0 w-[280px] bg-[#141416] border-r border-zinc-800/60 z-40 flex flex-col md:hidden">
            <div className="flex items-center justify-end px-4 pt-4 pb-2">
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <SidebarContent />
            </div>
          </aside>
        </>
      )}

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col relative h-full min-w-0">

        {/* Top bar */}
        <header className="flex items-center px-4 py-3 border-b border-zinc-900/50 shrink-0 bg-[#0f0f11]/80 backdrop-blur-md z-10">
          {/* Sidebar toggle (desktop) */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden md:flex p-2 -ml-1 mr-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 -ml-1 mr-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          <span className="text-sm font-medium text-zinc-400 truncate">
            {messages.length > 0
              ? sessions.find(s => s.session_id === currentSessionId)?.title || "New conversation"
              : "RAG'asiam"}
          </span>
        </header>

        {/* Subtle glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-blue-900/8 rounded-full blur-[120px] pointer-events-none" />

        {/* ── Chat Area ── */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-52 no-scrollbar relative z-10">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <h1 className="text-4xl md:text-[44px] font-medium tracking-tight mb-4 text-center text-white drop-shadow-sm">
                What's the vibe, {displayName}?
              </h1>
              <p className="text-zinc-500 text-sm">
                <span className="text-indigo-400 font-semibold">RAG</span>'asiam — ask anything, upload documents, or share images.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full flex flex-col gap-6 pt-8">
              {messages.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-3xl px-5 py-3.5 ${
                    m.role === "user" ? "bg-zinc-800 text-zinc-100" : "bg-transparent text-zinc-300"
                  }`}>
                    {m.role === "assistant" && (
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center shrink-0">
                          <Bot className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-xs font-medium text-zinc-500"><span className="text-indigo-400">RAG</span>'asiam Core</span>
                      </div>
                    )}
                    {m.imagePreview && (
                      <img
                        src={m.imagePreview}
                        alt="uploaded"
                        className="rounded-2xl max-h-64 max-w-full object-cover mb-2 border border-zinc-700"
                      />
                    )}
                    {m.content && (
                      <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="px-5 py-3.5 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-zinc-600 animate-bounce" />
                    <div className="w-2 h-2 rounded-full bg-zinc-600 animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 rounded-full bg-zinc-600 animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
              {isUploading && (
                <div className="flex justify-start">
                  <div className="px-5 py-3.5 flex items-center gap-2 text-zinc-500 text-sm">
                    <Paperclip className="w-4 h-4 animate-pulse" /> Ingesting document...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Input Area ── */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:px-8 pb-8 bg-gradient-to-t from-[#0f0f11] via-[#0f0f11]/95 to-transparent z-20">
          {isGuestLimitReached && (
            <div className="max-w-3xl mx-auto mb-4 p-3 bg-indigo-950/50 border border-indigo-900/50 rounded-xl text-indigo-200 text-sm text-center">
              You've reached your free guest limit.{" "}
              <Link href="/signup" className="font-semibold underline hover:text-white">Sign up</Link>{" "}
              to continue.
            </div>
          )}

          <div className="max-w-3xl mx-auto flex flex-col gap-2">
            {/* Image preview strip */}
            {pendingImagePreview && (
              <div className="flex items-center gap-3 px-3 py-2 bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl">
                <div className="relative shrink-0">
                  <img src={pendingImagePreview} alt="pending" className="h-16 w-16 rounded-xl object-cover border border-zinc-700" />
                  <button
                    onClick={clearPendingImage}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center transition-colors"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-300 truncate">{pendingImage?.name}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    {pendingImage ? (pendingImage.size / 1024).toFixed(0) + " KB" : ""}
                  </p>
                  <p className="text-[10px] text-indigo-400 mt-0.5">Ready to send with your message</p>
                </div>
              </div>
            )}

            {/* Input pill */}
            <div className={`bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/80 rounded-full flex items-center px-2 py-2 shadow-2xl transition-all focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-700/50 ${isGuestLimitReached ? "opacity-50 pointer-events-none" : ""}`}>
              {/* Document upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="p-3 text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 rounded-full transition-colors shrink-0 disabled:opacity-50 ml-1"
                title="Upload PDF / TXT"
              >
                {isUploading
                  ? <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                  : <Paperclip className="w-5 h-5" />}
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".txt,.pdf" />

              {/* Image upload */}
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={isLoading}
                className={`p-3 rounded-full transition-colors shrink-0 disabled:opacity-50 ${pendingImage ? "text-purple-400 bg-purple-500/10" : "text-zinc-500 hover:text-purple-400 hover:bg-zinc-800"}`}
                title="Send an image"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              <input type="file" ref={imageInputRef} onChange={handleImageSelect} className="hidden" accept="image/jpeg,image/png,image/webp,image/gif" />

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                }}
                disabled={isLoading}
                placeholder={pendingImage ? "Ask about this image…" : "Ask Gemini"}
                className="flex-1 bg-transparent border-none text-white px-3 py-3 focus:outline-none focus:ring-0 placeholder:text-zinc-500 text-[15px] min-w-0"
              />

              <button
                onClick={() => sendMessage()}
                disabled={(!inputText.trim() && !pendingImage) || isLoading}
                className="p-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors disabled:opacity-30 mr-1"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

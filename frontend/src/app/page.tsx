"use client";

import { useState, useEffect, useRef, useCallback, ReactNode } from "react";
import {
  Send, Paperclip, Bot, LogOut, Menu, X, Plus,
  Image as ImageIcon, Search, SlidersHorizontal,
  MoreHorizontal, PenSquare, ChevronDown, Mic,
} from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────
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

// ── Markdown renderer ──────────────────────────────────────────────────────────
function InlineText({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  const regex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    const m = match[0];
    if (m.startsWith("**")) {
      parts.push(<strong key={key++} className="font-semibold text-[#1a1a18]">{m.slice(2, -2)}</strong>);
    } else if (m.startsWith("`")) {
      parts.push(
        <code key={key++} className="bg-zinc-100 text-[#c2410c] px-1.5 py-0.5 rounded text-[0.83em] font-mono border border-zinc-200">
          {m.slice(1, -1)}
        </code>
      );
    } else if (m.startsWith("*")) {
      parts.push(<em key={key++}>{m.slice(1, -1)}</em>);
    }
    lastIndex = match.index + m.length;
  }
  if (lastIndex < text.length) parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  return parts.length > 0 ? <>{parts}</> : <>{text}</>;
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={`code-${i}`} className="bg-[#f7f6f3] border border-[#e5e3df] rounded-xl px-4 py-3.5 overflow-x-auto my-3 text-[13px]">
          <code className="font-mono text-[#374151] leading-relaxed">{codeLines.join("\n")}</code>
        </pre>
      );
      i++;
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="font-semibold text-[#1a1a18] mt-4 mb-1 text-[15px]"><InlineText text={line.slice(4)} /></h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="font-bold text-[#1a1a18] mt-5 mb-2 text-[17px]"><InlineText text={line.slice(3)} /></h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="font-bold text-[#1a1a18] mt-5 mb-2 text-[19px]"><InlineText text={line.slice(2)} /></h1>);
    }
    // Horizontal rule
    else if (line.match(/^-{3,}$/)) {
      elements.push(<hr key={i} className="border-[#e5e3df] my-4" />);
    }
    // Bullet list — consume consecutive lines
    else if (line.match(/^[-*] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 my-2 space-y-1">
          {items.map((item, j) => (
            <li key={j} className="text-[#3d3b38] leading-relaxed"><InlineText text={item} /></li>
          ))}
        </ul>
      );
      continue;
    }
    // Ordered list
    else if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal pl-5 my-2 space-y-1">
          {items.map((item, j) => (
            <li key={j} className="text-[#3d3b38] leading-relaxed"><InlineText text={item} /></li>
          ))}
        </ol>
      );
      continue;
    }
    // Empty line
    else if (line.trim() === "") {
      elements.push(<div key={i} className="h-3" />);
    }
    // Regular text
    else {
      elements.push(
        <p key={i} className="text-[#3d3b38] leading-[1.7] my-0.5">
          <InlineText text={line} />
        </p>
      );
    }

    i++;
  }

  return <div className="text-[15px]">{elements}</div>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function generateSessionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [guestSessionId, setGuestSessionId] = useState<string>("");
  const [guestMessageCount, setGuestMessageCount] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);

  // Image
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const API_BASE = "/api/py";
  const GUEST_LIMIT = 3;

  // ── Guest session init ────────────────────────────────────────────
  useEffect(() => {
    let s = localStorage.getItem("guest_session_id");
    if (!s) { s = Math.random().toString(36).substring(2, 15); localStorage.setItem("guest_session_id", s); }
    setGuestSessionId(s);
    setGuestMessageCount(parseInt(localStorage.getItem(`guest_count_${s}`) || "0"));
  }, []);

  useEffect(() => {
    if (!currentSessionId) setCurrentSessionId(generateSessionId());
  }, []);

  const getHeaders = useCallback((): Record<string, string> => {
    if (status === "authenticated" && (session as any)?.accessToken)
      return { Authorization: `Bearer ${(session as any).accessToken}` };
    return { "X-Session-ID": guestSessionId };
  }, [status, session, guestSessionId]);

  const updateGuestCount = () => {
    if (status === "unauthenticated") {
      const n = guestMessageCount + 1;
      setGuestMessageCount(n);
      localStorage.setItem(`guest_count_${guestSessionId}`, n.toString());
      return n;
    }
    return guestMessageCount;
  };

  // ── Sessions ──────────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    if (status === "loading" || (!guestSessionId && status === "unauthenticated")) return;
    setSessionsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sessions`, { headers: getHeaders() });
      if (res.ok) setSessions(await res.json());
    } catch (e) { console.error(e); }
    finally { setSessionsLoading(false); }
  }, [status, guestSessionId, getHeaders]);

  const loadSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setMessages([]);
    clearPendingImage();
    try {
      const res = await fetch(`${API_BASE}/history?session_id=${encodeURIComponent(sessionId)}`, { headers: getHeaders() });
      if (res.ok) {
        const data: Message[] = await res.json();
        setMessages(data || []);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    } catch (e) { console.error(e); }
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

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [inputText]);

  // ── Image ─────────────────────────────────────────────────────────
  const clearPendingImage = () => {
    setPendingImage(null);
    setPendingImagePreview("");
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      alert("Only JPEG, PNG, WebP, and GIF images are supported."); return;
    }
    if (file.size > 10 * 1024 * 1024) { alert("Image must be smaller than 10 MB."); return; }
    setPendingImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPendingImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ── Send ──────────────────────────────────────────────────────────
  const sendMessage = async () => {
    const textToSend = inputText.trim();
    if ((!textToSend && !pendingImage) || isLoading) return;

    if (status === "unauthenticated" && guestMessageCount >= GUEST_LIMIT) {
      router.push("/signup"); return;
    }

    const imgSnap = pendingImage;
    const previewSnap = pendingImagePreview;
    setMessages((p) => [...p, { role: "user", content: textToSend, imagePreview: previewSnap || undefined }]);
    setInputText("");
    clearPendingImage();
    setIsLoading(true);
    updateGuestCount();

    try {
      let data: { reply: string; grounded: boolean };

      if (imgSnap) {
        const fd = new FormData();
        fd.append("image", imgSnap);
        fd.append("message", textToSend || "Describe this image.");
        fd.append("session_id", currentSessionId);
        const res = await fetch(`${API_BASE}/chat/vision`, { method: "POST", headers: getHeaders(), body: fd });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Vision failed");
        data = await res.json();
      } else {
        const res = await fetch(`${API_BASE}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getHeaders() },
          body: JSON.stringify({ message: textToSend, session_id: currentSessionId }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Request failed");
        data = await res.json();
      }

      setMessages((p) => [...p, { role: "assistant", content: data.reply }]);
      setTimeout(() => fetchSessions(), 500);
    } catch (err: any) {
      setMessages((p) => [...p, { role: "assistant", content: `Error: ${err.message}` }]);
    }
    setIsLoading(false);
  };

  // ── File upload ───────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/upload`, { method: "POST", headers: getHeaders(), body: fd });
      if (res.ok) {
        const { doc_id } = await res.json();
        if (fileInputRef.current) fileInputRef.current.value = "";
        const poll = setInterval(async () => {
          try {
            const s = await fetch(`${API_BASE}/upload/status/${doc_id}`, { headers: getHeaders() });
            if (s.ok) {
              const { status: st } = await s.json();
              if (st === "ready") {
                clearInterval(poll); setIsUploading(false);
                setMessages((p) => [...p, { role: "assistant", content: `Document ingested: **${file.name}**` }]);
              } else if (st === "failed") { clearInterval(poll); setIsUploading(false); alert("Failed to process document"); }
            }
          } catch { clearInterval(poll); setIsUploading(false); }
        }, 2000);
      } else {
        throw new Error((await res.json()).detail || "Upload failed");
      }
    } catch (err: any) {
      alert(err.message || "Upload failed"); setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center bg-white"><div className="text-zinc-400 text-sm animate-pulse">Loading…</div></div>;
  }

  const isGuestLimitReached = status === "unauthenticated" && guestMessageCount >= GUEST_LIMIT;
  const currentTitle = sessions.find((s) => s.session_id === currentSessionId)?.title;
  const displayName = session?.user?.name?.split(" ")[0] || (status === "unauthenticated" ? "Guest" : "You");
  const userInitials = session?.user?.name
    ? session.user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "G";

  // ── Sidebar content ───────────────────────────────────────────────
  const Sidebar = () => (
    <div className="flex flex-col h-full bg-[#f5f3ef]">
      {/* Brand header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2">
        <span className="text-[17px] font-bold tracking-tight">
          <span className="text-indigo-600">RAG</span><span className="text-[#1a1a18]">'asiam</span>
        </span>
        <div className="flex items-center gap-0.5">
          <button className="p-1.5 rounded-lg text-[#6b6965] hover:text-[#1a1a18] hover:bg-[#ebe8e3] transition-colors" title="Search">
            <Search className="w-4 h-4" />
          </button>
          <button onClick={startNewChat} className="p-1.5 rounded-lg text-[#6b6965] hover:text-[#1a1a18] hover:bg-[#ebe8e3] transition-colors" title="New chat">
            <PenSquare className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* New chat */}
      <div className="px-3 pb-3">
        <button
          onClick={startNewChat}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-[#4a4845] hover:bg-[#ebe8e3] transition-colors text-[13.5px] font-medium border border-[#e0ddd8]"
        >
          <Plus className="w-3.5 h-3.5" />
          New chat
        </button>
      </div>

      {/* Recents */}
      <div className="flex items-center justify-between px-4 py-1.5">
        <span className="text-[11px] font-semibold text-[#9a9591] uppercase tracking-wider">Recents</span>
        <button className="p-0.5 rounded text-[#b5b2ae] hover:text-[#6b6965] transition-colors">
          <SlidersHorizontal className="w-3 h-3" />
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2" style={{ scrollbarWidth: "thin", scrollbarColor: "#d4d0cb transparent" }}>
        {sessionsLoading ? (
          <div className="px-2 pt-1 space-y-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="h-8 rounded-lg bg-[#ebe8e3] animate-pulse" style={{ opacity: 1 - n * 0.12 }} />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-[12px] text-[#9a9591] text-center py-6">No conversations yet</p>
        ) : (
          sessions.map((s) => {
            const isActive = s.session_id === currentSessionId;
            return (
              <div
                key={s.session_id}
                className="relative group"
                onMouseEnter={() => setHoveredSession(s.session_id)}
                onMouseLeave={() => setHoveredSession(null)}
              >
                <button
                  onClick={() => loadSession(s.session_id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[13.5px] leading-snug transition-colors ${
                    isActive
                      ? "bg-[#ebe8e3] text-[#1a1a18] font-medium"
                      : "text-[#4a4845] hover:bg-[#eee9e2] hover:text-[#1a1a18]"
                  }`}
                >
                  <span className="block truncate pr-5">{s.title}</span>
                </button>
                {(hoveredSession === s.session_id || isActive) && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-[#9a9591] hover:text-[#4a4845] opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* User profile */}
      <div className="px-3 py-3 border-t border-[#e5e3df] relative">
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-xl hover:bg-[#ebe8e3] transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
            {userInitials}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-[13px] font-medium text-[#1a1a18] truncate leading-tight">
              {session?.user?.name || "Guest"}
            </p>
            <p className="text-[11px] text-[#9a9591]">Free plan</p>
          </div>
        </button>

        {userMenuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-1 bg-white border border-[#e5e3df] rounded-xl shadow-lg py-1 z-50">
            {status === "authenticated" ? (
              <>
                <div className="px-3 py-2 border-b border-[#f0ede8]">
                  <p className="text-[13px] font-medium text-[#1a1a18] truncate">{session.user.name}</p>
                  <p className="text-[11px] text-[#9a9591] truncate">{session.user.email}</p>
                </div>
                <button
                  onClick={() => signOut()}
                  className="w-full text-left px-3 py-2 text-[13px] text-red-500 hover:bg-[#fef2f2] flex items-center gap-2 rounded-lg mx-1"
                  style={{ width: "calc(100% - 8px)" }}
                >
                  <LogOut className="w-3.5 h-3.5" /> Log out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="block px-3 py-2 text-[13px] text-[#4a4845] hover:bg-[#f5f3ef]">Log in</Link>
                <Link href="/signup" className="block px-3 py-2 text-[13px] text-[#4a4845] hover:bg-[#f5f3ef]">Sign up</Link>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-white text-[#1a1a18] overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Desktop sidebar */}
      <aside className={`hidden md:block shrink-0 border-r border-[#e5e3df] overflow-hidden transition-all duration-200 ${sidebarOpen ? "w-[260px]" : "w-0"}`}>
        <Sidebar />
      </aside>

      {/* Mobile sidebar */}
      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed left-0 top-0 bottom-0 w-[270px] z-40 md:hidden border-r border-[#e5e3df] overflow-hidden">
            <Sidebar />
          </div>
        </>
      )}

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0 h-full">

        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#f0ede8] bg-white shrink-0">
          <div className="flex items-center gap-2">
            {/* Sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden md:flex p-1.5 rounded-lg text-[#9a9591] hover:text-[#1a1a18] hover:bg-[#f5f3ef] transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>
            <button onClick={() => setMobileMenuOpen(true)} className="md:hidden p-1.5 rounded-lg text-[#9a9591] hover:bg-[#f5f3ef]">
              <Menu className="w-4 h-4" />
            </button>

            {/* Conversation title */}
            {currentTitle ? (
              <button className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[#f5f3ef] transition-colors max-w-[300px] md:max-w-[500px]">
                <span className="text-[14px] font-semibold text-[#1a1a18] truncate">{currentTitle}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#9a9591] shrink-0" />
              </button>
            ) : (
              <span className="text-[14px] font-semibold text-[#1a1a18]">
                <span className="text-indigo-600">RAG</span>'asiam
              </span>
            )}
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            {status === "unauthenticated" && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-[#f5f3ef] rounded-full text-[12px] text-[#6b6965]">
                Free plan
                <Link href="/signup" className="text-indigo-600 font-medium hover:underline ml-1">Upgrade</Link>
              </div>
            )}
          </div>
        </header>

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e3df transparent" }}>
          {messages.length === 0 ? (
            /* Empty state */
            <div className="h-full flex flex-col items-center justify-center px-8">
              <div className="mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-[28px] md:text-[34px] font-semibold text-[#1a1a18] text-center">
                  How can I help you, {displayName}?
                </h1>
              </div>
              {isGuestLimitReached && (
                <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-[13px] text-amber-700 text-center max-w-sm">
                  You've reached the free limit.{" "}
                  <Link href="/signup" className="font-semibold underline">Sign up</Link> to continue.
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-[720px] mx-auto px-4 md:px-8 py-8 flex flex-col gap-6">
              {messages.map((m, idx) => (
                <div key={idx}>
                  {m.role === "user" ? (
                    /* User message — right-aligned subtle bubble */
                    <div className="flex justify-end">
                      <div className="max-w-[75%] bg-[#f0ece6] rounded-[20px] px-4 py-3">
                        {m.imagePreview && (
                          <img src={m.imagePreview} alt="uploaded" className="rounded-xl max-h-56 max-w-full object-cover mb-2" />
                        )}
                        {m.content && (
                          <p className="text-[15px] text-[#1a1a18] leading-relaxed whitespace-pre-wrap">{m.content}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Assistant message — left-aligned, no bubble, markdown */
                    <div className="flex gap-3 items-start">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <MarkdownRenderer content={m.content} />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {isLoading && (
                <div className="flex gap-3 items-start">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex items-center gap-1 pt-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#c5c1bc] animate-bounce" />
                    <span className="w-2 h-2 rounded-full bg-[#c5c1bc] animate-bounce [animation-delay:0.15s]" />
                    <span className="w-2 h-2 rounded-full bg-[#c5c1bc] animate-bounce [animation-delay:0.3s]" />
                  </div>
                </div>
              )}
              {isUploading && (
                <div className="flex gap-3 items-center text-[13px] text-[#9a9591]">
                  <Paperclip className="w-4 h-4 animate-pulse" /> Ingesting document…
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Input area ── */}
        <div className="shrink-0 px-4 md:px-8 pb-6 pt-3 bg-white border-t border-[#f0ede8]">
          <div className="max-w-[720px] mx-auto">

            {/* Image preview */}
            {pendingImagePreview && (
              <div className="flex items-center gap-3 mb-3 p-2.5 bg-[#f5f3ef] rounded-xl border border-[#e5e3df]">
                <div className="relative shrink-0">
                  <img src={pendingImagePreview} alt="pending" className="h-14 w-14 rounded-lg object-cover border border-[#e5e3df]" />
                  <button
                    onClick={clearPendingImage}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#6b6965] hover:bg-[#4a4845] flex items-center justify-center"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-[#4a4845] truncate">{pendingImage?.name}</p>
                  <p className="text-[11px] text-[#9a9591]">{pendingImage ? (pendingImage.size / 1024).toFixed(0) + " KB" : ""} · Image ready</p>
                </div>
              </div>
            )}

            {/* Main input box */}
            <div className={`border rounded-2xl bg-white transition-shadow ${
              isGuestLimitReached ? "opacity-50 pointer-events-none border-[#e5e3df]" : "border-[#d4d0cb] hover:border-[#b5b2ae] focus-within:border-[#9a9591] focus-within:shadow-sm"
            }`}>
              {/* Textarea */}
              <div className="px-4 pt-3.5 pb-2">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                  }}
                  disabled={isLoading || isGuestLimitReached}
                  placeholder={pendingImage ? "Ask about this image…" : "Write a message…"}
                  rows={1}
                  className="w-full bg-transparent text-[15px] text-[#1a1a18] placeholder:text-[#b5b2ae] resize-none focus:outline-none leading-relaxed disabled:opacity-50"
                  style={{ minHeight: "24px", maxHeight: "200px", overflowY: "auto" }}
                />
              </div>

              {/* Toolbar */}
              <div className="flex items-center justify-between px-3 pb-3">
                <div className="flex items-center gap-1">
                  {/* Attach document */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="p-2 rounded-lg text-[#9a9591] hover:text-[#4a4845] hover:bg-[#f5f3ef] transition-colors disabled:opacity-40"
                    title="Upload PDF / TXT"
                  >
                    {isUploading
                      ? <div className="w-4 h-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                      : <Plus className="w-4 h-4" />}
                  </button>
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".txt,.pdf" />

                  {/* Attach image */}
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isLoading}
                    className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${pendingImage ? "text-indigo-600 bg-indigo-50" : "text-[#9a9591] hover:text-[#4a4845] hover:bg-[#f5f3ef]"}`}
                    title="Send an image"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>
                  <input type="file" ref={imageInputRef} onChange={handleImageSelect} className="hidden" accept="image/jpeg,image/png,image/webp,image/gif" />
                </div>

                <div className="flex items-center gap-2">
                  {/* Model label */}
                  <button className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-[#6b6965] hover:bg-[#f5f3ef] transition-colors font-medium">
                    <span className="text-indigo-600 font-semibold text-[11px]">RAG</span>'asiam Pro
                    <ChevronDown className="w-3 h-3 text-[#b5b2ae]" />
                  </button>

                  {/* Mic */}
                  <button className="p-2 rounded-lg text-[#9a9591] hover:text-[#4a4845] hover:bg-[#f5f3ef] transition-colors">
                    <Mic className="w-4 h-4" />
                  </button>

                  {/* Send */}
                  <button
                    onClick={sendMessage}
                    disabled={(!inputText.trim() && !pendingImage) || isLoading || isGuestLimitReached}
                    className="p-2 rounded-lg bg-[#1a1a18] text-white hover:bg-[#2d2d2b] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <p className="text-center text-[11px] text-[#b5b2ae] mt-2">
              RAG'asiam can make mistakes. Always verify important information.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

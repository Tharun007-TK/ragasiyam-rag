"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Paperclip, Bot, User, LogOut, ChevronUp, ChevronDown, Menu, X } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [guestSessionId, setGuestSessionId] = useState<string>("");
  const [guestMessageCount, setGuestMessageCount] = useState(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_BASE = "/api/py";
  const GUEST_LIMIT = 3;

  useEffect(() => {
    // Generate or load guest session
    let storedSession = localStorage.getItem("guest_session_id");
    if (!storedSession) {
      storedSession = Math.random().toString(36).substring(2, 15);
      localStorage.setItem("guest_session_id", storedSession);
    }
    setGuestSessionId(storedSession);

    // Load guest count
    const count = parseInt(localStorage.getItem(`guest_count_${storedSession}`) || "0");
    setGuestMessageCount(count);
  }, []);

  const getHeaders = () => {
    const headers: Record<string, string> = {};
    if (status === "authenticated" && (session as any)?.accessToken) {
      headers["Authorization"] = `Bearer ${(session as any).accessToken}`;
    } else {
      headers["X-Session-ID"] = guestSessionId;
    }
    return headers;
  };

  const updateGuestCount = () => {
    if (status === "unauthenticated") {
      const newCount = guestMessageCount + 1;
      setGuestMessageCount(newCount);
      localStorage.setItem(`guest_count_${guestSessionId}`, newCount.toString());
      return newCount;
    }
    return guestMessageCount;
  };

  const fetchHistory = async () => {
    if (status === "loading" || (!guestSessionId && status === "unauthenticated")) return;
    
    try {
      const res = await fetch(`${API_BASE}/history`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    } catch (error) {
      console.error("Failed to load history", error);
    }
  };

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, guestSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e?: React.FormEvent, textOverride?: string) => {
    e?.preventDefault();
    const textToSend = textOverride || inputText;
    if (!textToSend.trim() || isLoading) return;

    if (status === "unauthenticated" && guestMessageCount >= GUEST_LIMIT) {
      alert("You have reached your free guest limit. Please log in or sign up to continue.");
      router.push("/signup");
      return;
    }

    const newUserMsg: Message = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, newUserMsg]);
    setInputText("");
    setIsLoading(true);

    updateGuestCount();

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getHeaders(),
        },
        body: JSON.stringify({ message: textToSend }),
      });
      
      if (!res.ok) {
        throw new Error("Failed to send message");
      }
      
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (error: any) {
      console.error(error);
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${error.message}` }]);
    }
    setIsLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (status === "unauthenticated" && guestMessageCount >= GUEST_LIMIT) {
      alert("You have reached your free guest limit. Please log in to upload documents.");
      router.push("/login");
      return;
    }

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
        
        // Poll for status
        const pollStatus = setInterval(async () => {
          try {
            const statusRes = await fetch(`${API_BASE}/upload/status/${docId}`, { headers: getHeaders() });
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.status === "ready") {
                clearInterval(pollStatus);
                setIsUploading(false);
                updateGuestCount();
                setMessages((prev) => [...prev, { role: "assistant", content: `Successfully ingested document: ${file.name}` }]);
              } else if (statusData.status === "failed") {
                clearInterval(pollStatus);
                setIsUploading(false);
                alert("Failed to process document");
              }
            }
          } catch (e) {
            console.error(e);
            clearInterval(pollStatus);
            setIsUploading(false);
          }
        }, 2000);
        
        return; // Don't set isUploading=false yet
      } else {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Failed to upload document");
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSuggestionClick = (text: string) => {
    sendMessage(undefined, text);
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
    : (status === "unauthenticated" ? "Guest" : "Tharun");

  return (
    <div className="flex h-screen w-full bg-[#0f0f11] text-zinc-100 overflow-hidden font-sans relative">
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-20 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Minimal Sidebar */}
      <aside className={`absolute md:static transition-all duration-300 ease-in-out border-r border-zinc-900 bg-zinc-950 flex flex-col items-center py-6 h-full z-30 ${sidebarOpen ? "translate-x-0 w-64 px-4" : "-translate-x-full md:translate-x-0 w-16"}`}>
        
        {/* Top Actions */}
        <div className="flex flex-col gap-4 w-full items-center">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden md:flex p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors self-center"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <button className="md:hidden p-2 rounded-xl text-zinc-400 self-end" onClick={() => setSidebarOpen(false)}>
             <X className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => { setMessages([]); setSidebarOpen(false); }}
            className={`flex items-center gap-3 p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-900 transition-colors w-full ${sidebarOpen ? "justify-start px-3" : "justify-center"}`}
          >
            <Send className="w-5 h-5" />
            {sidebarOpen && <span className="text-sm font-medium">New chat</span>}
          </button>
        </div>

        {/* History Area */}
        <div className="flex-1 w-full overflow-y-auto mt-8 flex flex-col gap-2 no-scrollbar">
          {sidebarOpen && (
            <div className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-2 px-2">History</div>
          )}
          {sidebarOpen && [1, 2, 3].map((i) => (
            <button key={i} className="text-left w-full p-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg truncate transition-colors">
              Chat session {i}
            </button>
          ))}
        </div>

        {/* User Profile */}
        <div className="mt-auto w-full relative">
          <button 
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className={`flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-900 transition-colors w-full ${sidebarOpen ? "justify-between px-3" : "justify-center"}`}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium shrink-0">
              {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : "G"}
            </div>
            {sidebarOpen && (
              <div className="flex-1 text-left truncate">
                <p className="text-sm font-medium truncate">{session?.user?.name || "Guest"}</p>
              </div>
            )}
            {sidebarOpen && <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" />}
          </button>

          {/* User Menu Dropdown */}
          {userMenuOpen && (
            <div className={`absolute bottom-full left-0 mb-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1 z-50 ${sidebarOpen ? "w-full" : "w-48 ml-2"}`}>
              {status === "authenticated" ? (
                <>
                  <div className="px-3 py-2 border-b border-zinc-800 mb-1">
                    <p className="text-sm font-medium text-white truncate">{session.user.name}</p>
                    <p className="text-xs text-zinc-400 truncate">{(session.user as any).username ? `@${(session.user as any).username}` : session.user.email}</p>
                  </div>
                  <button 
                    onClick={() => signOut()}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-zinc-800 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" /> Log out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="block px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white">Log in</Link>
                  <Link href="/signup" className="block px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white">Sign up</Link>
                </>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative h-full min-w-0">
        
        {/* Mobile Header */}
        <header className="md:hidden flex items-center p-4 border-b border-zinc-900 z-10 shrink-0 bg-[#0f0f11]/80 backdrop-blur-md">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-zinc-400">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-white ml-2 tracking-wide text-sm">Ragasiyam</span>
        </header>

        {/* Subtle radial glow in the center */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none" />

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-40 no-scrollbar relative z-10 flex flex-col">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center -mt-20">
              <h1 className="text-4xl md:text-[44px] font-medium tracking-tight mb-12 text-center text-white drop-shadow-sm">
                What's the vibe, {displayName}?
              </h1>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full flex flex-col gap-6 pt-8">
              {messages.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-3xl px-5 py-3.5 ${
                    m.role === "user" 
                      ? "bg-zinc-800 text-zinc-100" 
                      : "bg-transparent text-zinc-300"
                  }`}>
                    {m.role === "assistant" && (
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center shrink-0">
                          <Bot className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-xs font-medium text-zinc-500">Ragasiyam Core</span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-transparent text-zinc-500 px-5 py-3.5 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-zinc-600 animate-bounce" />
                    <div className="w-2 h-2 rounded-full bg-zinc-600 animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 rounded-full bg-zinc-600 animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
              {isUploading && (
                <div className="flex justify-start">
                  <div className="bg-transparent text-zinc-500 px-5 py-3.5 flex items-center gap-2 text-sm">
                    <Paperclip className="w-4 h-4 animate-pulse" /> Ingesting document...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:px-8 pb-8 bg-gradient-to-t from-[#0f0f11] via-[#0f0f11] to-transparent z-20">
          
          {isGuestLimitReached && (
            <div className="max-w-3xl mx-auto mb-4 p-3 bg-indigo-950/50 border border-indigo-900/50 rounded-xl text-indigo-200 text-sm text-center backdrop-blur-md">
              You've reached your free guest limit. <Link href="/signup" className="font-semibold underline hover:text-white">Sign up</Link> to continue chatting and uploading documents.
            </div>
          )}

          <div className="max-w-3xl mx-auto relative">
            <div className={`bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/80 rounded-full flex items-center px-2 py-2 shadow-2xl transition-all focus-within:border-zinc-700 focus-within:bg-zinc-900 focus-within:ring-1 focus-within:ring-zinc-700 ${isGuestLimitReached ? 'opacity-50 pointer-events-none' : ''}`}>
              
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isGuestLimitReached}
                className="p-3 text-blue-500 hover:bg-zinc-800 rounded-full transition-colors shrink-0 disabled:opacity-50 flex items-center justify-center ml-1"
                title="Attach a file"
              >
                {isUploading ? <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" /> : <Paperclip className="w-5 h-5" />}
              </button>
              
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileUpload} 
                className="hidden" 
                accept=".txt,.pdf"
              />

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                disabled={isLoading || isGuestLimitReached}
                placeholder="Ask Gemini"
                className="flex-1 bg-transparent border-none text-white px-3 py-3 focus:outline-none focus:ring-0 placeholder:text-zinc-500 text-[15px] min-w-0"
              />

              <div className="flex items-center pr-2 shrink-0 gap-2">
                {/* Model Indicator Pill */}
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer text-xs font-medium text-zinc-300 select-none border border-transparent hover:border-zinc-700">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                  Pro
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                </div>
                
                <button
                  onClick={() => sendMessage()}
                  disabled={!inputText.trim() || isLoading || isGuestLimitReached}
                  className="p-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors disabled:opacity-30 flex items-center justify-center mr-1"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}

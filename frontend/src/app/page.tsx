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

  const API_BASE = "http://localhost:8000";
  const GUEST_LIMIT = 3;

  useEffect(() => {
    // Generate or load guest session
    let storedSession = localStorage.getItem("guest_session_id");
    if (!storedSession) {
      storedSession = Math.random().toString(36).substring(2, 15);
      localStorage.setItem("guest_session_id", storedSession);
    }
    setGuestSessionId(storedSession);
    
    // Load guest message count
    const count = parseInt(localStorage.getItem("guest_message_count") || "0", 10);
    setGuestMessageCount(count);
  }, []);

  // Fetch user history once authenticated or if guest
  useEffect(() => {
    if (status === "authenticated" && (session as any)?.accessToken) {
      fetchHistory();
    } else if (status === "unauthenticated" && guestSessionId) {
      fetchHistory();
    }
  }, [status, session, guestSessionId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getHeaders = () => {
    const headers: Record<string, string> = {};
    if (status === "authenticated" && (session as any)?.accessToken) {
      headers["Authorization"] = `Bearer ${(session as any).accessToken}`;
    } else if (guestSessionId) {
      headers["X-Session-ID"] = guestSessionId;
    }
    return headers;
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/history`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (error) {
      console.error("Failed to fetch history", error);
    }
  };

  const sendMessage = async (e?: React.FormEvent, textOverride?: string) => {
    if (e) e.preventDefault();
    
    if (status === "unauthenticated" && guestMessageCount >= GUEST_LIMIT) {
      alert("You have reached your free guest limit. Please log in to continue.");
      router.push("/login");
      return;
    }

    const textToSend = textOverride || inputText;
    if (!textToSend.trim() || isLoading) return;

    if (status === "unauthenticated") {
      const newCount = guestMessageCount + 1;
      setGuestMessageCount(newCount);
      localStorage.setItem("guest_message_count", newCount.toString());
    }

    const userMessage: Message = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);

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
        if (res.status === 429) throw new Error("Rate limit exceeded. Please wait a moment.");
        if (res.status === 401 && status === "authenticated") signOut();
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
        setMessages((prev) => [...prev, { role: "assistant", content: `Successfully ingested document: ${file.name}` }]);
      } else {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Failed to upload document");
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSuggestionClick = (text: string) => {
    sendMessage(undefined, text);
  };

  if (status === "loading") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <div className="animate-pulse text-zinc-400">Loading...</div>
      </div>
    );
  }

  const isGuestLimitReached = status === "unauthenticated" && guestMessageCount >= GUEST_LIMIT;

  return (
    <div className="flex w-full h-screen bg-white text-zinc-900 overflow-hidden relative font-sans">
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`absolute md:static w-64 h-full bg-[#f9f9f9] border-r border-zinc-200 flex flex-col z-30 transition-transform transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="p-4 flex items-center justify-between">
          <span className="font-semibold text-xs tracking-wide text-zinc-500 uppercase mt-1">History</span>
          <button className="md:hidden p-1 text-zinc-500" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {messages.length === 0 ? (
            <div className="text-[13px] text-zinc-400 leading-relaxed mt-2">
              Your conversations will appear here once you start chatting!
            </div>
          ) : (
            <div className="text-[14px] text-zinc-700 truncate hover:bg-zinc-100 p-2 rounded-lg cursor-pointer">
              {messages.filter(m => m.role === 'user')[0]?.content || "Current Session"}
            </div>
          )}
        </div>

        {/* User Profile Dropdown Area */}
        <div className="p-3 relative">
          <button 
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center w-full p-2 hover:bg-zinc-200/50 rounded-xl transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-[#5d3f3f] text-white flex items-center justify-center flex-shrink-0 text-sm font-medium">
              {status === "authenticated" ? session?.user?.email?.[0].toUpperCase() : "G"}
            </div>
            <div className="ml-3 flex-1 overflow-hidden">
              <div className="text-sm font-medium truncate text-zinc-800">
                {status === "authenticated" ? session?.user?.email : "Guest"}
              </div>
            </div>
            {userMenuOpen ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronUp className="w-4 h-4 text-zinc-400" />}
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-16 left-3 right-3 bg-white border border-zinc-200 rounded-xl shadow-lg py-1 z-40 animate-in fade-in zoom-in-95 duration-100">
              {status === "authenticated" ? (
                <button 
                  onClick={() => signOut()} 
                  className="w-full text-left px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" /> Log out
                </button>
              ) : (
                <>
                  <Link href="/login" className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">Log In</Link>
                  <Link href="/signup" className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">Sign Up</Link>
                </>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full relative min-w-0 bg-white">
        
        {/* Mobile header (hamburger) */}
        <header className="md:hidden p-4 flex items-center border-b border-zinc-100">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-zinc-600">
            <Menu className="w-5 h-5" />
          </button>
          <div className="font-medium ml-2">Ragasiyam</div>
        </header>

        <div className="flex-1 overflow-y-auto w-full">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto px-4 pb-32 pt-10">
              <div className="w-16 h-16 bg-zinc-100 text-zinc-800 rounded-2xl flex items-center justify-center mb-6">
                <Bot className="w-8 h-8" />
              </div>
              <h1 className="text-3xl font-semibold text-zinc-800 mb-2 text-center">What can I help with?</h1>
              <p className="text-zinc-500 text-center mb-10 max-w-md leading-relaxed">
                Upload your documents and ask anything. I will securely answer strictly based on your files.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {[
                  "Summarize the key points in my document.",
                  "What are the action items?",
                  "Extract any names and dates.",
                  "Explain the main concept simply."
                ].map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="p-4 bg-white border border-zinc-200 rounded-xl text-left text-sm text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 transition-all shadow-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col w-full max-w-3xl mx-auto pb-48 pt-8 px-4">
              {messages.map((msg, i) => (
                <div 
                  key={i} 
                  className={`flex w-full mb-6 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`flex gap-4 max-w-[90%] md:max-w-[80%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                      msg.role === "user" 
                        ? "bg-zinc-200 text-zinc-600" 
                        : "bg-zinc-800 text-white shadow-sm"
                    }`}>
                      {msg.role === "user" ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                    </div>
                    
                    <div className={`px-5 py-3.5 rounded-2xl leading-relaxed text-[15px] ${
                      msg.role === "user" 
                        ? "bg-zinc-100 text-zinc-800 rounded-tr-sm" 
                        : "bg-white text-zinc-800 border border-zinc-200 shadow-sm rounded-tl-sm whitespace-pre-wrap"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex w-full mb-6 justify-start">
                  <div className="flex gap-4 flex-row">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 text-white flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div className="px-5 py-4 rounded-2xl bg-white border border-zinc-200 shadow-sm rounded-tl-sm flex items-center gap-2">
                      <span className="w-2 h-2 bg-zinc-800 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-2 h-2 bg-zinc-800 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-2 h-2 bg-zinc-800 rounded-full animate-bounce"></span>
                    </div>
                  </div>
                </div>
              )}
              
              {isUploading && (
                <div className="flex w-full mb-6 justify-start">
                  <div className="px-5 py-3 rounded-xl bg-zinc-50 text-zinc-700 text-sm border border-zinc-200 flex items-center ml-12">
                    <span className="animate-pulse flex items-center">
                      <Paperclip className="w-4 h-4 mr-2" />
                      Ingesting document...
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Updated Input Area */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent pt-12 pb-6 px-4">
          <div className="max-w-3xl mx-auto relative">
            
            {isGuestLimitReached && (
              <div className="absolute -top-14 left-0 right-0 flex justify-center">
                <div className="bg-amber-50 text-amber-800 px-4 py-2 rounded-full text-[13px] shadow-sm flex items-center gap-2 border border-amber-200">
                  Guest limit reached. <Link href="/login" className="underline font-medium hover:text-amber-900">Log in to continue</Link>
                </div>
              </div>
            )}

            <form 
              onSubmit={sendMessage}
              className={`bg-[#f4f4f4] border border-transparent rounded-2xl p-3 flex flex-col transition-all focus-within:bg-white focus-within:border-zinc-300 focus-within:shadow-md ${isGuestLimitReached ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask anything..."
                disabled={isLoading || isUploading || isGuestLimitReached}
                className="w-full bg-transparent resize-none border-none focus:outline-none text-[15px] placeholder-zinc-500 disabled:opacity-50 min-h-[50px] max-h-[200px] overflow-y-auto px-1"
                rows={2}
              />
              
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.txt,text/plain,application/pdf"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isLoading || isGuestLimitReached}
                    className="p-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/50 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center border border-zinc-200 bg-white"
                    title="Attach document (PDF/TXT)"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  
                  {/* Model Indicator */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-medium text-zinc-600 shadow-sm cursor-default">
                    <Bot className="w-3.5 h-3.5 text-zinc-700" />
                    Ragasiyam Core
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!inputText.trim() || isLoading || isUploading || isGuestLimitReached}
                  className={`p-2 rounded-xl flex items-center justify-center transition-all ${
                    inputText.trim() && !isLoading && !isUploading && !isGuestLimitReached
                      ? "bg-zinc-800 text-white hover:bg-zinc-900 shadow-sm"
                      : "bg-zinc-200 text-zinc-400"
                  }`}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
            
            <div className="text-center mt-3 text-xs text-zinc-400">
              Ragasiyam can make mistakes. Consider verifying critical information.
            </div>
          </div>
        </div>
        
      </main>
    </div>
  );
}

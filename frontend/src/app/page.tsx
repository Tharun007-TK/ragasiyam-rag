"use client";

import { useState, useEffect, useRef } from "react";
import { MessageSquare, Plus, Menu, X, Send, Paperclip, Bot, User } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

type Session = {
  session_id: string;
  first_message: string;
  timestamp: string | null;
};

export default function ChatPage() {
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_BASE = "http://localhost:8000";

  // Initialize session and fetch history
  useEffect(() => {
    if (!sessionId) {
      startNewChat();
    }
    fetchSessions();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startNewChat = () => {
    setSessionId(crypto.randomUUID());
    setMessages([]);
    setInputText("");
  };

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (error) {
      console.error("Failed to fetch sessions", error);
    }
  };

  const loadSession = async (id: string) => {
    setSessionId(id);
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/history/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (error) {
      console.error("Failed to load session", error);
    }
    setIsLoading(false);
    
    // Auto-close sidebar on mobile after selection
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const sendMessage = async (e?: React.FormEvent, textOverride?: string) => {
    if (e) e.preventDefault();
    
    const textToSend = textOverride || inputText;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: textToSend }),
      });

      if (!res.ok) throw new Error("Failed to send message");
      
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      
      // Refresh sidebar list if it's the first message
      if (messages.length === 0) fetchSessions();
    } catch (error) {
      console.error(error);
      setMessages((prev) => [...prev, { role: "assistant", content: "Error: Could not connect to backend." }]);
    }
    setIsLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("session_id", sessionId);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: `Successfully ingested document: ${file.name}` }]);
      } else {
        throw new Error("Upload failed");
      }
    } catch (error) {
      console.error(error);
      alert("Failed to upload document");
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSuggestionClick = (text: string) => {
    sendMessage(undefined, text);
  };

  return (
    <div className="flex w-full h-full bg-zinc-50 text-zinc-900">
      
      {/* Sidebar Overlay (Mobile) */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 md:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} 
          fixed md:relative z-50 flex flex-col w-64 h-full bg-white border-r border-zinc-200 transition-transform duration-300 ease-in-out`}
      >
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
          <button 
            onClick={startNewChat}
            className="flex-1 flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> New chat
          </button>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden ml-2 p-2 text-zinc-500 hover:bg-zinc-100 rounded-md"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-xs font-semibold text-zinc-500 mb-2 px-2 uppercase tracking-wider">History</p>
          {sessions.length === 0 ? (
            <p className="text-sm text-zinc-400 px-2 italic">No past sessions</p>
          ) : (
            <div className="flex flex-col gap-1">
              {sessions.map((s) => (
                <button
                  key={s.session_id}
                  onClick={() => loadSession(s.session_id)}
                  className={`flex items-start gap-3 p-2 rounded-lg text-left transition-colors ${
                    s.session_id === sessionId ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  <MessageSquare size={16} className="mt-0.5 shrink-0 opacity-70" />
                  <span className="text-sm truncate font-medium">
                    {s.first_message || "Empty chat"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-white relative">
        {/* Mobile Header */}
        <header className="h-14 border-b border-zinc-200 flex items-center px-4 bg-white/80 backdrop-blur-sm z-30 shrink-0 md:hidden">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors"
          >
            <Menu size={20} />
          </button>
          <span className="ml-3 font-semibold text-zinc-800">Ragasiyam Assistant</span>
        </header>
        
        {/* Desktop toggle if sidebar closed */}
        {!isSidebarOpen && (
           <button 
            onClick={() => setIsSidebarOpen(true)}
            className="absolute top-4 left-4 p-2 z-30 text-zinc-600 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-md transition-colors hidden md:block shadow-sm"
          >
            <Menu size={20} />
          </button>
        )}

        {/* Chat Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth pb-32">
          <div className="max-w-3xl mx-auto h-full flex flex-col">
            
            {messages.length === 0 ? (
              <div className="m-auto w-full flex flex-col items-center justify-center animate-in fade-in duration-500">
                <h1 className="text-3xl font-bold text-zinc-800 mb-2">What can I help with?</h1>
                <p className="text-zinc-500 mb-8 text-center max-w-sm">Upload documents to provide context to the assistant and start asking questions.</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                  {[
                    "Summarize the key points of the uploaded document.",
                    "What are the action items mentioned?",
                    "Explain the main concepts in simple terms.",
                    "Extract any names, dates, or specific numbers."
                  ].map((suggestion, i) => (
                    <button 
                      key={i}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="p-4 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 hover:border-zinc-300 transition-all text-left group shadow-sm"
                    >
                      <p className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900 leading-snug">{suggestion}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6 w-full pb-8">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-1">
                        <Bot size={18} className="text-blue-600" />
                      </div>
                    )}
                    
                    <div className={`px-5 py-3 rounded-2xl max-w-[85%] text-[15px] leading-relaxed shadow-sm ${
                      msg.role === "user" 
                        ? "bg-zinc-900 text-white rounded-br-sm" 
                        : "bg-white border border-zinc-200 text-zinc-800 rounded-bl-sm"
                    }`}>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>

                    {msg.role === "user" && (
                      <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center shrink-0 mt-1">
                        <User size={18} className="text-zinc-600" />
                      </div>
                    )}

                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex gap-4 justify-start">
                     <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-1">
                        <Bot size={18} className="text-blue-600" />
                      </div>
                      <div className="px-5 py-3 rounded-2xl bg-white border border-zinc-200 text-zinc-500 rounded-bl-sm flex gap-1.5 items-center shadow-sm h-12">
                        <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></div>
                      </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input Bar Fixed Bottom */}
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-white via-white to-transparent pt-8 pb-6 px-4 md:px-8">
          <div className="max-w-3xl mx-auto relative">
            <form 
              onSubmit={sendMessage}
              className="flex items-end gap-2 bg-white border border-zinc-300 rounded-3xl shadow-sm pr-2 pl-2 py-2 focus-within:ring-2 focus-within:ring-zinc-900 focus-within:border-zinc-900 transition-all"
            >
              <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                title="Attach Document"
                className="p-3 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-full transition-colors disabled:opacity-50 shrink-0"
              >
                <Paperclip size={20} />
              </button>
              
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Message Ragasiyam..."
                disabled={isLoading}
                rows={1}
                className="flex-1 bg-transparent outline-none py-3 text-[15px] placeholder:text-zinc-400 resize-none max-h-32 min-h-12 overflow-y-auto"
              />
              
              <button
                type="submit"
                disabled={!inputText.trim() || isLoading}
                className="p-3 bg-zinc-900 text-white rounded-full hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:bg-zinc-200 disabled:text-zinc-400 shrink-0"
              >
                <Send size={18} className="ml-0.5" />
              </button>
            </form>
            <p className="text-center text-[11px] text-zinc-400 mt-3 font-medium">
              Ragasiyam can make mistakes. Consider verifying important information.
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}

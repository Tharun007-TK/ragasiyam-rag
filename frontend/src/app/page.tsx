"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Paperclip, Bot, User, LogOut } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

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
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_BASE = "http://localhost:8000";

  // Redirect if unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Fetch user history once authenticated
  useEffect(() => {
    if (status === "authenticated" && (session as any)?.accessToken) {
      fetchHistory();
    }
  }, [status, session]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/history`, {
        headers: {
          Authorization: `Bearer ${(session as any)?.accessToken}`,
        },
      });
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
    
    const textToSend = textOverride || inputText;
    if (!textToSend.trim() || isLoading || !(session as any)?.accessToken) return;

    const userMessage: Message = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${(session as any).accessToken}`,
        },
        body: JSON.stringify({ message: textToSend }),
      });

      if (!res.ok) {
        if (res.status === 429) throw new Error("Rate limit exceeded. Please wait a moment.");
        if (res.status === 401) signOut();
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
    if (!file || !(session as any)?.accessToken) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${(session as any).accessToken}`,
        },
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

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-50">
        <div className="animate-pulse text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-screen bg-zinc-50 text-zinc-900 relative">
      {/* Header */}
      <header className="flex-shrink-0 h-14 border-b border-zinc-200 bg-white px-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2 font-medium text-zinc-800">
          <Bot className="w-5 h-5 text-blue-600" />
          Ragasiyam
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">{session?.user?.email}</span>
          <button 
            onClick={() => signOut()} 
            className="text-zinc-500 hover:text-zinc-800 p-2 rounded-md hover:bg-zinc-100 transition-colors"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto relative bg-zinc-50">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto px-4 pt-10 pb-32">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-blue-200">
              <Bot className="w-8 h-8 text-blue-600" />
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
          <div className="flex flex-col w-full max-w-3xl mx-auto pb-32 pt-8">
            {messages.map((msg, i) => (
              <div 
                key={i} 
                className={`flex w-full mb-6 px-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`flex gap-4 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                    msg.role === "user" 
                      ? "bg-zinc-200 text-zinc-600" 
                      : "bg-blue-600 text-white shadow-sm"
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
              <div className="flex w-full mb-6 px-4 justify-start">
                <div className="flex gap-4 max-w-[85%] flex-row">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="px-5 py-4 rounded-2xl bg-white border border-zinc-200 shadow-sm rounded-tl-sm flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></span>
                  </div>
                </div>
              </div>
            )}
            
            {isUploading && (
              <div className="flex w-full mb-6 px-4 justify-start">
                <div className="px-5 py-3 rounded-xl bg-blue-50 text-blue-700 text-sm border border-blue-100 flex items-center ml-12">
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
      </main>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-50 via-zinc-50 to-transparent pt-10 pb-6 px-4">
        <div className="max-w-3xl mx-auto relative">
          <form 
            onSubmit={sendMessage}
            className="flex items-center bg-white border border-zinc-300 rounded-full shadow-sm pr-2 pl-4 py-2 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all"
          >
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
              disabled={isUploading || isLoading}
              className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors disabled:opacity-50 flex-shrink-0"
              title="Attach document (PDF/TXT)"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Message Ragasiyam..."
              disabled={isLoading || isUploading}
              className="flex-1 bg-transparent border-none focus:outline-none px-3 text-[15px] placeholder-zinc-400 disabled:opacity-50"
            />
            
            <button
              type="submit"
              disabled={!inputText.trim() || isLoading || isUploading}
              className={`p-2 rounded-full flex items-center justify-center transition-colors ml-1 ${
                inputText.trim() && !isLoading && !isUploading
                  ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                  : "bg-zinc-100 text-zinc-400"
              }`}
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </form>
          <div className="text-center mt-3 text-xs text-zinc-400">
            Ragasiyam can make mistakes. Consider verifying critical information.
          </div>
        </div>
      </div>
      
    </div>
  );
}

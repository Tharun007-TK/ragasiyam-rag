"use client";

import { useState, useEffect, useRef, useCallback, ReactNode } from "react";
import {
  Send, Paperclip, Bot, Menu, X, Plus, Image as ImageIcon,
  Search, SlidersHorizontal, MoreHorizontal, PenSquare,
  ChevronDown, Mic, Settings, Globe, HelpCircle, Zap,
  Download, Info, LogOut, Moon, Sun, Type, Shield, BookOpen,
  Check, Trash2,
} from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";

// ─── Theme system ──────────────────────────────────────────────────────────────
const LIGHT = {
  mainBg:           '#ffffff',
  sidebarBg:        '#f5f3ef',
  sidebarBorder:    '#e5e3df',
  topBarBorder:     '#f0ede8',
  inputBg:          '#ffffff',
  inputBorder:      '#d4d0cb',
  inputBorderHover: '#b5b2ae',
  text:             '#1a1a18',
  textMuted:        '#6b6965',
  textFaint:        '#b5b2ae',
  placeholder:      '#b5b2ae',
  userBubble:       '#f0ece6',
  sessionActive:    '#ebe8e3',
  sessionHover:     '#eee9e2',
  menuBg:           '#ffffff',
  menuBorder:       '#e5e3df',
  menuHover:        '#f5f3ef',
  codeBlockBg:      '#f7f6f3',
  codeBlockBorder:  '#e5e3df',
  codeText:         '#374151',
  inlineCodeBg:     '#f0ece6',
  inlineCodeText:   '#c2410c',
  listText:         '#3d3b38',
  heading:          '#1a1a18',
  sendBtn:          '#1a1a18',
  sendBtnText:      '#ffffff',
  disclaimer:       '#b5b2ae',
  divider:          '#e5e3df',
  toolbarBtn:       '#9a9591',
  toolbarBtnHover:  '#4a4845',
  toolbarBtnHoverBg:'#f5f3ef',
  glowA: 'rgba(99,102,241,0.25)',
  glowB: 'rgba(139,92,246,0.2)',
  glowC: 'rgba(236,72,153,0.15)',
};

const DARK = {
  mainBg:           '#0f0f11',
  sidebarBg:        '#141416',
  sidebarBorder:    '#2a2a2d',
  topBarBorder:     '#1e1e21',
  inputBg:          '#141416',
  inputBorder:      '#2e2e32',
  inputBorderHover: '#3a3a3e',
  text:             '#e4e2de',
  textMuted:        '#7a7774',
  textFaint:        '#4a4845',
  placeholder:      '#4a4845',
  userBubble:       '#1e1e22',
  sessionActive:    '#1e1e22',
  sessionHover:     '#1a1a1d',
  menuBg:           '#1a1a1d',
  menuBorder:       '#2a2a2d',
  menuHover:        '#222226',
  codeBlockBg:      '#1a1a1d',
  codeBlockBorder:  '#2a2a2d',
  codeText:         '#a5b4fc',
  inlineCodeBg:     '#1e1e22',
  inlineCodeText:   '#fb923c',
  listText:         '#c4c2be',
  heading:          '#e4e2de',
  sendBtn:          '#e4e2de',
  sendBtnText:      '#141416',
  disclaimer:       '#4a4845',
  divider:          '#2a2a2d',
  toolbarBtn:       '#5a5855',
  toolbarBtnHover:  '#c4c2be',
  toolbarBtnHoverBg:'#1e1e22',
  glowA: 'rgba(99,102,241,0.4)',
  glowB: 'rgba(139,92,246,0.35)',
  glowC: 'rgba(236,72,153,0.25)',
};

// ─── Markdown renderer ─────────────────────────────────────────────────────────
function MarkdownRenderer({ content, t, model }: { content: string; t: typeof LIGHT; model?: string }) {
  let thinkContent = "";
  let mainContent = content;

  if (model === "deepseek-r1-distill-llama-70b") {
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      thinkContent = thinkMatch[1].trim();
      mainContent = content.replace(/<think>[\s\S]*?<\/think>/, "").trim();
    } else if (content.includes("<think>")) {
      // Still generating thinking block
      thinkContent = content.replace("<think>", "").trim();
      mainContent = "";
    }
  }

  return (
    <div style={{ fontSize: 15, color: t.text }}>
      {thinkContent && (
        <details style={{ marginBottom: 16, background: t.sessionHover, padding: 12, borderRadius: 8, border: `1px solid ${t.divider}` }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, color: t.textMuted }}>Thinking...</summary>
          <div style={{ marginTop: 8, color: t.textMuted, fontSize: 14, whiteSpace: "pre-wrap" }}>
            {thinkContent}
          </div>
        </details>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({node, inline, className, children, ...props}: any) {
            const match = /language-(\w+)/.exec(className || '')
            return !inline && match ? (
              <SyntaxHighlighter
                {...props}
                style={vscDarkPlus as any}
                language={match[1]}
                PreTag="div"
                customStyle={{ borderRadius: 8, margin: '10px 0', fontSize: 13 }}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code {...props} className={className} style={{ background: t.inlineCodeBg, color: t.inlineCodeText, padding: '2px 6px', borderRadius: 4, fontSize: '0.85em' }}>
                {children}
              </code>
            )
          },
          p({children}) { return <p style={{ lineHeight: 1.75, margin: '8px 0' }}>{children}</p>; },
          h1({children}) { return <h1 style={{ fontWeight: 700, marginTop: 24, marginBottom: 12, fontSize: 24 }}>{children}</h1>; },
          h2({children}) { return <h2 style={{ fontWeight: 700, marginTop: 20, marginBottom: 10, fontSize: 20 }}>{children}</h2>; },
          h3({children}) { return <h3 style={{ fontWeight: 600, marginTop: 16, marginBottom: 8, fontSize: 18 }}>{children}</h3>; },
          ul({children}) { return <ul style={{ listStyleType: 'disc', paddingLeft: 24, margin: '8px 0' }}>{children}</ul>; },
          ol({children}) { return <ol style={{ listStyleType: 'decimal', paddingLeft: 24, margin: '8px 0' }}>{children}</ol>; },
          li({children}) { return <li style={{ lineHeight: 1.7, marginBottom: 4 }}>{children}</li>; },
          a({children, href}) { return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'underline' }}>{children}</a>; },
          table({children}) { return <div style={{ overflowX: 'auto', margin: '16px 0' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>{children}</table></div>; },
          th({children}) { return <th style={{ border: `1px solid ${t.divider}`, padding: '8px 12px', background: t.sessionHover, textAlign: 'left' }}>{children}</th>; },
          td({children}) { return <td style={{ border: `1px solid ${t.divider}`, padding: '8px 12px' }}>{children}</td>; },
        }}
      >
        {mainContent}
      </ReactMarkdown>
    </div>
  );
}

// ─── Types ─────────────────────────────────────────────────────────────────────
type Message  = { role: "user" | "assistant"; content: string; timestamp?: string; imagePreview?: string; model?: string; };
type ChatSession = { session_id: string; title: string; created_at: string; message_count: number; };

function generateSessionId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Settings Modal ────────────────────────────────────────────────────────────
function SettingsModal({
  isDark, setIsDark, fontSize, setFontSize, onClose, t, getHeaders
}: {
  isDark: boolean; setIsDark: (v: boolean) => void;
  fontSize: string; setFontSize: (v: string) => void;
  onClose: () => void; t: typeof LIGHT; getHeaders: () => Record<string, string>;
}) {
  const [activeTab, setActiveTab] = useState<"appearance" | "account" | "memory" | "about">("appearance");
  const { data: session, status } = useSession();
  const [memories, setMemories] = useState<any[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);

  useEffect(() => {
    if (activeTab === "memory") {
      fetchMemories();
    }
  }, [activeTab]);

  const fetchMemories = async () => {
    setLoadingMemories(true);
    try {
      const res = await fetch(`/api/py/memory`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setMemories(data);
      }
    } catch (e) {
      console.error("Failed to fetch memories", e);
    } finally {
      setLoadingMemories(false);
    }
  };

  const deleteMemory = async (id: string) => {
    try {
      const res = await fetch(`/api/py/memory/${id}`, {
        method: "DELETE",
        headers: getHeaders()
      });
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
      }
    } catch (e) {
      console.error("Failed to delete memory", e);
    }
  };

  const tabs = [
    { id: "appearance" as const, label: "Appearance", icon: <Sun className="w-4 h-4" /> },
    { id: "account"    as const, label: "Account",    icon: <Shield className="w-4 h-4" /> },
    { id: "memory"     as const, label: "Memory",     icon: <Zap className="w-4 h-4" /> },
    { id: "about"      as const, label: "About",      icon: <Info className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center settings-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div
        className="w-[600px] max-w-[95vw] rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: t.menuBg, border: `1px solid ${t.menuBorder}`, maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${t.divider}` }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: t.text }}>Settings</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: t.textMuted }} onMouseEnter={(e) => { (e.target as HTMLElement).style.background = t.menuHover; }} onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex" style={{ minHeight: 380 }}>
          {/* Sidebar tabs */}
          <div className="w-44 shrink-0 py-3 px-2" style={{ borderRight: `1px solid ${t.divider}` }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl transition-colors text-left mb-0.5"
                style={{
                  background: activeTab === tab.id ? t.sessionActive : 'transparent',
                  color: activeTab === tab.id ? t.text : t.textMuted,
                  fontSize: 13.5,
                  fontWeight: activeTab === tab.id ? 500 : 400,
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 px-6 py-5 overflow-y-auto no-scrollbar">

            {activeTab === "appearance" && (
              <div className="space-y-6">
                {/* Theme */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Theme</p>
                  <div className="flex gap-3">
                    {[
                      { label: "Light", icon: <Sun className="w-5 h-5" />, value: false },
                      { label: "Dark",  icon: <Moon className="w-5 h-5" />, value: true  },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => setIsDark(opt.value)}
                        className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl transition-all flex-1 justify-center"
                        style={{
                          border: isDark === opt.value ? '2px solid #6366f1' : `2px solid ${t.divider}`,
                          background: isDark === opt.value ? (isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)') : t.menuHover,
                          color: isDark === opt.value ? '#6366f1' : t.textMuted,
                          fontWeight: 500,
                          fontSize: 13.5,
                        }}
                      >
                        {opt.icon}
                        {opt.label}
                        {isDark === opt.value && <Check className="w-3.5 h-3.5 ml-auto" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font size */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Font size</p>
                  <div className="flex gap-2">
                    {["Small", "Default", "Large"].map((size) => (
                      <button
                        key={size}
                        onClick={() => setFontSize(size)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all flex-1 justify-center"
                        style={{
                          border: fontSize === size ? '2px solid #6366f1' : `2px solid ${t.divider}`,
                          background: fontSize === size ? (isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)') : t.menuHover,
                          color: fontSize === size ? '#6366f1' : t.textMuted,
                          fontSize: size === "Small" ? 12 : size === "Large" ? 15 : 13.5,
                          fontWeight: 500,
                        }}
                      >
                        <Type className="w-3.5 h-3.5" />
                        {size}
                        {fontSize === size && <Check className="w-3 h-3 ml-auto" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ambient glow toggle info */}
                <div className="rounded-xl p-4" style={{ background: t.menuHover, border: `1px solid ${t.divider}` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-4 h-4 rounded-full" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6,#ec4899)' }} />
                    <p style={{ fontSize: 13.5, fontWeight: 500, color: t.text }}>Ambient light ring</p>
                  </div>
                  <p style={{ fontSize: 12, color: t.textMuted }}>A glowing gradient ring pulses around the message input, adding depth to the interface.</p>
                </div>
              </div>
            )}

            {activeTab === "account" && (
              <div className="space-y-5">
                {status === "authenticated" ? (
                  <>
                    <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: t.menuHover, border: `1px solid ${t.divider}` }}>
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                        {session.user?.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{session.user?.name}</p>
                        <p style={{ fontSize: 12, color: t.textMuted }}>{session.user?.email}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-4 py-6">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                      <Bot className="w-7 h-7 text-white" />
                    </div>
                    <p style={{ fontSize: 14, color: t.textMuted, textAlign: 'center' }}>Sign in to access your account, conversation history, and more.</p>
                    <div className="flex gap-2">
                      <Link href="/login" className="px-4 py-2 rounded-xl font-medium" style={{ background: t.sessionActive, color: t.text, fontSize: 13 }}>Log in</Link>
                      <Link href="/signup" className="px-4 py-2 rounded-xl font-medium text-white" style={{ background: '#6366f1', fontSize: 13 }}>Sign up</Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "memory" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-xl mb-4" style={{ background: t.menuHover, border: `1px solid ${t.divider}` }}>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: t.text }}>Cross-Session Memory</p>
                    <p style={{ fontSize: 12, color: t.textMuted }}>Facts the AI has learned about you across sessions.</p>
                  </div>
                </div>

                {loadingMemories ? (
                  <p style={{ fontSize: 13, color: t.textMuted, textAlign: "center", padding: "20px 0" }}>Loading memories...</p>
                ) : memories.length === 0 ? (
                  <p style={{ fontSize: 13, color: t.textMuted, textAlign: "center", padding: "20px 0" }}>No memories stored yet. The AI will learn facts about you as you chat.</p>
                ) : (
                  <div className="space-y-2">
                    {memories.map((m) => (
                      <div key={m.id} className="flex items-center justify-between p-3 rounded-xl transition-colors group" style={{ background: t.menuBg, border: `1px solid ${t.divider}` }}>
                        <div className="flex-1 pr-4">
                          <p style={{ fontSize: 13.5, color: t.text, lineHeight: 1.5 }}>{m.fact}</p>
                          <p style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>
                            {new Date(m.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteMemory(m.id)}
                          className="p-2 rounded-lg transition-colors shrink-0"
                          style={{ color: '#ef4444' }}
                          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(239, 68, 68, 0.1)'; }}
                          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                          title="Delete memory"
                        >
                          <Trash2 className="w-4 h-4 pointer-events-none" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "about" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: t.menuHover, border: `1px solid ${t.divider}` }}>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: t.text }}><span style={{ color: '#6366f1' }}>RAG</span>'asiyam</p>
                    <p style={{ fontSize: 12, color: t.textMuted }}>Version 1.0.0 · Retrieval-Augmented Generation</p>
                  </div>
                </div>
                {[
                  { icon: <BookOpen className="w-4 h-4" />, label: "Documentation", href: "#" },
                  { icon: <HelpCircle className="w-4 h-4" />, label: "Help & Support", href: "#" },
                  { icon: <Shield className="w-4 h-4" />, label: "Privacy Policy", href: "#" },
                  { icon: <Info className="w-4 h-4" />, label: "Terms of Service", href: "#" },
                ].map((item) => (
                  <a key={item.label} href={item.href} className="flex items-center justify-between p-3 rounded-xl transition-colors group" style={{ background: 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = t.menuHover)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div className="flex items-center gap-2.5" style={{ color: t.textMuted }}>
                      {item.icon}
                      <span style={{ fontSize: 13.5, color: t.text }}>{item.label}</span>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 -rotate-90" style={{ color: t.textFaint }} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Help Modal ────────────────────────────────────────────────────────────
function HelpModal({ onClose, t }: { onClose: () => void; t: typeof LIGHT }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center settings-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div
        className="w-[600px] max-w-[95vw] rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: t.mainBg, border: `1px solid ${t.menuBorder}`, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${t.divider}` }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: t.text }}>How to use RAG'asiyam</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: t.textMuted }} onMouseEnter={(e) => { (e.target as HTMLElement).style.background = t.menuHover; }} onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto no-scrollbar space-y-4" style={{ color: t.listText, fontSize: 15, lineHeight: 1.6 }}>
          <p>Welcome to <strong>RAG'asiyam</strong>, your intelligent conversational assistant powered by Retrieval-Augmented Generation.</p>
          <h3 style={{ fontWeight: 600, color: t.heading, marginTop: 12 }}>Features</h3>
          <ul style={{ listStyleType: 'disc', paddingLeft: 20 }} className="space-y-1">
            <li><strong>Chat:</strong> Simply type your message in the text box and press Enter to start chatting.</li>
            <li><strong>Contextual RAG:</strong> Upload PDF or TXT documents using the <Plus className="w-4 h-4 inline-block" /> icon in the input area. The chatbot will ingest the document and answer questions based on its contents.</li>
            <li><strong>Vision:</strong> Upload an image using the <ImageIcon className="w-4 h-4 inline-block" /> icon to get descriptions or answers related to the image.</li>
            <li><strong>Session History:</strong> All your previous conversations are securely saved and can be accessed from the sidebar.</li>
            <li><strong>Dark Mode:</strong> Switch to a visually stunning dark mode via the <strong>Settings</strong> menu.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [isDark, setIsDarkState] = useState(false);
  const [fontSize, setFontSizeState] = useState("Default");
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [guestSessionId, setGuestSessionId] = useState("");
  const [guestMessageCount, setGuestMessageCount] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);

  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const imageInputRef   = useRef<HTMLInputElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);

  const t = isDark ? DARK : LIGHT;
  const API_BASE    = "/api/py";
  const GUEST_LIMIT = 3;

  const setIsDark = (v: boolean) => { setIsDarkState(v); localStorage.setItem("ragasiyam_theme", v ? "dark" : "light"); };
  const setFontSize = (v: string) => { setFontSizeState(v); localStorage.setItem("ragasiyam_font", v); };

  const fontSizePx = fontSize === "Small" ? 14 : fontSize === "Large" ? 16 : 15;

  useEffect(() => {
    const saved = localStorage.getItem("ragasiyam_theme");
    if (saved) setIsDarkState(saved === "dark");
    const savedFont = localStorage.getItem("ragasiyam_font");
    if (savedFont) setFontSizeState(savedFont);
  }, []);

  useEffect(() => {
    let s = localStorage.getItem("guest_session_id");
    if (!s) { s = Math.random().toString(36).slice(2, 15); localStorage.setItem("guest_session_id", s); }
    setGuestSessionId(s);
    setGuestMessageCount(parseInt(localStorage.getItem(`guest_count_${s}`) || "0"));
  }, []);

  useEffect(() => { if (!currentSessionId) setCurrentSessionId(generateSessionId()); }, []);

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
    }
  };

  const fetchSessions = useCallback(async (query: string = "") => {
    if (status === "loading" || (!guestSessionId && status === "unauthenticated")) return;
    setSessionsLoading(true);
    try {
      const endpoint = query.trim() ? `/sessions/search?q=${encodeURIComponent(query)}` : `/sessions`;
      const r = await fetch(`${API_BASE}${endpoint}`, { headers: getHeaders() });
      if (r.ok) setSessions(await r.json());
    } catch {}
    finally { setSessionsLoading(false); }
  }, [status, guestSessionId, getHeaders]);

  const loadSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setMessages([]);
    clearPendingImage();
    try {
      const r = await fetch(`${API_BASE}/history?session_id=${encodeURIComponent(sessionId)}`, { headers: getHeaders() });
      if (r.ok) { setMessages(await r.json() || []); setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100); }
    } catch {}
    setMobileMenuOpen(false);
  }, [getHeaders]);

  const startNewChat = useCallback(() => {
    setCurrentSessionId(generateSessionId()); setMessages([]); clearPendingImage(); setMobileMenuOpen(false);
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    setSessionToDelete(null);
    
    setSessions(prev => prev.filter(s => s.session_id !== sessionId));
    if (currentSessionId === sessionId) {
      startNewChat();
    }
    
    try {
      await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
    } catch (err) {
      console.error("Failed to delete session", err);
    }
  }, [currentSessionId, getHeaders, startNewChat]);

  useEffect(() => {
    if (status === "loading") return;
    const delayDebounceFn = setTimeout(() => {
      fetchSessions(searchQuery);
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, status, guestSessionId, fetchSessions]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [inputText]);

  const clearPendingImage = () => {
    setPendingImage(null); setPendingImagePreview("");
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null); setUploadInfo(null);
    if (!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)) { setUploadError("JPEG, PNG, WebP or GIF only."); return; }
    if (file.size > 50 * 1024 * 1024) { setUploadError("Max 50 MB."); return; }
    setPendingImage(file);
    const r = new FileReader();
    r.onload = (ev) => setPendingImagePreview(ev.target?.result as string);
    r.readAsDataURL(file);
  };

  const sendMessage = async () => {
    const text = inputText.trim();
    if ((!text && !pendingImage) || isLoading) return;
    if (status === "unauthenticated" && guestMessageCount >= GUEST_LIMIT) { router.push("/signup"); return; }

    const imgSnap = pendingImage, prevSnap = pendingImagePreview;
    setMessages((p) => [...p, { role: "user", content: text, imagePreview: prevSnap || undefined }]);
    setInputText(""); clearPendingImage(); setIsLoading(true); updateGuestCount();

    try {
      let data: { reply: string; grounded: boolean };
      if (imgSnap) {
        const fd = new FormData();
        fd.append("image", imgSnap); fd.append("message", text || "Describe this image."); fd.append("session_id", currentSessionId);
        const r = await fetch(`${API_BASE}/chat/vision`, { method: "POST", headers: getHeaders(), body: fd });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Vision failed");
        data = await r.json();
      } else {
        const r = await fetch(`${API_BASE}/chat`, { method: "POST", headers: { "Content-Type": "application/json", ...getHeaders() }, body: JSON.stringify({ message: text, session_id: currentSessionId, model: selectedModel }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Request failed");
        data = await r.json();
      }
      setMessages((p) => [...p, { role: "assistant", content: data.reply, model: selectedModel }]);
      setTimeout(() => fetchSessions(), 500);
    } catch (err: any) {
      setMessages((p) => [...p, { role: "assistant", content: `Error: ${err.message}` }]);
    }
    setIsLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null); setUploadInfo(null);
    if (file.size > 20 * 1024 * 1024) {
      setUploadInfo("Larger files take longer to process. Please wait...");
    }
    setIsUploading(true);
    setPendingFile(file);
    const fd = new FormData(); fd.append("file", file); fd.append("session_id", currentSessionId);
    try {
      const r = await fetch(`${API_BASE}/upload`, { method: "POST", headers: getHeaders(), body: fd });
      if (r.ok) {
        const { doc_id } = await r.json();
        if (fileInputRef.current) fileInputRef.current.value = "";
        const poll = setInterval(async () => {
          try {
            const s = await fetch(`${API_BASE}/upload/status/${doc_id}`, { headers: getHeaders() });
            if (s.ok) {
              const data = await s.json();
              if (data.status === "ready") { clearInterval(poll); setIsUploading(false); setPendingFile(null); setUploadInfo(null); setMessages((p) => [...p, { role: "assistant", content: `Document ingested: **${file.name}**` }]); }
              else if (data.status === "failed") { clearInterval(poll); setIsUploading(false); setPendingFile(null); setUploadError(data.error || "Document ingestion failed."); }
            }
          } catch { clearInterval(poll); setIsUploading(false); setPendingFile(null); setUploadError("Polling failed."); }
        }, 2000);
      } else throw new Error((await r.json().catch(() => ({}))).detail || "Upload failed");
    } catch (err: any) { setUploadError(err.message); setIsUploading(false); setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  if (status === "loading") {
    return (
      <div style={{ display:'flex', height:'100vh', width:'100%', alignItems:'center', justifyContent:'center', background: t.mainBg, flexDirection: 'column', gap: 12 }}>
        <div className="w-8 h-8 rounded-full border-4 border-[#6366f1] border-t-transparent animate-spin"></div>
        <span style={{ color: t.textFaint, fontSize: 14, fontWeight: 500 }}>Loading...</span>
      </div>
    );
  }

  const isGuestLimitReached = status === "unauthenticated" && guestMessageCount >= GUEST_LIMIT;
  const currentTitle = sessions.find((s) => s.session_id === currentSessionId)?.title;
  const displayName  = session?.user?.name?.split(" ")[0] || (status === "unauthenticated" ? "Guest" : "You");
  const userInitials = session?.user?.name ? session.user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "G";

  // ── User menu items ──────────────────────────────────────────────
  const userMenuItems = [
    { icon: <Settings className="w-4 h-4" />, label: "Settings", shortcut: "Ctrl+,", action: () => { setUserMenuOpen(false); setSettingsOpen(true); } },
    { icon: <HelpCircle className="w-4 h-4" />,label: "Get help", action: () => { setUserMenuOpen(false); setHelpOpen(true); } },
  ];

  // ── Sidebar ──────────────────────────────────────────────────────
  const Sidebar = () => (
    <div className="flex flex-col h-full" style={{ background: t.sidebarBg }}>
      {/* Brand */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2">
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>
          <span style={{ color: '#6366f1' }}>RAG</span><span style={{ color: t.text }}>'asiyam</span>
        </span>
        <div className="flex items-center gap-0.5">
          <button className="p-1.5 rounded-lg transition-colors" style={{ color: t.textMuted }} title="Search"
            onMouseEnter={(e) => { (e.target as HTMLElement).closest('button')!.style.background = t.sessionHover; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).closest('button')!.style.background = 'transparent'; }}
          ><Search className="w-4 h-4" /></button>
          <button onClick={startNewChat} className="p-1.5 rounded-lg transition-colors" style={{ color: t.textMuted }} title="New chat"
            onMouseEnter={(e) => { (e.target as HTMLElement).closest('button')!.style.background = t.sessionHover; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).closest('button')!.style.background = 'transparent'; }}
          ><PenSquare className="w-4 h-4" /></button>
        </div>
      </div>

      {/* New chat */}
      <div className="px-3 pb-3">
        <button onClick={startNewChat} className="flex items-center gap-2 w-full px-3 py-2 rounded-xl transition-colors"
          style={{ color: t.textMuted, fontSize: 13.5, fontWeight: 500, border: `1px solid ${t.sidebarBorder}` }}
          onMouseEnter={(e) => { e.currentTarget.style.background = t.sessionHover; e.currentTarget.style.color = t.text; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.textMuted; }}
        ><Plus className="w-3.5 h-3.5" /> New chat</button>
      </div>

      {/* Search Input */}
      <div className="px-3 pb-2">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3" style={{ color: t.placeholder }} />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm transition-colors outline-none"
            style={{
              background: t.inputBg,
              color: t.text,
              border: `1px solid ${t.inputBorder}`,
            }}
            onFocus={(e) => e.target.style.borderColor = t.inputBorderHover}
            onBlur={(e) => e.target.style.borderColor = t.inputBorder}
          />
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 no-scrollbar">
        {sessionsLoading ? (
          <div className="space-y-1 px-1 pt-1">
            {[1,2,3,4,5].map((n) => (
              <div key={n} className="h-8 rounded-lg" style={{ background: t.sessionActive, opacity: 1 - n * 0.12, animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' }} />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p style={{ fontSize: 12, color: t.textFaint, textAlign: 'center', paddingTop: 24 }}>No conversations yet</p>
        ) : sessions.map((s) => {
          const isActive = s.session_id === currentSessionId;
          return (
            <div key={s.session_id} className="relative group"
              onMouseEnter={() => setHoveredSession(s.session_id)}
              onMouseLeave={() => setHoveredSession(null)}
            >
              <button onClick={() => loadSession(s.session_id)} className="w-full text-left px-3 py-2 rounded-lg transition-colors"
                style={{ background: isActive ? t.sessionActive : 'transparent', color: isActive ? t.text : t.textMuted, fontSize: 13.5, fontWeight: isActive ? 500 : 400 }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = t.sessionHover; e.currentTarget.style.color = t.text; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = isActive ? t.text : t.textMuted; }}
              >
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 20 }}>{s.title}</span>
              </button>
              {(hoveredSession === s.session_id || isActive) && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setSessionToDelete(s.session_id); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500"
                  style={{ color: t.textMuted }}
                  title="Delete chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* User profile */}
      <div className="px-3 py-3 relative" style={{ borderTop: `1px solid ${t.divider}` }}>
        {/* User menu popup */}
        {userMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
            <div className="absolute bottom-full left-2 right-2 mb-2 z-50 rounded-xl overflow-hidden shadow-2xl py-1"
              style={{ background: t.menuBg, border: `1px solid ${t.menuBorder}` }}>
              {/* Email */}
              {status === "authenticated" && (
                <div className="px-3 py-2" style={{ borderBottom: `1px solid ${t.divider}` }}>
                  <p style={{ fontSize: 12.5, color: t.textMuted }}>{session.user?.email}</p>
                </div>
              )}
              {/* Group 1 */}
              {userMenuItems.map((item) => (
                <button key={item.label} onClick={item.action}
                  className="flex items-center justify-between w-full px-3 py-2 transition-colors text-left"
                  style={{ color: t.text, fontSize: 13.5 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = t.menuHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div className="flex items-center gap-2.5" style={{ color: t.textMuted }}>
                    {item.icon}
                    <span style={{ color: t.text }}>{item.label}</span>
                  </div>
                  {(item as any).shortcut
                    ? <span style={{ fontSize: 11, color: t.textFaint }}>{(item as any).shortcut}</span>
                    : <ChevronDown className="w-3.5 h-3.5 -rotate-90" style={{ color: t.textFaint }} />}
                </button>
              ))}
              <div style={{ height: 1, background: t.divider, margin: '4px 0' }} />

              {/* Log out */}
              <button
                onClick={() => { setUserMenuOpen(false); status === "authenticated" ? signOut() : router.push("/login"); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 transition-colors"
                style={{ color: '#ef4444', fontSize: 13.5 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = t.menuHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <LogOut className="w-4 h-4" />
                {status === "authenticated" ? "Log out" : "Log in"}
              </button>
            </div>
          </>
        )}

        <button onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-xl transition-colors"
          onMouseEnter={(e) => { e.currentTarget.style.background = t.sessionHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shrink-0"
            style={{ fontSize: 11, fontWeight: 700 }}>{userInitials}</div>
          <div className="flex-1 text-left min-w-0">
            <p style={{ fontSize: 13, fontWeight: 500, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
              {session?.user?.name || "Guest"}
            </p>
          </div>
          <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: t.textFaint }} />
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', background: t.mainBg, fontFamily: "'Inter', system-ui, sans-serif", fontSize: fontSizePx }}>

      {/* Settings modal */}
      {settingsOpen && (
        <SettingsModal isDark={isDark} setIsDark={setIsDark} fontSize={fontSize} setFontSize={setFontSize} onClose={() => setSettingsOpen(false)} t={t} getHeaders={getHeaders} />
      )}

      {/* Help modal */}
      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} t={t} />
      )}

      {/* Desktop sidebar */}
      <aside style={{ width: sidebarOpen ? 260 : 0, minWidth: sidebarOpen ? 260 : 0, borderRight: sidebarOpen ? `1px solid ${t.sidebarBorder}` : 'none', overflow: 'hidden', transition: 'width 0.2s, min-width 0.2s' }}
        className="hidden md:block shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile sidebar */}
      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 z-30 md:hidden" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed left-0 top-0 bottom-0 z-40 md:hidden" style={{ width: 270, borderRight: `1px solid ${t.sidebarBorder}` }}>
            <Sidebar />
          </div>
        </>
      )}

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', background: t.mainBg }}>

        {/* Top bar */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${t.topBarBorder}`, background: t.mainBg, flexShrink: 0 }}>
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="hidden md:flex p-1.5 rounded-lg transition-colors"
              style={{ color: t.textMuted }}
              onMouseEnter={(e) => { e.currentTarget.style.background = t.sessionHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            ><Menu className="w-4 h-4" /></button>
            <button onClick={() => setMobileMenuOpen(true)} className="md:hidden p-1.5 rounded-lg" style={{ color: t.textMuted }}>
              <Menu className="w-4 h-4" />
            </button>
            {currentTitle ? (
              <button className="flex items-center gap-1 px-2 py-1 rounded-lg transition-colors"
                style={{ maxWidth: 400 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = t.sessionHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTitle}</span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: t.textMuted }} />
              </button>
            ) : (
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                <span style={{ color: '#6366f1' }}>RAG</span><span style={{ color: t.text }}>'asiyam</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isDark ? <Moon className="w-4 h-4" style={{ color: t.textMuted }} /> : <Sun className="w-4 h-4" style={{ color: t.textMuted }} />}
          </div>
        </header>

        {/* Chat area */}
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: `${t.divider} transparent` }}>
          {messages.length === 0 ? (
            <div className="px-4 md:px-8 py-8" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 1000, margin: '0 auto' }}>
              {/* Header */}
              <div style={{ marginBottom: 48 }}>
                <h1 className="text-4xl md:text-5xl" style={{ 
                  fontWeight: 600, 
                  background: 'linear-gradient(to right, #4c6ef5, #e64980)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  margin: '0 0 8px 0',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2
                }}>
                  Hello, {displayName.split(' ')[0]}
                </h1>
                <h2 className="text-3xl md:text-4xl" style={{ 
                  fontWeight: 500, 
                  color: isDark ? '#4a4845' : '#c4c2be',
                  margin: 0,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2
                }}>
                  How can I help you today?
                </h2>
              </div>

              {/* Cards */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                gap: 12,
                width: '100%',
                maxWidth: 850
              }}>
                {/* Card 1 */}
                <div 
                  onClick={() => { setInputText("Explain Python concepts: creating and filtering a dictionary"); textareaRef.current?.focus(); }}
                  style={{ background: t.userBubble, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', height: 160, transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = t.sessionHover}
                  onMouseLeave={(e) => e.currentTarget.style.background = t.userBubble}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: t.text, lineHeight: 1.3 }}>Explain Python concepts</span>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <div style={{ fontSize: 9, color: t.textMuted, fontFamily: 'monospace', lineHeight: 1.5, opacity: 0.8 }}>
                      1. Creating a dictionary:<br/>
                      sq = &#123;x: x**<span style={{color: '#f59e0b'}}>2</span> <span style={{color: '#6366f1'}}>for</span> x <span style={{color: '#6366f1'}}>in</span> <span style={{color: '#10b981'}}>range</span>(<span style={{color: '#f59e0b'}}>1</span>, <span style={{color: '#f59e0b'}}>6</span>)&#125;<br/>
                      <span style={{color: '#10b981'}}>print</span>(sq) <span style={{color: '#a1a1aa'}}># &#123;1: 1...&#125;</span><br/>
                      2. Filtering a dict
                    </div>
                  </div>
                </div>
                
                {/* Card 2 */}
                <div 
                  onClick={() => { setInputText("Create an outline from my content"); textareaRef.current?.focus(); }}
                  style={{ background: t.userBubble, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', height: 160, transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = t.sessionHover}
                  onMouseLeave={(e) => e.currentTarget.style.background = t.userBubble}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: t.text, lineHeight: 1.3 }}>Create an outline from my content</span>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginTop: 4 }}>
                     <div style={{ width: 50, height: 65, background: t.mainBg, borderRadius: 6, boxShadow: '0 4px 10px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 8px' }}>
                        <div style={{ background: '#ef4444', color: 'white', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3, alignSelf: 'flex-start', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ width: 8, height: 8, background: 'white', borderRadius: 2, display: 'inline-block' }}></span> PDF
                        </div>
                        <div style={{ width: '100%', height: 3, background: t.sidebarBorder, borderRadius: 1.5, marginBottom: 5 }}></div>
                        <div style={{ width: '100%', height: 3, background: t.sidebarBorder, borderRadius: 1.5, marginBottom: 5 }}></div>
                        <div style={{ width: '60%', height: 3, background: t.sidebarBorder, borderRadius: 1.5, alignSelf: 'flex-start' }}></div>
                     </div>
                     <div style={{ position: 'absolute', right: '15%', top: '5%', width: 20, height: 20, borderRadius: 10, background: '#4c6ef5', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(76, 110, 245, 0.4)' }}>
                       <Plus size={12} />
                     </div>
                  </div>
                </div>

                {/* Card 3 */}
                <div 
                  onClick={() => { setInputText("Develop a board game shop business plan"); textareaRef.current?.focus(); }}
                  style={{ background: t.userBubble, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', height: 160, transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = t.sessionHover}
                  onMouseLeave={(e) => e.currentTarget.style.background = t.userBubble}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: t.text, lineHeight: 1.3 }}>Develop a board game shop business plan</span>
                  <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                    <p style={{ fontSize: 10, color: t.textMuted, lineHeight: 1.5, margin: 0, opacity: 0.8 }}>
                      Business Plan: [Your Shop Name] - Atlanta's Premier Board Game Destination<br/><br/>
                      1. Executive Summary<br/>
                      [Your Shop Name] will be a unique retail establishment dedicated to...
                    </p>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 30, background: `linear-gradient(transparent, ${t.userBubble})` }}></div>
                  </div>
                </div>

                {/* Card 4 */}
                <div 
                  onClick={() => { setInputText("Make a chart and share insights"); textareaRef.current?.focus(); }}
                  style={{ background: t.userBubble, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', height: 160, transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = t.sessionHover}
                  onMouseLeave={(e) => e.currentTarget.style.background = t.userBubble}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: t.text, lineHeight: 1.3 }}>Make a chart and share insights</span>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3, paddingBottom: 2 }}>
                    {[45, 30, 80, 55, 40, 20, 35, 65, 45].map((h, i) => (
                      <div key={i} style={{ width: 10, height: `${h}%`, background: '#4c6ef5', borderRadius: '2px 2px 0 0' }}></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-4 md:px-8 pt-6 md:pt-8 pb-2" style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
              {messages.map((m, idx) => (
                <div key={idx}>
                  {m.role === "user" ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={{ maxWidth: '75%', background: t.userBubble, borderRadius: 18, padding: '10px 16px' }}>
                        {m.imagePreview && <img src={m.imagePreview} alt="uploaded" style={{ borderRadius: 12, maxHeight: 220, maxWidth: '100%', objectFit: 'cover', marginBottom: 8 }} />}
                        {m.content && <p style={{ fontSize: fontSizePx, color: t.text, lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{m.content}</p>}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <Bot style={{ width: 14, height: 14, color: '#fff' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                        <MarkdownRenderer content={m.content} t={t} model={m.model} />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Bot style={{ width: 14, height: 14, color: '#fff' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingTop: 8 }}>
                    {[0,0.15,0.3].map((d,i) => (
                      <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: t.textFaint, display: 'block', animation: `pulse 1.4s ease-in-out ${d}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="px-4 md:px-8 pt-3 pb-5" style={{ flexShrink: 0, background: t.mainBg, borderTop: `1px solid ${t.topBarBorder}` }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>

            {/* Error / Info Chips */}
            {uploadError && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, fontWeight: 500 }}>
                <span style={{ flex: 1 }}>{uploadError}</span>
                <button onClick={() => setUploadError(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex' }}><X style={{ width: 16, height: 16 }} /></button>
              </div>
            )}
            {uploadInfo && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, padding: '10px 14px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', borderRadius: 12, border: '1px solid rgba(59,130,246,0.2)', fontSize: 13, fontWeight: 500 }}>
                <span style={{ flex: 1 }}>{uploadInfo}</span>
                <button onClick={() => setUploadInfo(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#3b82f6', display: 'flex' }}><X style={{ width: 16, height: 16 }} /></button>
              </div>
            )}
            
            {/* Pending File Upload Chip */}
            {pendingFile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, padding: '8px 12px', background: t.sessionHover, borderRadius: 14, border: `1px solid ${t.divider}` }}>
                <div style={{ position: 'relative', flexShrink: 0, width: 44, height: 44, borderRadius: 10, background: isDark ? '#2e2e38' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${t.divider}` }}>
                  <Paperclip style={{ width: 20, height: 20, color: t.textMuted }} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.name}</p>
                  <p style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{(pendingFile.size / 1024).toFixed(0)} KB · {isUploading ? 'Uploading & Ingesting...' : 'Ready'}</p>
                </div>
                {isUploading && (
                  <div style={{ marginRight: 4, width: 20, height: 20, borderRadius: '50%', border: '2.5px solid #6366f1', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                )}
              </div>
            )}

            {/* Image preview */}
            {pendingImagePreview && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, padding: '8px 12px', background: t.sessionHover, borderRadius: 14, border: `1px solid ${t.divider}` }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <img src={pendingImagePreview} alt="pending" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', border: `1px solid ${t.divider}` }} />
                  <button onClick={clearPendingImage} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: t.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}>
                    <X style={{ width: 10, height: 10, color: '#fff' }} />
                  </button>
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingImage?.name}</p>
                  <p style={{ fontSize: 11, color: t.textMuted }}>{pendingImage ? (pendingImage.size / 1024).toFixed(0) + " KB" : ""} · Ready</p>
                </div>
              </div>
            )}

            {/* ── Ambient glow + input box ── */}
            <div style={{ position: 'relative' }}>

              {/* Ambient glow layer */}
              <div
                className="ambient-ring"
                style={{
                  position: 'absolute',
                  inset: -3,
                  borderRadius: 20,
                  background: `linear-gradient(135deg, ${t.glowA}, ${t.glowB}, ${t.glowC})`,
                  filter: 'blur(14px)',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />

              {/* Input box */}
              <div style={{
                position: 'relative', zIndex: 1,
                border: `1px solid ${t.inputBorder}`,
                borderRadius: 16,
                background: t.inputBg,
                transition: 'border-color 0.2s, box-shadow 0.2s',
                opacity: isGuestLimitReached ? 0.5 : 1,
                pointerEvents: isGuestLimitReached ? 'none' : 'auto',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = t.inputBorderHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = t.inputBorder; }}
              >
                <div style={{ padding: '14px 16px 8px' }}>
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    disabled={isLoading}
                    placeholder={pendingImage ? "Ask about this image…" : "Write a message…"}
                    rows={1}
                    style={{
                      width: '100%', background: 'transparent', border: 'none', outline: 'none',
                      resize: 'none', fontSize: fontSizePx, color: t.text, lineHeight: 1.6,
                      fontFamily: 'inherit', minHeight: 24, maxHeight: 200, overflowY: 'auto',
                    }}
                    className="no-scrollbar"
                  />
                </div>

                {/* Toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {/* Document upload */}
                    <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                      title="Upload PDF / TXT"
                      style={{ padding: 8, borderRadius: 10, color: t.toolbarBtn, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = t.toolbarBtnHoverBg; e.currentTarget.style.color = t.toolbarBtnHover; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.toolbarBtn; }}
                    >
                      {isUploading ? <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #6366f1', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} /> : <Plus style={{ width: 16, height: 16 }} />}
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept=".txt,.pdf" />

                    {/* Image upload */}
                    <button onClick={() => imageInputRef.current?.click()} disabled={isLoading} title="Send an image"
                      style={{ padding: 8, borderRadius: 10, background: pendingImage ? (isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)') : 'transparent', color: pendingImage ? '#6366f1' : t.toolbarBtn, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      onMouseEnter={(e) => { if (!pendingImage) { e.currentTarget.style.background = t.toolbarBtnHoverBg; e.currentTarget.style.color = t.toolbarBtnHover; } }}
                      onMouseLeave={(e) => { if (!pendingImage) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.toolbarBtn; } }}
                    ><ImageIcon style={{ width: 16, height: 16 }} /></button>
                    <input type="file" ref={imageInputRef} onChange={handleImageSelect} style={{ display: 'none' }} accept="image/jpeg,image/png,image/webp,image/gif" />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Model selector */}
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={() => setModelMenuOpen(!modelMenuOpen)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                          borderRadius: 10, fontSize: 13, color: t.textMuted, fontWeight: 500,
                          background: modelMenuOpen ? t.toolbarBtnHoverBg : 'transparent',
                          border: 'none', cursor: 'pointer', fontFamily: 'inherit'
                        }}
                        onMouseEnter={(e) => { if(!modelMenuOpen) e.currentTarget.style.background = t.toolbarBtnHoverBg; }}
                        onMouseLeave={(e) => { if(!modelMenuOpen) e.currentTarget.style.background = 'transparent'; }}
                      >
                        {selectedModel.includes("deepseek") ? "Deepseek R1" : selectedModel.includes("llama") ? "Groq Llama 3.3" : "Gemini 2.5 Flash"}
                        <ChevronDown style={{ width: 14, height: 14, color: t.textFaint }} />
                      </button>

                      {modelMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setModelMenuOpen(false)} />
                          <div
                            className="absolute z-50 mb-2 bottom-full left-0 w-64 rounded-xl shadow-xl overflow-hidden"
                            style={{ background: t.menuBg, border: `1px solid ${t.menuBorder}` }}
                          >
                            {[
                              { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", desc: "Fast and multimodal (Google)" },
                              { id: "llama-3.3-70b-versatile", name: "Groq Llama 3.3", desc: "High speed text generation" },
                              { id: "deepseek-r1-distill-llama-70b", name: "Deepseek R1", desc: "Advanced reasoning and logic" },
                            ].map((mod, idx) => (
                              <button
                                key={mod.id}
                                onClick={() => { setSelectedModel(mod.id); setModelMenuOpen(false); }}
                                className="w-full text-left px-4 py-3 flex items-center justify-between transition-colors"
                                style={{
                                  background: selectedModel === mod.id ? t.sessionHover : 'transparent',
                                  borderBottom: idx < 2 ? `1px solid ${t.divider}` : 'none'
                                }}
                                onMouseEnter={(e) => { if(selectedModel !== mod.id) e.currentTarget.style.background = t.menuHover; }}
                                onMouseLeave={(e) => { if(selectedModel !== mod.id) e.currentTarget.style.background = 'transparent'; }}
                              >
                                <div>
                                  <div style={{ fontSize: 14, fontWeight: 500, color: t.text, marginBottom: 2 }}>{mod.name}</div>
                                  <div style={{ fontSize: 12, color: t.textMuted }}>{mod.desc}</div>
                                </div>
                                {selectedModel === mod.id && <Check className="w-4 h-4" style={{ color: '#6366f1' }} />}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Mic */}
                    <button style={{ padding: 8, borderRadius: 10, color: t.toolbarBtn, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = t.toolbarBtnHoverBg; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    ><Mic style={{ width: 16, height: 16 }} /></button>

                    {/* Send */}
                    <button onClick={sendMessage}
                      disabled={(!inputText.trim() && !pendingImage) || isLoading}
                      style={{
                        padding: 8, borderRadius: 10, background: t.sendBtn, color: t.sendBtnText,
                        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                        opacity: (!inputText.trim() && !pendingImage) || isLoading ? 0.3 : 1,
                        transition: 'opacity 0.15s',
                      }}
                    ><Send style={{ width: 16, height: 16 }} /></button>
                  </div>
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <p style={{ textAlign: 'center', fontSize: 11, color: t.disclaimer, marginTop: 8 }}>
              <span style={{ color: '#6366f1' }}>RAG</span>'asiyam can make mistakes. Always verify important information.
            </p>
          </div>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {sessionToDelete && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setSessionToDelete(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm p-6 rounded-2xl shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in duration-200"
               style={{ background: t.menuBg, border: `1px solid ${t.menuBorder}` }}>
            <h3 style={{ color: t.heading, fontSize: 18, fontWeight: 600 }}>Delete chat?</h3>
            <p style={{ color: t.text, fontSize: 14 }}>
              This will delete this chat. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 mt-2">
              <button 
                onClick={() => setSessionToDelete(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: t.text, background: t.userBubble }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                Cancel
              </button>
              <button 
                onClick={() => deleteSession(sessionToDelete)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors bg-red-500 hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

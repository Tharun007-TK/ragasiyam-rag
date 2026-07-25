"use client";

import { useState, useEffect, useRef, useCallback, ReactNode } from "react";
import {
  Send, Paperclip, Bot, Menu, X, Plus, Image as ImageIcon,
  Search, SlidersHorizontal, MoreHorizontal, PenSquare,
  ChevronDown, Mic, Settings, Globe, HelpCircle, Zap,
  Download, Info, LogOut, Moon, Sun, Type, Shield, BookOpen,
  Check,
} from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
function InlineMD({ text, t }: { text: string; t: typeof LIGHT }) {
  const parts: ReactNode[] = [];
  const regex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let last = 0, match: RegExpExecArray | null, key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(<span key={key++}>{text.slice(last, match.index)}</span>);
    const m = match[0];
    if (m.startsWith("**"))
      parts.push(<strong key={key++} style={{ color: t.heading, fontWeight: 600 }}>{m.slice(2, -2)}</strong>);
    else if (m.startsWith("`"))
      parts.push(
        <code key={key++} style={{ background: t.inlineCodeBg, color: t.inlineCodeText, padding: '1px 6px', borderRadius: 4, fontSize: '0.83em', fontFamily: 'monospace' }}>
          {m.slice(1, -1)}
        </code>
      );
    else if (m.startsWith("*"))
      parts.push(<em key={key++}>{m.slice(1, -1)}</em>);
    last = match.index + m.length;
  }
  if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>);
  return <>{parts.length > 0 ? parts : text}</>;
}

function MarkdownRenderer({ content, t }: { content: string; t: typeof LIGHT }) {
  const lines = content.split("\n");
  const els: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      els.push(
        <pre key={`cb${i}`} style={{ background: t.codeBlockBg, border: `1px solid ${t.codeBlockBorder}`, borderRadius: 12, padding: '14px 16px', overflowX: 'auto', margin: '10px 0', fontSize: 13 }}>
          <code style={{ fontFamily: 'monospace', color: t.codeText, lineHeight: 1.6 }}>{codeLines.join("\n")}</code>
        </pre>
      );
      i++; continue;
    }

    if (line.startsWith("### ")) { els.push(<h3 key={i} style={{ fontWeight: 600, color: t.heading, marginTop: 16, marginBottom: 4, fontSize: 15 }}><InlineMD text={line.slice(4)} t={t} /></h3>); }
    else if (line.startsWith("## ")) { els.push(<h2 key={i} style={{ fontWeight: 700, color: t.heading, marginTop: 20, marginBottom: 6, fontSize: 17 }}><InlineMD text={line.slice(3)} t={t} /></h2>); }
    else if (line.startsWith("# "))  { els.push(<h1 key={i} style={{ fontWeight: 700, color: t.heading, marginTop: 20, marginBottom: 8, fontSize: 19 }}><InlineMD text={line.slice(2)} t={t} /></h1>); }
    else if (line.match(/^-{3,}$/)) { els.push(<hr key={i} style={{ border: 'none', borderTop: `1px solid ${t.divider}`, margin: '12px 0' }} />); }
    else if (line.match(/^[-*] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) { items.push(lines[i].slice(2)); i++; }
      els.push(<ul key={`ul${i}`} style={{ listStyleType: 'disc', paddingLeft: 20, margin: '6px 0' }}>{items.map((it, j) => <li key={j} style={{ color: t.listText, lineHeight: 1.7, marginBottom: 2 }}><InlineMD text={it} t={t} /></li>)}</ul>);
      continue;
    }
    else if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) { items.push(lines[i].replace(/^\d+\.\s/, "")); i++; }
      els.push(<ol key={`ol${i}`} style={{ listStyleType: 'decimal', paddingLeft: 20, margin: '6px 0' }}>{items.map((it, j) => <li key={j} style={{ color: t.listText, lineHeight: 1.7, marginBottom: 2 }}><InlineMD text={it} t={t} /></li>)}</ol>);
      continue;
    }
    else if (line.trim() === "") { els.push(<div key={i} style={{ height: 10 }} />); }
    else { els.push(<p key={i} style={{ color: t.listText, lineHeight: 1.75, margin: '2px 0' }}><InlineMD text={line} t={t} /></p>); }

    i++;
  }
  return <div style={{ fontSize: 15 }}>{els}</div>;
}

// ─── Types ─────────────────────────────────────────────────────────────────────
type Message  = { role: "user" | "assistant"; content: string; timestamp?: string; imagePreview?: string; };
type ChatSession = { session_id: string; title: string; created_at: string; message_count: number; };

function generateSessionId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Settings Modal ────────────────────────────────────────────────────────────
function SettingsModal({
  isDark, setIsDark, fontSize, setFontSize, onClose, t,
}: {
  isDark: boolean; setIsDark: (v: boolean) => void;
  fontSize: string; setFontSize: (v: string) => void;
  onClose: () => void; t: typeof LIGHT;
}) {
  const [activeTab, setActiveTab] = useState<"appearance" | "account" | "about">("appearance");
  const { data: session, status } = useSession();

  const tabs = [
    { id: "appearance" as const, label: "Appearance", icon: <Sun className="w-4 h-4" /> },
    { id: "account"    as const, label: "Account",    icon: <Shield className="w-4 h-4" /> },
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
                    <div className="p-4 rounded-xl" style={{ background: t.menuHover, border: `1px solid ${t.divider}` }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Plan</p>
                      <div className="flex items-center justify-between">
                        <p style={{ fontSize: 14, color: t.text }}>Free plan</p>
                        <Link href="/upgrade" className="px-3 py-1 rounded-lg text-indigo-500 hover:text-indigo-600 font-medium" style={{ fontSize: 13, background: isDark ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.08)' }}>Upgrade →</Link>
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

            {activeTab === "about" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: t.menuHover, border: `1px solid ${t.divider}` }}>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: t.text }}><span style={{ color: '#6366f1' }}>RAG</span>'asiam</p>
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
          <h2 style={{ fontSize: 18, fontWeight: 600, color: t.text }}>How to use RAG'asiam</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: t.textMuted }} onMouseEnter={(e) => { (e.target as HTMLElement).style.background = t.menuHover; }} onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto no-scrollbar space-y-4" style={{ color: t.listText, fontSize: 15, lineHeight: 1.6 }}>
          <p>Welcome to <strong>RAG'asiam</strong>, your intelligent conversational assistant powered by Retrieval-Augmented Generation.</p>
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [guestSessionId, setGuestSessionId] = useState("");
  const [guestMessageCount, setGuestMessageCount] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState("");

  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const imageInputRef   = useRef<HTMLInputElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);

  const t = isDark ? DARK : LIGHT;
  const API_BASE    = "/api/py";
  const GUEST_LIMIT = 3;

  const setIsDark = (v: boolean) => { setIsDarkState(v); localStorage.setItem("ragasiam_theme", v ? "dark" : "light"); };
  const setFontSize = (v: string) => { setFontSizeState(v); localStorage.setItem("ragasiam_font", v); };

  const fontSizePx = fontSize === "Small" ? 14 : fontSize === "Large" ? 16 : 15;

  // Persist theme
  useEffect(() => {
    const saved = localStorage.getItem("ragasiam_theme");
    if (saved) setIsDarkState(saved === "dark");
    const savedFont = localStorage.getItem("ragasiam_font");
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

  const fetchSessions = useCallback(async () => {
    if (status === "loading" || (!guestSessionId && status === "unauthenticated")) return;
    setSessionsLoading(true);
    try {
      const r = await fetch(`${API_BASE}/sessions`, { headers: getHeaders() });
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

  useEffect(() => { if (status !== "loading") fetchSessions(); }, [status, guestSessionId]);
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
    if (!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)) { alert("JPEG, PNG, WebP or GIF only."); return; }
    if (file.size > 10 * 1024 * 1024) { alert("Max 10 MB."); return; }
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
        const r = await fetch(`${API_BASE}/chat`, { method: "POST", headers: { "Content-Type": "application/json", ...getHeaders() }, body: JSON.stringify({ message: text, session_id: currentSessionId }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Request failed");
        data = await r.json();
      }
      setMessages((p) => [...p, { role: "assistant", content: data.reply }]);
      setTimeout(() => fetchSessions(), 500);
    } catch (err: any) {
      setMessages((p) => [...p, { role: "assistant", content: `Error: ${err.message}` }]);
    }
    setIsLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const fd = new FormData(); fd.append("file", file);
    try {
      const r = await fetch(`${API_BASE}/upload`, { method: "POST", headers: getHeaders(), body: fd });
      if (r.ok) {
        const { doc_id } = await r.json();
        if (fileInputRef.current) fileInputRef.current.value = "";
        const poll = setInterval(async () => {
          try {
            const s = await fetch(`${API_BASE}/upload/status/${doc_id}`, { headers: getHeaders() });
            if (s.ok) {
              const { status: st } = await s.json();
              if (st === "ready") { clearInterval(poll); setIsUploading(false); setMessages((p) => [...p, { role: "assistant", content: `Document ingested: **${file.name}**` }]); }
              else if (st === "failed") { clearInterval(poll); setIsUploading(false); alert("Failed."); }
            }
          } catch { clearInterval(poll); setIsUploading(false); }
        }, 2000);
      } else throw new Error((await r.json()).detail || "Upload failed");
    } catch (err: any) { alert(err.message); setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  if (status === "loading") {
    return <div style={{ display:'flex', height:'100vh', alignItems:'center', justifyContent:'center', background: t.mainBg }}><span style={{ color: t.textFaint, fontSize: 14 }}>Loading…</span></div>;
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
          <span style={{ color: '#6366f1' }}>RAG</span><span style={{ color: t.text }}>'asiam</span>
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

      {/* Recents */}
      <div className="flex items-center justify-between px-4 py-1.5">
        <span style={{ fontSize: 11, fontWeight: 600, color: t.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recents</span>
        <button style={{ color: t.textFaint }}><SlidersHorizontal className="w-3 h-3" /></button>
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
                <button className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: t.textMuted }}>
                  <MoreHorizontal className="w-3.5 h-3.5" />
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
            <p style={{ fontSize: 11, color: t.textMuted }}>Free plan</p>
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
        <SettingsModal isDark={isDark} setIsDark={setIsDark} fontSize={fontSize} setFontSize={setFontSize} onClose={() => setSettingsOpen(false)} t={t} />
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
                <span style={{ color: '#6366f1' }}>RAG</span><span style={{ color: t.text }}>'asiam</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isDark ? <Moon className="w-4 h-4" style={{ color: t.textMuted }} /> : <Sun className="w-4 h-4" style={{ color: t.textMuted }} />}
            {status === "unauthenticated" && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: t.sessionHover, borderRadius: 20, fontSize: 12, color: t.textMuted }}>
                Free plan
                <Link href="/signup" style={{ color: '#6366f1', fontWeight: 500, marginLeft: 4 }}>Upgrade</Link>
              </div>
            )}
          </div>
        </header>

        {/* Chat area */}
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: `${t.divider} transparent` }}>
          {messages.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 32px' }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Bot style={{ width: 26, height: 26, color: '#fff' }} />
                </div>
                <h1 style={{ fontSize: 28, fontWeight: 600, color: t.text, textAlign: 'center', margin: 0 }}>
                  How can I help you, {displayName}?
                </h1>
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 32px 8px', display: 'flex', flexDirection: 'column', gap: 24 }}>
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
                        <MarkdownRenderer content={m.content} t={t} />
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
              {isUploading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: t.textMuted }}>
                  <Paperclip style={{ width: 14, height: 14 }} /> Ingesting document…
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div style={{ flexShrink: 0, padding: '12px 32px 20px', background: t.mainBg, borderTop: `1px solid ${t.topBarBorder}` }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>

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
                    {/* Model label */}
                    <button style={{ display: 'none', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 10, fontSize: 12, color: t.textMuted, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                      className="sm:flex">
                      <span style={{ color: '#6366f1', fontWeight: 600, fontSize: 11 }}>RAG</span>
                      <span>'asiam Pro</span>
                      <ChevronDown style={{ width: 12, height: 12, color: t.textFaint }} />
                    </button>

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
              <span style={{ color: '#6366f1' }}>RAG</span>'asiam can make mistakes. Always verify important information.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { z } from "zod";
import {
  ArrowUp,
  ArrowUpRight,
  Plus,
  Search,
  PanelLeftClose,
  ChevronDown,
  SlidersHorizontal,
  Sparkles,
  Brain,
  Code2,
  ImageIcon,
  PenLine,
  Lightbulb,
  MessageSquare,
  Settings,
  CircleHelp,
  X,
  Check,
  Copy,
  Trash2,
  Download,
  Square,
  Menu,
  ArrowRight,
  ExternalLink,
  Loader2,
  Command,
  ShieldCheck,
  Zap,
  Eye,
  MoreHorizontal,
} from "lucide-react";
import {
  defaultSettings,
  type ChatMessage,
  type ChatSettings,
  type ConversationSummary,
} from "@/lib/types";
import { SSEParser } from "@/lib/sse";

const categories = [
  {
    id: "write",
    title: "Find the right words",
    description: "From a first draft to the final touch.",
    icon: PenLine,
    color: "peach",
    prompts: [
      "Help me write a thoughtful email",
      "Turn my rough notes into a clear outline",
      "Write an engaging introduction for my story",
    ],
  },
  {
    id: "code",
    title: "Build something",
    description: "A fresh perspective on your code.",
    icon: Code2,
    color: "lavender",
    prompts: [
      "Help me plan a new web application",
      "Explain a tricky piece of code",
      "Review my code for potential bugs",
    ],
  },
  {
    id: "idea",
    title: "Follow your curiosity",
    description: "Big questions. Unexpected ideas.",
    icon: Lightbulb,
    color: "yellow",
    prompts: [
      "Explain something complex, simply",
      "Brainstorm ideas for a creative side project",
      "Help me think through a big decision",
    ],
  },
  {
    id: "image",
    title: "See the bigger picture",
    description: "Upload an image. Uncover more.",
    icon: ImageIcon,
    color: "mint",
    prompts: [
      "What can you tell me about this image?",
      "Extract and summarize the text in this image",
      "Give me design feedback on this image",
    ],
  },
];

const summarySchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
});
const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  image: z.string().optional(),
});
const streamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("meta"), conversation: summarySchema }),
  z.object({ type: z.literal("thinking") }),
  z.object({ type: z.literal("delta"), content: z.string() }),
  z.object({ type: z.literal("done"), message: messageSchema }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

function KimiMark({ small = false }: { small?: boolean }) {
  return (
    <svg
      width={small ? 23 : 30}
      height={small ? 23 : 30}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 5h7v10L22 5h9L18 18l13 13h-9L12 21v10H5V5Z"
        fill="currentColor"
      />
      <path d="M1 1h7v7H1z" fill="currentColor" opacity=".35" />
    </svg>
  );
}

function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog-content ${className}`}>
          <div className="dialog-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={19} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="dialog-description">
            {description}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

async function apiJson(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(data);
    throw new Error(
      error.success
        ? error.data.error
        : "The request failed. Please try again.",
    );
  }
  return data;
}

async function fetchWorkspace(): Promise<{
  conversations: ConversationSummary[];
  configured: boolean;
}> {
  return z
    .object({
      conversations: z.array(summarySchema),
      configured: z.boolean(),
    })
    .parse(
      await apiJson(
        await fetch("/api/conversations", { cache: "no-store" }),
      ),
    );
}

export default function ChatWorkspace() {
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [currentId, setCurrentId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<{
    data: string;
    name: string;
  }>();
  const [settings, setSettings] = useState<ChatSettings>(defaultSettings);
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [category, setCategory] = useState<string>();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [modal, setModal] = useState<
    "search" | "settings" | "help" | "model" | "rename" | "delete" | null
  >(null);
  const [search, setSearch] = useState("");
  const [rename, setRename] = useState("");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [copied, setCopied] = useState<string>();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const openingRef = useRef(0);
  const current = history.find((item) => item.id === currentId);
  const filteredHistory = history.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase()),
  );

  // Loads (or reloads) the workspace. Returns a dispose function so effects can
  // ignore stale responses; state updates happen only in async callbacks.
  const refresh = useCallback(() => {
    let cancelled = false;
    fetchWorkspace()
      .then((data) => {
        if (cancelled) return;
        setHistory(data.conversations);
        setConfigured(data.configured);
        setReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Could not load your workspace. Please reload.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => refresh(), [refresh]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, [messages, thinking]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const newChat = useCallback(() => {
    if (busy) return;
    openingRef.current++;
    setLoadingChat(false);
    setCurrentId(undefined);
    setMessages([]);
    setDraft("");
    setAttachment(undefined);
    setError("");
    setCategory(undefined);
    setMobileOpen(false);
    setModal(null);
    requestAnimationFrame(() => textarea.current?.focus());
  }, [busy]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setModal("search");
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "o"
      ) {
        event.preventDefault();
        newChat();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [newChat]);

  async function openConversation(id: string) {
    if (busy) return;
    const opening = ++openingRef.current;
    setLoadingChat(true);
    setMessages([]);
    setError("");
    setModal(null);
    setMobileOpen(false);
    setDraft("");
    setAttachment(undefined);
    try {
      const data = z
        .object({
          conversation: summarySchema.extend({
            messages: z.array(messageSchema),
          }),
        })
        .parse(
          await apiJson(
            await fetch(`/api/conversations/${id}`, { cache: "no-store" }),
          ),
        );
      if (opening !== openingRef.current) return;
      setCurrentId(id);
      setMessages(data.conversation.messages);
    } catch (err) {
      if (opening === openingRef.current)
        setError(
          err instanceof Error
            ? err.message
            : "Could not open this conversation.",
        );
    } finally {
      if (opening === openingRef.current) setLoadingChat(false);
    }
  }

  function fillPrompt(prompt: string) {
    setDraft(prompt);
    textarea.current?.focus();
  }

  async function upload(file?: File) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError("Choose a PNG, JPEG, or WebP image under 2 MB.");
      return;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Could not read the image."));
        reader.onerror = () =>
          reject(
            new Error("Could not read the image. Try uploading it again."),
          );
        reader.readAsDataURL(file);
      });
      setAttachment({ data, name: file.name });
      setError("");
      if (!draft.trim()) setDraft("What can you tell me about this image?");
      textarea.current?.focus();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not read this image.",
      );
    }
  }

  async function sendMessage(event?: FormEvent, retryMessage?: ChatMessage) {
    event?.preventDefault();
    const content = retryMessage?.content ?? draft.trim();
    const image = retryMessage?.image ?? attachment?.data;
    if (!content || busy || !ready || loadingChat) return;
    const previousMessages = messages;
    const newUser: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      ...(image ? { image } : {}),
    };
    const assistantId = crypto.randomUUID();
    const last = messages.at(-1);
    const base =
      retryMessage && last?.role === "user" ? messages : [...messages, newUser];
    setMessages([...base, { id: assistantId, role: "assistant", content: "" }]);
    setDraft("");
    setAttachment(undefined);
    setBusy(true);
    setThinking(false);
    setError("");
    if (textarea.current) textarea.current.style.height = "auto";
    const aborter = new AbortController();
    abortRef.current = aborter;
    let accepted = false;
    let finished = false;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: aborter.signal,
        body: JSON.stringify({
          conversationId: currentId,
          content,
          image,
          settings,
        }),
      });
      if (!response.ok) {
        await apiJson(response);
        return;
      }
      if (!response.body)
        throw new Error("Streaming is unavailable. Please try again.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SSEParser();
      const consume = (events: string[]) => {
        for (const value of events) {
          const item = streamEventSchema.parse(JSON.parse(value));
          if (item.type === "meta") {
            accepted = true;
            setCurrentId(item.conversation.id);
            setHistory((old) => [
              item.conversation,
              ...old.filter((chat) => chat.id !== item.conversation.id),
            ]);
          }
          if (item.type === "thinking") setThinking(true);
          if (item.type === "delta") {
            setThinking(false);
            setMessages((old) =>
              old.map((message) =>
                message.id === assistantId
                  ? { ...message, content: message.content + item.content }
                  : message,
              ),
            );
          }
          if (item.type === "done") {
            finished = true;
            setMessages((old) =>
              old.map((message) =>
                message.id === assistantId ? item.message : message,
              ),
            );
          }
          if (item.type === "error") throw new Error(item.message);
        }
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            consume(parser.push(decoder.decode()));
            consume(parser.finish());
            break;
          }
          consume(parser.push(decoder.decode(value, { stream: true })));
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      if (!finished)
        throw new Error("The connection ended early. Please try again.");
    } catch (err) {
      setError(
        aborter.signal.aborted
          ? "Response stopped. You can try again when you’re ready."
          : err instanceof Error
            ? err.message
            : "Could not send your message. Please try again.",
      );
      if (!accepted) {
        setMessages(previousMessages);
        setDraft(content);
        if (image) setAttachment({ data: image, name: "Attached image" });
      } else setMessages(base);
    } finally {
      setBusy(false);
      setThinking(false);
      abortRef.current = null;
    }
  }

  async function mutateConversation(action: "rename" | "delete") {
    if (!currentId || mutationBusy) return;
    setMutationBusy(true);
    try {
      await apiJson(
        await fetch(`/api/conversations/${currentId}`, {
          method: action === "rename" ? "PATCH" : "DELETE",
          headers: { "Content-Type": "application/json" },
          ...(action === "rename"
            ? { body: JSON.stringify({ title: rename }) }
            : {}),
        }),
      );
      if (action === "delete") {
        setHistory((old) => old.filter((item) => item.id !== currentId));
        newChat();
        setToast("Conversation deleted");
      } else {
        setHistory((old) =>
          old.map((item) =>
            item.id === currentId ? { ...item, title: rename.trim() } : item,
          ),
        );
        setModal(null);
        setToast("Conversation renamed");
      }
    } catch (err) {
      setToast(
        err instanceof Error
          ? err.message
          : "This action failed. Please try again.",
      );
    } finally {
      setMutationBusy(false);
    }
  }

  async function copy(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(message.id);
      setTimeout(() => setCopied(undefined), 2000);
    } catch {
      setToast(
        "Clipboard access is unavailable. Select the response to copy it.",
      );
    }
  }

  function exportChat() {
    const text = `# ${current?.title ?? "Kimi conversation"}\n\n${messages.map((message) => `## ${message.role === "user" ? "You" : "Kimi"}\n\n${message.content}${message.image ? "\n\n[Image attachment omitted from text export]" : ""}`).join("\n\n")}`;
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kimi-${currentId ?? "chat"}.md`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Conversation exported");
  }

  const selectedCategory = categories.find((item) => item.id === category);
  const starters = selectedCategory?.prompts ?? [
    "Make a plan for my next big idea",
    "Explain something complex, simply",
    "Help me get inspired",
  ];

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {mobileOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
        aria-label="Workspace navigation"
      >
        <div className="brand-row">
          <button className="brand" onClick={newChat} aria-label="Kimi home">
            <KimiMark />
            <span>
              kimi<span className="brand-dot">.</span>
            </span>
            <span className="workspace-label">WORKSPACE</span>
          </button>
          <button
            className="icon-button collapse-button"
            aria-label="Collapse sidebar"
            onClick={() => {
              setSidebarCollapsed(true);
              setMobileOpen(false);
            }}
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        <button className="new-chat" onClick={newChat} disabled={busy}>
          <Plus size={19} />
          <span>New chat</span>
          <span className="key-hint">⌘ ⇧ O</span>
        </button>
        <button
          className="nav-search"
          onClick={() => {
            setSearch("");
            setModal("search");
          }}
        >
          <Search size={17} />
          <span>Search conversations</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="sidebar-divider" />
        <div className="history-heading">
          <span>YOUR CONVERSATIONS</span>
          <button
            className="icon-button"
            aria-label="Search saved conversations"
            onClick={() => setModal("search")}
          >
            <MoreHorizontal size={17} />
          </button>
        </div>
        <nav className="conversation-list" aria-label="Saved conversations">
          {history.length > 0 ? (
            <>
              <div className="history-period">Recent</div>
              {history.map((item) => (
                <button
                  key={item.id}
                  className={`conversation-item ${currentId === item.id ? "active" : ""}`}
                  disabled={busy}
                  onClick={() => void openConversation(item.id)}
                  title={item.title}
                >
                  <MessageSquare size={16} />
                  <span>{item.title}</span>
                  {currentId === item.id && <span className="active-dot" />}
                </button>
              ))}
            </>
          ) : (
            <div className="history-empty">
              <div className="history-empty-icon">
                <MessageSquare size={19} />
                <span />
              </div>
              <p>A little space for your big ideas.</p>
              <span>Your conversations will show up here.</span>
            </div>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="model-promo">
            <div className="promo-title">
              <Sparkles size={17} />
              <span>A mind for more.</span>
              <span className="new-badge">NEW</span>
            </div>
            <p>
              Meet Kimi K3. Built for deeper
              <br />
              thinking and bigger possibilities.
            </p>
            <button onClick={() => setModal("model")}>
              Explore Kimi K3 <ArrowUpRight size={15} />
            </button>
            <div className="promo-decoration" aria-hidden="true">
              ✳
            </div>
          </div>
          <div className="sidebar-links">
            <button onClick={() => setModal("settings")}>
              <Settings size={16} />
              Settings
            </button>
            <button onClick={() => setModal("help")}>
              <CircleHelp size={16} />
              Help & getting started
            </button>
          </div>
          <button className="profile" onClick={() => setModal("settings")}>
            <span className="avatar">Y</span>
            <span>
              <strong>Your workspace</strong>
              <small>Personal space</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>
        <div className="sidebar-footnote">
          <span className="tiny-dot" /> A little more possible.
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button open-sidebar"
              aria-label="Open navigation"
              onClick={() => {
                setSidebarCollapsed(false);
                setMobileOpen(true);
              }}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-workspace">Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <span className="breadcrumb-current">
              {current?.title ?? "New chat"}
            </span>
            {current && !busy && (
              <button
                className="icon-button rename-header"
                aria-label="Rename conversation"
                onClick={() => {
                  setRename(current.title);
                  setModal("rename");
                }}
              >
                <PenLine size={14} />
              </button>
            )}
          </div>
          <div className="topbar-actions">
            <span className="private-label">
              <ShieldCheck size={14} /> Your personal space
            </span>
            <span className="topbar-divider" />
            <button
              className="model-selector"
              onClick={() => setModal("settings")}
            >
              <span className="status-dot" />
              Kimi K3
              <ChevronDown size={14} />
            </button>
            <button
              className="icon-button"
              aria-label="Chat settings"
              onClick={() => setModal("settings")}
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>
        </header>

        <div className={`chat-body ${messages.length ? "has-messages" : ""}`}>
          {loadingChat ? (
            <div className="opening-state">
              <Loader2 className="spin" size={23} />
              <p>Opening your conversation…</p>
            </div>
          ) : messages.length === 0 ? (
            <section className="welcome" aria-labelledby="welcome-title">
              <div className="welcome-emblem" aria-hidden="true">
                <div className="emblem-glow" />
                <Sparkles size={34} strokeWidth={1.35} />
                <span className="emblem-star">✦</span>
              </div>
              <div className="welcome-eyebrow">
                A LITTLE CURIOSITY. A WORLD OF POSSIBILITY.
              </div>
              <h1 id="welcome-title">
                Good things start
                <br />
                with <span>a conversation.</span>
              </h1>
              <p className="welcome-description">
                A big idea, a small question, or a blank page.
                <br />
                Bring it here. We’ll figure it out together.
              </p>
              <div className="starter-grid">
                {categories.map((item) => (
                  <button
                    key={item.id}
                    className={`starter-card ${category === item.id ? "selected" : ""}`}
                    onClick={() => {
                      setCategory(item.id);
                      if (item.id === "image") fileInput.current?.click();
                    }}
                  >
                    <div className="starter-top">
                      <span className={`category-icon ${item.color}`}>
                        <item.icon size={19} strokeWidth={1.6} />
                      </span>
                      <ArrowUpRight className="starter-arrow" size={16} />
                    </div>
                    <h2>{item.title}</h2>
                    <p>{item.description}</p>
                  </button>
                ))}
              </div>
              <div className="prompt-starters">
                <span>
                  {selectedCategory
                    ? "A place to start"
                    : "Or, try a little inspiration"}
                </span>
                <div>
                  {starters.map((prompt) => (
                    <button key={prompt} onClick={() => fillPrompt(prompt)}>
                      {prompt}
                      <ArrowUpRight size={12} />
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <section
              className="messages"
              aria-label="Conversation"
              aria-busy={busy}
            >
              {messages.map((message) => (
                <article key={message.id} className={`message ${message.role}`}>
                  <div
                    className={`message-avatar ${message.role === "assistant" ? "assistant-avatar" : ""}`}
                  >
                    {message.role === "assistant" ? <KimiMark small /> : "Y"}
                  </div>
                  <div className="message-main">
                    <div className="message-author">
                      {message.role === "assistant" ? "Kimi" : "You"}
                      {message.role === "assistant" && <span>K3</span>}
                    </div>
                    {message.image && (
                      <Image
                        unoptimized
                        className="message-image"
                        src={message.image}
                        width={280}
                        height={200}
                        alt="Image attached to your message"
                      />
                    )}
                    {message.role === "assistant" ? (
                      message.content ? (
                        <div className="markdown">
                          <Markdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ children, href }) => (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {children}
                                </a>
                              ),
                              img: ({ alt }) => (
                                <span>[Image: {alt ?? "image"}]</span>
                              ),
                            }}
                          >
                            {message.content}
                          </Markdown>
                        </div>
                      ) : (
                        <div className="thinking-indicator">
                          <span />
                          <span />
                          <span />
                          <small>
                            {thinking
                              ? "Thinking it through…"
                              : "Making a little room for your idea…"}
                          </small>
                        </div>
                      )
                    ) : (
                      <p className="user-content">{message.content}</p>
                    )}
                    {message.role === "assistant" &&
                      message.content &&
                      !busy && (
                        <div className="response-actions">
                          <button
                            aria-label="Copy response"
                            onClick={() => void copy(message)}
                          >
                            {copied === message.id ? (
                              <Check size={15} />
                            ) : (
                              <Copy size={15} />
                            )}
                            <span>
                              {copied === message.id ? "Copied" : "Copy"}
                            </span>
                          </button>
                        </div>
                      )}
                  </div>
                </article>
              ))}
              <div ref={bottomRef} />
            </section>
          )}
        </div>

        <div className="composer-area">
          {current && !busy && messages.length > 0 && (
            <div className="chat-tools">
              <span>
                <MessageSquare size={12} />
                {
                  messages.filter((message) => message.role === "user").length
                }{" "}
                messages in this conversation
              </span>
              <button onClick={exportChat}>
                <Download size={13} />
                Export
              </button>
              <button
                onClick={() => setModal("delete")}
                aria-label="Delete conversation"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <CircleHelp size={17} />
              <div>
                {error}
                {!configured && error.includes("NVIDIA") && (
                  <button onClick={() => setModal("settings")}>
                    Connection settings <ArrowRight size={13} />
                  </button>
                )}
                {!ready && (
                  <button
                    onClick={() => {
                      setError("");
                      void refresh();
                    }}
                  >
                    Retry connection
                  </button>
                )}
                {ready && !busy && messages.at(-1)?.role === "user" && (
                  <button
                    onClick={() => void sendMessage(undefined, messages.at(-1))}
                  >
                    Try again <ArrowRight size={13} />
                  </button>
                )}
              </div>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <form
            className={`composer ${busy ? "is-busy" : ""}`}
            onSubmit={(event) => void sendMessage(event)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!busy) void upload(event.dataTransfer.files[0]);
            }}
          >
            {attachment && (
              <div className="attachment">
                <Image
                  unoptimized
                  src={attachment.data}
                  width={45}
                  height={45}
                  alt="Attachment preview"
                />
                <div>
                  <strong>{attachment.name}</strong>
                  <span>Image · Ready to explore</span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Remove attachment"
                  disabled={busy}
                  onClick={() => setAttachment(undefined)}
                >
                  <X size={15} />
                </button>
              </div>
            )}
            <label className="sr-only" htmlFor="message">
              Message Kimi
            </label>
            <textarea
              id="message"
              ref={textarea}
              value={draft}
              rows={2}
              maxLength={16000}
              disabled={busy || loadingChat}
              placeholder="Ask a question, share an idea, or drop an image…"
              onChange={(event) => {
                setDraft(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              onPaste={(event) => {
                const image = Array.from(event.clipboardData.files).find(
                  (file) => file.type.startsWith("image/"),
                );
                if (image) {
                  event.preventDefault();
                  void upload(image);
                }
              }}
            />
            <div className="composer-bottom">
              <div className="composer-options">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Upload image"
                  onChange={(event) => {
                    void upload(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="attach-button"
                  title="Attach image (PNG, JPEG, WebP · up to 2 MB)"
                  aria-label="Attach an image"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  <Plus size={21} />
                </button>
                <span className="composer-divider" />
                <button
                  type="button"
                  className={`think-button ${settings.reasoningEffort !== "low" ? "enabled" : ""}`}
                  disabled={busy}
                  aria-pressed={settings.reasoningEffort !== "low"}
                  onClick={() =>
                    setSettings((old) => ({
                      ...old,
                      reasoningEffort:
                        old.reasoningEffort === "low" ? "max" : "low",
                    }))
                  }
                >
                  <Brain size={15} />
                  <span>Deep think</span>
                  {settings.reasoningEffort !== "low" && (
                    <span className="think-dot" />
                  )}
                </button>
                <span className="image-capable">
                  <ImageIcon size={14} />
                  Image understanding
                </span>
              </div>
              <div className="send-options">
                <span className="enter-hint">
                  {busy ? "Working on it" : "Enter to send"}
                </span>
                {busy ? (
                  <button
                    className="send-button stop-button"
                    type="button"
                    aria-label="Stop response"
                    onClick={() => abortRef.current?.abort()}
                  >
                    <Square size={16} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    className="send-button"
                    type="submit"
                    aria-label="Send message"
                    disabled={!draft.trim() || !ready || loadingChat}
                  >
                    <ArrowUp size={20} />
                  </button>
                )}
              </div>
            </div>
          </form>
          <div className="composer-footer">
            <span>
              Kimi can make mistakes. Give important things a second look.
            </span>
            <button onClick={() => setModal("model")}>
              <span className="nvidia-symbol">▰</span>Powered by{" "}
              <strong>NVIDIA NIM</strong>
              <ArrowUpRight size={11} />
            </button>
          </div>
        </div>
      </main>

      <Modal
        open={modal === "search"}
        onOpenChange={(open) => !open && setModal(null)}
        title="Find a conversation"
        description="A good idea is worth coming back to."
      >
        <div className="search-input">
          <Search size={18} />
          <input
            aria-label="Search conversations"
            placeholder="Search your conversations…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="search-results">
          {filteredHistory.length ? (
            filteredHistory.map((item) => (
              <button
                key={item.id}
                disabled={busy}
                onClick={() => void openConversation(item.id)}
              >
                <MessageSquare size={17} />
                <span>
                  {item.title}
                  <small>
                    {new Date(item.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))
          ) : (
            <div className="search-empty">
              <Search size={25} />
              <h3>
                {search
                  ? "No conversations found"
                  : "Your next idea starts here"}
              </h3>
              <p>
                {search
                  ? "Try a different word or phrase."
                  : "Start a chat and it will be saved in this workspace."}
              </p>
              <button
                className="primary-button"
                onClick={newChat}
                disabled={busy}
              >
                Start a new chat <Plus size={16} />
              </button>
            </div>
          )}
        </div>
      </Modal>
      <Modal
        open={modal === "settings"}
        onOpenChange={(open) => !open && setModal(null)}
        title="Make Kimi your own"
        description="A few thoughtful controls for how you like to think."
      >
        <div className="settings-model">
          <span className="settings-model-icon">
            <KimiMark small />
          </span>
          <div>
            <strong>Kimi K3</strong>
            <span>Moonshot AI · Served by NVIDIA NIM</span>
          </div>
          <span className="model-tag">MULTIMODAL</span>
        </div>
        <div className={`connection-status ${configured ? "connected" : ""}`}>
          <span className="status-dot" />
          <div>
            <strong>
              {configured
                ? "NVIDIA API key configured"
                : "Connect your NVIDIA account"}
            </strong>
            <p>
              {configured
                ? "Your key stays on the server. Model access is verified when you send a message."
                : "Set NVIDIA_API_KEY in your server environment and restart the application. Never paste your API key into a chat."}
            </p>
            {!configured && (
              <a
                href="https://build.nvidia.com/moonshotai/kimi-k3"
                target="_blank"
                rel="noopener noreferrer"
              >
                Get an API key <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
        <div className="setting-field">
          <div>
            <label htmlFor="temperature">Temperature</label>
            <output>{settings.temperature.toFixed(1)}</output>
          </div>
          <input
            id="temperature"
            type="range"
            min="0"
            max="2"
            step="0.1"
            disabled={busy}
            value={settings.temperature}
            onChange={(event) =>
              setSettings({
                ...settings,
                temperature: Number(event.target.value),
              })
            }
          />
          <div className="range-labels">
            <span>More focused</span>
            <span>More creative</span>
          </div>
        </div>
        <div className="setting-field">
          <label htmlFor="reasoning">Reasoning effort</label>
          <select
            id="reasoning"
            disabled={busy}
            value={settings.reasoningEffort}
            onChange={(event) =>
              setSettings({
                ...settings,
                reasoningEffort: event.target
                  .value as ChatSettings["reasoningEffort"],
              })
            }
          >
            <option value="low">Light — quicker responses</option>
            <option value="high">High — thoughtful and balanced</option>
            <option value="max">Deep think — take the time to explore</option>
          </select>
        </div>
        <div className="setting-field">
          <label htmlFor="tokens">Maximum output tokens</label>
          <select
            id="tokens"
            disabled={busy}
            value={settings.maxTokens}
            onChange={(event) =>
              setSettings({
                ...settings,
                maxTokens: Number(event.target.value),
              })
            }
          >
            <option value={1024}>1,024 — short answers</option>
            <option value={4096}>4,096 — everyday conversations</option>
            <option value={8192}>8,192 — more room to explore</option>
            <option value={16384}>16,384 — the full picture</option>
          </select>
          <p className="field-note">
            Includes thinking and answer tokens. Deep think works best with a
            larger limit.
          </p>
        </div>
        <div className="modal-footer">
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setSettings(defaultSettings)}
          >
            Reset to defaults
          </button>
          <button className="primary-button" onClick={() => setModal(null)}>
            Done <Check size={15} />
          </button>
        </div>
      </Modal>
      <Modal
        open={modal === "model"}
        onOpenChange={(open) => !open && setModal(null)}
        title="A mind for more."
        description="Meet Kimi K3, your partner for the next big idea."
      >
        <div className="model-feature">
          <Brain />
          <div>
            <h3>Room to think deeply</h3>
            <p>
              Explore complex questions with adjustable reasoning effort and
              streamed answers.
            </p>
          </div>
        </div>
        <div className="model-feature">
          <Eye />
          <div>
            <h3>A fresh pair of eyes</h3>
            <p>
              Bring an image, screenshot, or diagram. Ask questions and explore
              what’s inside.
            </p>
          </div>
        </div>
        <div className="model-feature">
          <Code2 />
          <div>
            <h3>From what if to what’s next</h3>
            <p>
              Write, code, learn, and plan with Moonshot AI’s multimodal model,
              served through NVIDIA NIM.
            </p>
          </div>
        </div>
        <a
          className="model-doc-link"
          href="https://build.nvidia.com/moonshotai/kimi-k3"
          target="_blank"
          rel="noopener noreferrer"
        >
          View model details on NVIDIA <ExternalLink size={15} />
        </a>
        <button
          className="primary-button full-width"
          onClick={() => {
            setModal(null);
            textarea.current?.focus();
          }}
        >
          Let’s make something <ArrowRight size={16} />
        </button>
      </Modal>
      <Modal
        open={modal === "help"}
        onOpenChange={(open) => !open && setModal(null)}
        title="A little help getting started"
        description="There’s no perfect prompt. Just a place to begin."
      >
        <div className="model-feature">
          <MessageSquare />
          <div>
            <h3>Make it a conversation</h3>
            <p>
              Ask a question, add some context, and follow up. Kimi remembers
              the messages in your current chat.
            </p>
          </div>
        </div>
        <div className="model-feature">
          <ImageIcon />
          <div>
            <h3>Show, don’t just tell</h3>
            <p>
              Attach, paste, or drop a PNG, JPEG, or WebP image up to 2 MB into
              the message box.
            </p>
          </div>
        </div>
        <div className="model-feature">
          <ShieldCheck />
          <div>
            <h3>Your browser, your workspace</h3>
            <p>
              Chats are saved on the server and linked to this browser’s session
              cookie. Clearing cookies loses access. Prompts and images are sent
              to NVIDIA for inference; avoid sensitive information.
            </p>
          </div>
        </div>
        <div className="shortcuts">
          <span>
            <Command size={15} /> K <small>Search conversations</small>
          </span>
          <span>
            Shift + Enter <small>Add a new line</small>
          </span>
        </div>
        <button
          className="primary-button full-width"
          onClick={() => {
            setModal(null);
            textarea.current?.focus();
          }}
        >
          Got it <Check size={16} />
        </button>
      </Modal>
      <Modal
        open={modal === "rename"}
        onOpenChange={(open) => !open && !mutationBusy && setModal(null)}
        title="Give this idea a name"
        description="Choose a title that’s easy to find later."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void mutateConversation("rename");
          }}
        >
          <label className="field-label" htmlFor="chat-title">
            Conversation title
          </label>
          <input
            className="text-input"
            id="chat-title"
            maxLength={100}
            value={rename}
            onChange={(event) => setRename(event.target.value)}
            required
          />
          <div className="modal-footer">
            <button
              type="button"
              className="text-button"
              onClick={() => setModal(null)}
              disabled={mutationBusy}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={mutationBusy || !rename.trim()}
            >
              {mutationBusy ? "Saving…" : "Save title"}
              <Check size={15} />
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={modal === "delete"}
        onOpenChange={(open) => !open && !mutationBusy && setModal(null)}
        title="Let this conversation go?"
        description="This permanently deletes the conversation and its attachments from your workspace. It can’t be undone."
      >
        <div className="delete-preview">
          <MessageSquare size={17} />
          {current?.title}
        </div>
        <div className="modal-footer">
          <button
            className="text-button"
            disabled={mutationBusy}
            onClick={() => setModal(null)}
          >
            Keep conversation
          </button>
          <button
            className="danger-button"
            disabled={mutationBusy}
            onClick={() => void mutateConversation("delete")}
          >
            {mutationBusy ? "Deleting…" : "Delete conversation"}
            <Trash2 size={15} />
          </button>
        </div>
      </Modal>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="sr-only" role="status" aria-live="polite">
        {busy
          ? thinking
            ? "Kimi is thinking."
            : "Kimi is responding."
          : messages.at(-1)?.role === "assistant"
            ? "Response complete."
            : ""}
      </div>
    </div>
  );
}

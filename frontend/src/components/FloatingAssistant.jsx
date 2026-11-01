import { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function FloatingAssistant() {
  const { user, isAdmin, isStaff } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'assistant',
      text: `Namaste! 🙏 I am your **Smart Vyapar AI Assistant**.\nI am connected directly to your live store database. How can I assist your business today?`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [chips, setChips] = useState([
    'Check low stock',
    "Today's total sales",
    'Top selling items',
    'Customer udhar balance',
    'How to bill offline?',
  ]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages]);

  const handleSendMessage = async (queryText) => {
    const textToSend = (typeof queryText === 'string' ? queryText : inputText).trim();
    if (!textToSend || loading) return;

    const userMsg = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      // Send message along with minimal conversation history
      const history = messages.slice(-6).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      const res = await api.post('/chat/message', {
        message: textToSend,
        history,
      });

      if (res && res.reply) {
        const botMsg = {
          id: 'bot-' + Date.now(),
          sender: 'assistant',
          text: res.reply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, botMsg]);

        if (Array.isArray(res.suggestedChips) && res.suggestedChips.length > 0) {
          setChips(res.suggestedChips);
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          sender: 'assistant',
          text: `⚠️ **Assistant Error:** ${err.message || 'Unable to connect to assistant service. Please check server.'}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome-' + Date.now(),
        sender: 'assistant',
        text: `Chat reset. Ask me anything about stock, sales, bills, or store operations!`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  // Helper to format basic markdown-style text (bold, lists, emojis)
  const renderMessageContent = (text) => {
    const lines = text.split('\n');
    return (
      <div className="space-y-1 text-sm leading-relaxed">
        {lines.map((line, idx) => {
          if (!line.trim()) return <div key={idx} className="h-1.5" />;

          // Process bold tags **word**
          const parts = line.split(/(\*\*.*?\*\*)/g);
          const renderedLine = parts.map((part, pIdx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return (
                <strong key={pIdx} className="font-bold text-slate-900 dark:text-white">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            if (part.startsWith('`') && part.endsWith('`')) {
              return (
                <code key={pIdx} className="rounded bg-slate-200 px-1 py-0.5 font-mono text-xs dark:bg-slate-700">
                  {part.slice(1, -1)}
                </code>
              );
            }
            return part;
          });

          if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
            return (
              <div key={idx} className="flex items-start gap-1.5 pl-1">
                <span className="text-emerald-500 font-bold">•</span>
                <span>{renderedLine}</span>
              </div>
            );
          }

          return <p key={idx}>{renderedLine}</p>;
        })}
      </div>
    );
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 print:hidden">
      {/* Collapsible Chat Window */}
      {isOpen && (
        <div className="mb-3 flex h-[520px] w-[370px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-200 animate-in slide-in-from-bottom-4 dark:border-slate-800 dark:bg-slate-900 sm:w-[420px]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-emerald-800 to-teal-900 px-4 py-3 text-white shadow dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-xl backdrop-blur-sm">
                🤖
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-950" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-extrabold tracking-tight">Vyapar AI Assistant</h3>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.2 text-[10px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
                    Live DB
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-white/70">
                  <span>Role:</span>
                  <span className="font-semibold text-white">
                    {isAdmin ? '👑 Store Owner' : isStaff ? '🛒 Counter Staff' : '🏢 Dealer'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClearChat}
                title="Clear conversation"
                className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition"
              >
                🧹
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Minimize assistant"
                className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition font-bold"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin dark:bg-slate-950/50">
            {messages.map((m) => {
              const isUser = m.sender === 'user';
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                      isUser
                        ? 'bg-emerald-600 text-white rounded-br-none'
                        : 'bg-slate-100 text-slate-800 dark:bg-slate-800/90 dark:text-slate-100 rounded-bl-none border border-slate-200 dark:border-slate-700/60'
                    }`}
                  >
                    {renderMessageContent(m.text)}
                  </div>
                  <span className="mt-1 px-1 text-[10px] text-slate-400 dark:text-slate-500">
                    {m.time}
                  </span>
                </div>
              );
            })}

            {/* Typing indicator */}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-100 text-sm shadow-sm dark:bg-slate-800">
                  🤖
                </div>
                <div className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 dark:bg-slate-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce" />
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.2s]" />
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.4s]" />
                  <span className="ml-1 text-[11px] font-medium">Querying store database...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Chips */}
          <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2 dark:border-slate-800/80 dark:bg-slate-900/60">
            <div className="mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Quick Suggestions:
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {chips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(chip)}
                  disabled={loading}
                  className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-emerald-400 dark:hover:bg-slate-700"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Input Footer */}
          <div className="border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about stock, sales, bills, offline mode..."
                disabled={loading}
                className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || loading}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md transition hover:bg-emerald-500 active:scale-95 disabled:opacity-40 disabled:hover:bg-emerald-600"
                title="Send query"
              >
                ➔
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating Launcher Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-700 via-teal-700 to-emerald-500 text-white shadow-xl transition-all duration-200 hover:scale-105 hover:shadow-emerald-900/40 active:scale-95 focus:outline-none"
        title={isOpen ? 'Close Assistant' : 'Ask Smart Vyapar AI'}
      >
        <span className="text-2xl transition-transform group-hover:scale-110">
          {isOpen ? '✕' : '🤖'}
        </span>

        {/* Pulse beacon badge */}
        {!isOpen && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 text-[9px] font-black items-center justify-center text-white">
              AI
            </span>
          </span>
        )}
      </button>
    </div>
  );
}

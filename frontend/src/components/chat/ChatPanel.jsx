/**
 * Chat Panel Component
 * 
 * Document-aware chat interface for asking questions about the analyzed document.
 */
import React, { useState, useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import { MessageSquare, AlertTriangle, DoorOpen, DollarSign, Handshake, Loader2, Send } from 'lucide-react';

/**
 * Chat Panel
 */
export default function ChatPanel({ sessionId, isLoading, onSendMessage }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hi! I've analyzed this document. Ask me anything about it and I'll help you understand the clauses, risks, and what to do about them.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * Handle chat submission
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!input.trim() || isSubmitting) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    // Add user message
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsSubmitting(true);

    try {
      // Send to API
      const response = await onSendMessage(sessionId, userMessage.content);

      // Add assistant response
      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.answer,
        sources: response.sources,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      // Add error message
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I apologize, but I encountered an error. Please try again.",
        isError: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Handle suggested questions
   */
  const handleSuggestedQuestion = (question) => {
    setInput(question);
  };

  return (
    <div className="chat-panel">
      {/* Chat Header */}
      <div className="chat-header">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <MessageSquare size={18} /> Document Chat
        </h3>
        <p className="chat-subtitle">Ask anything about this document</p>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {isLoading && isSubmitting && (
          <div className="chat-message assistant">
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      {messages.length === 1 && (
        <div className="suggested-questions">
          <p className="suggested-label">Try asking:</p>
          <div className="suggested-grid">
            <button
              className="btn btn-secondary btn-small suggested-btn flex items-center justify-center gap-2"
              onClick={() => handleSuggestedQuestion('What are the most concerning clauses?')}
            >
              <AlertTriangle size={14} className="shrink-0" /> <span className="truncate">Most concerning clauses?</span>
            </button>
            <button
              className="btn btn-secondary btn-small suggested-btn flex items-center justify-center gap-2"
              onClick={() => handleSuggestedQuestion('What are my termination rights?')}
            >
              <DoorOpen size={14} className="shrink-0" /> <span className="truncate">Termination rights?</span>
            </button>
            <button
              className="btn btn-secondary btn-small suggested-btn flex items-center justify-center gap-2"
              onClick={() => handleSuggestedQuestion('Are there any hidden fees?')}
            >
              <DollarSign size={14} className="shrink-0" /> <span className="truncate">Hidden fees?</span>
            </button>
            <button
              className="btn btn-secondary btn-small suggested-btn flex items-center justify-center gap-2"
              onClick={() => handleSuggestedQuestion('What should I negotiate?')}
            >
              <Handshake size={14} className="shrink-0" /> <span className="truncate">What to negotiate?</span>
            </button>
          </div>
        </div>
      )}

      {/* Input Form */}
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-input"
          placeholder="Ask a question about this document..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isSubmitting}
        />
        <button
          type="submit"
          className="btn btn-primary chat-submit-btn flex items-center justify-center p-3"
          disabled={!input.trim() || isSubmitting}
        >
          {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
}

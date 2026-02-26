/**
 * Chat Message Component
 *
 * Individual message bubble for chat interface.
 * Renders simple markdown (bold, newlines) for assistant messages.
 */
import React from 'react';

/**
 * Parse simple markdown: **bold** and newlines
 */
function renderSimpleMarkdown(text) {
  if (!text || typeof text !== 'string') return text;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*(.+)\*\*$/);
    return bold ? <strong key={i}>{bold[1]}</strong> : part;
  });
}

/**
 * Chat Message
 */
export default function ChatMessage({ message }) {
  const { role, content, sources, isError, timestamp } = message;

  const isUser = role === 'user';

  const formattedContent = isUser ? (
    content
  ) : (
    <div className="message-text-formatted">
      {String(content).split('\n').map((line, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {renderSimpleMarkdown(line)}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'} ${isError ? 'error' : ''}`}>
      <div className="message-avatar">
        {isUser ? '👤' : '🤖'}
      </div>
      
      <div className="message-content">
        <div className={`message-text ${!isUser ? 'has-markdown' : ''}`}>
          {formattedContent}
        </div>
        
        {/* Source References */}
        {sources && sources.length > 0 && (
          <div className="message-sources">
            <span className="sources-label">Sources:</span>
            <div className="sources-list">
              {sources.map((source, index) => (
                <span key={index} className="source-tag">
                  {source}
                </span>
              ))}
            </div>
          </div>
        )}
        
        <div className="message-timestamp">
          {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

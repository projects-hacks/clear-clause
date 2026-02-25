/**
 * Chat Message Component
 * 
 * Individual message bubble for chat interface.
 */
import React from 'react';

/**
 * Chat Message
 */
export default function ChatMessage({ message }) {
  const { role, content, sources, isError, timestamp } = message;

  const isUser = role === 'user';

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'} ${isError ? 'error' : ''}`}>
      <div className="message-avatar">
        {isUser ? '👤' : '🤖'}
      </div>
      
      <div className="message-content">
        <div className="message-text">
          {content}
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

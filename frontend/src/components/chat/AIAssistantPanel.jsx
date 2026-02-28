import React, { useState, useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import VoiceInput from './VoiceInput';
import { Volume2, VolumeX, MessageSquare, AlertTriangle, DoorOpen, Loader2, Send, DollarSign, FileText } from 'lucide-react';
import { transcribeAudio, generateSpeech } from '../../services/api';
import { useAnalysis } from '../../context/AnalysisContext';

export default function AIAssistantPanel({ sessionId }) {
    const { sessions } = useAnalysis();
    const session = sessions.find(s => s.session_id === sessionId);
    const result = session?.result;

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isVoiceOn, setIsVoiceOn] = useState(() => {
        const saved = localStorage.getItem('clearclause_voice_on');
        return saved !== null ? saved === 'true' : false;
    });
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
    const [initializedFromStorage, setInitializedFromStorage] = useState(false);

    // Persist voice setting
    useEffect(() => {
        localStorage.setItem('clearclause_voice_on', isVoiceOn);
    }, [isVoiceOn]);

    const messagesEndRef = useRef(null);
    const currentAudioSourceRef = useRef(null);
    const chatAbortRef = useRef(null);

    const storageKey = sessionId ? `clearclause_chat_${sessionId}` : null;

    // Restore chat history for this session from localStorage
    useEffect(() => {
        if (!sessionId || initializedFromStorage) return;

        try {
            const raw = localStorage.getItem(`clearclause_chat_${sessionId}`);
            if (raw) {
                const stored = JSON.parse(raw);
                const restored = stored.map((m) => ({
                    ...m,
                    timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
                }));
                setMessages(restored);
                if (restored.length > 0) {
                    lastPlayedIdRef.current = restored[restored.length - 1].id;
                }
            }
        } catch (e) {
            console.error('Failed to restore chat history:', e);
        } finally {
            setInitializedFromStorage(true);
        }
    }, [sessionId, initializedFromStorage]);

    // Persist chat history whenever it changes
    useEffect(() => {
        if (!storageKey) return;
        try {
            const serializable = messages.map((m) => ({
                ...m,
                timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
            }));
            localStorage.setItem(storageKey, JSON.stringify(serializable));
        } catch (e) {
            console.error('Failed to persist chat history:', e);
        }
    }, [messages, storageKey]);

    // Initialize first message
    useEffect(() => {
        if (!result || !initializedFromStorage) return;
        if (messages.length === 0) {
            const welcomeMsg = {
                id: 'welcome',
                role: 'assistant',
                content: `Hi! I've analyzed **${result.document_name}**. \n\n${result.summary}\n\nWhat would you like to know about this document?`,
                timestamp: new Date(),
            };
            setMessages([welcomeMsg]);
        }
    }, [result, initializedFromStorage, messages.length]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const lastPlayedIdRef = useRef(null);

    // Play audio for new assistant messages (but never auto-play the welcome)
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (
            lastMessage &&
            lastMessage.role === 'assistant' &&
            lastMessage.id !== 'welcome' &&
            lastMessage.isComplete &&
            isVoiceOn &&
            !lastMessage.isError &&
            lastMessage.id !== currentlyPlaying &&
            lastMessage.id !== lastPlayedIdRef.current
        ) {
            lastPlayedIdRef.current = lastMessage.id;
            playTTS(lastMessage.content, lastMessage.id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages]); // Remove isVoiceOn and currentlyPlaying to prevent repeating audio on state toggle

    const playTTS = async (text, msgId) => {
        try {
            setCurrentlyPlaying(msgId);

            // Strip markdown like **, *, #, etc. so the voice doesn't read them
            const plainText = text
                .replace(/[*#_`~]/g, '')
                .replace(/[\[\]()]/g, '')
                .replace(/-\s/g, '')
                .replace(/clause_(\d+)/gi, 'clause $1')
                .trim();

            const audioBlob = await generateSpeech(sessionId, plainText);
            const url = URL.createObjectURL(audioBlob);
            const audio = new Audio(url);

            // Stop previous audio
            if (currentAudioSourceRef.current) {
                currentAudioSourceRef.current.pause();
            }
            currentAudioSourceRef.current = audio;

            audio.onended = () => {
                setCurrentlyPlaying(null);
            };

            await audio.play();
        } catch (err) {
            console.error('TTS playback failed:', err);
            setCurrentlyPlaying(null);
            // If the session has expired, surface a clear message in the chat
            if (err.code === 'session_not_found') {
                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: 'This analysis has expired. Please upload your document again to use voice playback.',
                    isError: true,
                    timestamp: new Date(),
                }]);
            }
        }
    };

    const toggleVoice = () => {
        setIsVoiceOn(prev => {
            if (prev && currentAudioSourceRef.current) {
                currentAudioSourceRef.current.pause();
                setCurrentlyPlaying(null);
            }
            return !prev;
        });
    };

    const handleTranscription = async (audioBlob) => {
        setIsSubmitting(true);
        try {
            const text = await transcribeAudio(sessionId, audioBlob);
            if (text && text.trim()) {
                await submitUserMessage(text.trim());
            }
        } catch (err) {
            console.error('Transcription error:', err);
            const friendly =
                err.code === 'session_not_found'
                    ? 'This analysis has expired. Please upload your document again to start a new session.'
                    : 'Transcription failed. Please try again.';
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: friendly,
                isError: true,
                isComplete: true,
                timestamp: new Date(),
            }]);
        } finally {
            setIsSubmitting(false);
        }
    };

    const submitUserMessage = async (textContent) => {
        if (isSubmitting) {
            return;
        }

        const userMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: textContent,
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsSubmitting(true);

        try {
            const { askQuestion } = await import('../../services/api');

            // Cancel any in-flight chat request before starting a new one
            if (chatAbortRef.current) {
                chatAbortRef.current.abort();
            }
            const controller = new AbortController();
            chatAbortRef.current = controller;

            // Extract chat history to send to backend (excluding welcome banner and errors)
            const chatHistory = messages
                .filter(m => m.id !== 'welcome' && !m.isError)
                .map(m => ({
                    role: m.role,
                    content: m.content
                }));

            const assistantId = (Date.now() + 1).toString();

            // Create a placeholder message for the assistant
            setMessages(prev => [...prev, {
                id: assistantId,
                role: 'assistant',
                content: '',
                sources: null,
                isComplete: false,
                timestamp: new Date()
            }]);

            const response = await askQuestion(sessionId, textContent, chatHistory, {
                signal: controller.signal,
                onChunk: (fullText) => {
                    setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullText } : m));
                },
                onSources: (sources) => {
                    setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, sources } : m));
                }
            });

            // Ensure the final state is captured (just in case) and mark complete for TTS
            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: response.answer, sources: response.sources, isComplete: true }
                    : m
            ));

        } catch (err) {
            if (err.name === 'AbortError') {
                return;
            }
            const errorContent = err.message?.includes('422')
                ? "Unable to process your request. The session may have expired. Please upload your document again to start a new analysis."
                : "I apologize, but I encountered an error. Please try again.";

            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: errorContent,
                isError: true,
                isComplete: true,
                timestamp: new Date(),
            }]);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!input.trim() || isSubmitting) return;
        submitUserMessage(input.trim());
    };

    // Cleanup on unmount: stop audio and abort any in-flight chat request
    useEffect(() => {
        return () => {
            if (currentAudioSourceRef.current) {
                currentAudioSourceRef.current.pause();
            }
            if (chatAbortRef.current) {
                chatAbortRef.current.abort();
            }
        };
    }, []);

    return (
        <div className="chat-panel">
            {/* Header */}
            <div className="chat-header ai-assistant-header">
                <div className="chat-header-content">
                    <h3 className="chat-header-title">
                        <MessageSquare size={18} /> AI Assistant
                    </h3>
                    <p className="chat-subtitle">Discuss this document</p>
                </div>
                <button
                    className={`voice-toggle-btn ${isVoiceOn ? 'active' : ''}`}
                    onClick={toggleVoice}
                    title={isVoiceOn ? "Stop reading responses aloud" : "Read AI responses aloud"}
                >
                    {isVoiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                    {isVoiceOn ? 'Read Aloud On' : 'Read Aloud Off'}
                </button>
            </div>

            {/* Messages */}
            <div className="chat-messages">
                {messages.map((message) => (
                    <ChatMessage key={message.id} message={message} />
                ))}

                {isSubmitting && (
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
                            className="btn btn-secondary btn-small suggested-btn"
                            onClick={() => submitUserMessage('What are the most concerning clauses?')}
                        >
                            <AlertTriangle size={14} /> <span>Most concerning?</span>
                        </button>
                        <button
                            className="btn btn-secondary btn-small suggested-btn"
                            onClick={() => submitUserMessage('What are my termination rights?')}
                        >
                            <DoorOpen size={14} /> <span>Termination rights</span>
                        </button>
                        <button
                            className="btn btn-secondary btn-small suggested-btn"
                            onClick={() => submitUserMessage('What financial obligations or penalties are mentioned?')}
                        >
                            <DollarSign size={14} /> <span>Financial obligations</span>
                        </button>
                        <button
                            className="btn btn-secondary btn-small suggested-btn"
                            onClick={() => submitUserMessage('Summarize the key points of this document')}
                        >
                            <FileText size={14} /> <span>Key summary</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Input Form */}
            <div className="chat-input-wrapper">
                <form className="chat-input-form" onSubmit={handleSubmit}>
                    <div className="chat-input-inner">
                        <input
                            type="text"
                            className="chat-input"
                            placeholder="Ask a question..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={isSubmitting}
                        />
                        <button
                            type="submit"
                            className={`chat-submit-btn ${input.trim() ? 'has-text' : ''}`}
                            disabled={!input.trim() || isSubmitting}
                        >
                            {isSubmitting && input.trim() ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        </button>
                    </div>
                </form>

                <VoiceInput
                    onTranscription={handleTranscription}
                    isSubmitting={isSubmitting}
                    sessionId={sessionId}
                />
            </div>
        </div>
    );
}

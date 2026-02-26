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
    const [isVoiceOn, setIsVoiceOn] = useState(true);
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);

    const messagesEndRef = useRef(null);
    const currentAudioSourceRef = useRef(null);

    // Initialize first message
    useEffect(() => {
        if (messages.length === 0 && result) {
            const welcomeMsg = {
                id: 'welcome',
                role: 'assistant',
                content: `Hi! I've analyzed **${result.document_name}**. \n\n${result.summary}\n\nWhat would you like to know about this document?`,
                timestamp: new Date(),
            };
            setMessages([welcomeMsg]);
        }
    }, [result]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Play audio for new assistant messages
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant' && isVoiceOn && !lastMessage.isError) {
            if (lastMessage.id !== currentlyPlaying) {
                playTTS(lastMessage.content, lastMessage.id);
            }
        }
    }, [messages, isVoiceOn]);

    const playTTS = async (text, msgId) => {
        try {
            setCurrentlyPlaying(msgId);
            const audioBlob = await generateSpeech(sessionId, text);
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
                timestamp: new Date(),
            }]);
        } finally {
            setIsSubmitting(false);
        }
    };

    const submitUserMessage = async (textContent) => {
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
            const response = await askQuestion(sessionId, textContent);

            const assistantMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: response.answer,
                sources: response.sources,
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (err) {
            const errorContent = err.message?.includes('422')
                ? "Unable to process your request. The session may have expired. Please upload your document again to start a new analysis."
                : "I apologize, but I encountered an error. Please try again.";

            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: errorContent,
                isError: true,
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
                    title={isVoiceOn ? "Mute AI Voice" : "Enable AI Voice"}
                >
                    {isVoiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                    {isVoiceOn ? 'Voice On' : 'Voice Off'}
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

import React, { useState, useRef } from 'react';
import { Mic, Square } from 'lucide-react';

export default function VoiceInput({ onTranscription, isSubmitting, sessionId }) {
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorderRef.current.onstop = async () => {
                const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
                chunksRef.current = [];
                // stop all tracks
                stream.getTracks().forEach(track => track.stop());

                await onTranscription(audioBlob);
            };

            chunksRef.current = [];
            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) {
            console.error('Microphone access error:', err);
            alert('Could not access microphone. Please check permissions.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const toggleRecording = (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    return (
        <div className="voice-input-container">
            <button
                type="button"
                className={`mic-btn ${isRecording ? 'recording' : ''}`}
                onClick={toggleRecording}
                disabled={isSubmitting && !isRecording}
                title={isRecording ? "Stop recording" : "Start voice input"}
            >
                {isRecording ? <Square size={16} fill="currentColor" /> : <Mic size={18} />}
                {isRecording && <span className="voice-status">Recording... click to send</span>}
            </button>
            {isRecording && (
                <div className="waveform">
                    <div className="waveform-bar"></div>
                    <div className="waveform-bar"></div>
                    <div className="waveform-bar"></div>
                    <div className="waveform-bar"></div>
                    <div className="waveform-bar"></div>
                </div>
            )}
        </div>
    );
}

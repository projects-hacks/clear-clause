/**
 * Analysis Context Provider
 * 
 * Manages global state for multiple concurrent document analyses.
 * Tracks all active sessions and their progress.
 */
import React, { createContext, useContext, useReducer, useEffect } from 'react';

const AnalysisContext = createContext(null);

// Action types
const ACTIONS = {
  ADD_SESSION: 'ADD_SESSION',
  UPDATE_SESSION: 'UPDATE_SESSION',
  REMOVE_SESSION: 'REMOVE_SESSION',
  SET_ACTIVE: 'SET_ACTIVE',
  CLEAR_COMPLETE: 'CLEAR_COMPLETE',
};

// Initial state
const initialState = {
  sessions: [],  // Array of all analysis sessions
  activeSessionId: null,  // Currently viewed session
};

// Reducer
function analysisReducer(state, action) {
  switch (action.type) {
    case ACTIONS.ADD_SESSION:
      return {
        ...state,
        sessions: [...state.sessions, action.payload],
        activeSessionId: action.payload.session_id,
      };
    
    case ACTIONS.UPDATE_SESSION:
      return {
        ...state,
        sessions: state.sessions.map(session =>
          session.session_id === action.payload.session_id
            ? { ...session, ...action.payload }
            : session
        ),
      };
    
    case ACTIONS.REMOVE_SESSION:
      return {
        ...state,
        sessions: state.sessions.filter(s => s.session_id !== action.payload),
        activeSessionId: state.activeSessionId === action.payload
          ? null
          : state.activeSessionId,
      };
    
    case ACTIONS.SET_ACTIVE:
      return {
        ...state,
        activeSessionId: action.payload,
      };
    
    case ACTIONS.CLEAR_COMPLETE:
      return {
        ...state,
        sessions: state.sessions.filter(
          s => s.status !== 'complete' && s.status !== 'error'
        ),
      };
    
    default:
      return state;
  }
}

/**
 * Analysis Provider Component
 */
export function AnalysisProvider({ children }) {
  const [state, dispatch] = useReducer(analysisReducer, initialState);

  // Load active sessions from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('clearclause_sessions');
    if (saved) {
      try {
        const sessions = JSON.parse(saved);
        sessions.forEach(session => {
          dispatch({
            type: ACTIONS.ADD_SESSION,
            payload: session,
          });
        });
      } catch (e) {
        console.error('Failed to load saved sessions:', e);
      }
    }
  }, []);

  // Save sessions to localStorage on change
  useEffect(() => {
    localStorage.setItem(
      'clearclause_sessions',
      JSON.stringify(state.sessions)
    );
  }, [state.sessions]);

  // Actions
  const addSession = (session) => {
    dispatch({ type: ACTIONS.ADD_SESSION, payload: session });
  };

  const updateSession = (sessionId, updates) => {
    dispatch({
      type: ACTIONS.UPDATE_SESSION,
      payload: { session_id: sessionId, ...updates },
    });
  };

  const removeSession = (sessionId) => {
    dispatch({ type: ACTIONS.REMOVE_SESSION, payload: sessionId });
  };

  const setActiveSession = (sessionId) => {
    dispatch({ type: ACTIONS.SET_ACTIVE, payload: sessionId });
  };

  const clearComplete = () => {
    dispatch({ type: ACTIONS.CLEAR_COMPLETE });
  };

  const getActiveSession = () => {
    return state.sessions.find(s => s.session_id === state.activeSessionId);
  };

  const getCompletedSessions = () => {
    return state.sessions.filter(s => s.status === 'complete');
  };

  const value = {
    ...state,
    addSession,
    updateSession,
    removeSession,
    setActiveSession,
    clearComplete,
    getActiveSession,
    getCompletedSessions,
  };

  return (
    <AnalysisContext.Provider value={value}>
      {children}
    </AnalysisContext.Provider>
  );
}

/**
 * Hook to use analysis context
 */
export function useAnalysis() {
  const context = useContext(AnalysisContext);
  
  if (!context) {
    throw new Error('useAnalysis must be used within AnalysisProvider');
  }
  
  return context;
}

/**
 * ClearClause Constants
 * 
 * Shared constants for category colors, labels, and configuration.
 */
import React from 'react';
import {
  AlertOctagon, AlertTriangle, DollarSign, ShieldAlert, CheckCircle2,
  Info, Home, Briefcase, Stethoscope, Smartphone, Handshake, PieChart, FileText
} from 'lucide-react';

/**
 * Category definitions with colors and labels
 */
export const CATEGORIES = {
  RIGHTS_GIVEN_UP: {
    key: 'rights_given_up',
    label: 'Rights Given Up',
    color: '#ef4444',
    colorRgb: { r: 239, g: 68, b: 68 },
    icon: <AlertOctagon size={16} />,
    bgLight: 'rgba(239, 68, 68, 0.1)',
    bgDark: 'rgba(239, 68, 68, 0.2)',
  },
  ONE_SIDED: {
    key: 'one_sided',
    label: 'One-Sided',
    color: '#f97316',
    colorRgb: { r: 249, g: 115, b: 22 },
    icon: <AlertTriangle size={16} />,
    bgLight: 'rgba(249, 115, 22, 0.1)',
    bgDark: 'rgba(249, 115, 22, 0.2)',
  },
  FINANCIAL_IMPACT: {
    key: 'financial_impact',
    label: 'Financial Impact',
    color: '#eab308',
    colorRgb: { r: 234, g: 179, b: 8 },
    icon: <DollarSign size={16} />,
    bgLight: 'rgba(234, 179, 8, 0.1)',
    bgDark: 'rgba(234, 179, 8, 0.2)',
  },
  MISSING_PROTECTION: {
    key: 'missing_protection',
    label: 'Missing Protection',
    color: '#3b82f6',
    colorRgb: { r: 59, g: 130, b: 246 },
    icon: <ShieldAlert size={16} />,
    bgLight: 'rgba(59, 130, 246, 0.1)',
    bgDark: 'rgba(59, 130, 246, 0.2)',
  },
  STANDARD: {
    key: 'standard',
    label: 'Standard',
    color: '#22c55e',
    colorRgb: { r: 34, g: 197, b: 94 },
    icon: <CheckCircle2 size={16} />,
    bgLight: 'rgba(34, 197, 94, 0.1)',
    bgDark: 'rgba(34, 197, 94, 0.2)',
  },
};

/**
 * Severity definitions
 */
export const SEVERITIES = {
  CRITICAL: {
    key: 'critical',
    label: 'Critical',
    color: '#dc2626',
    icon: <AlertOctagon size={16} />,
  },
  WARNING: {
    key: 'warning',
    label: 'Warning',
    color: '#f59e0b',
    icon: <AlertTriangle size={16} />,
  },
  INFO: {
    key: 'info',
    label: 'Info',
    color: '#3b82f6',
    icon: <Info size={16} />,
  },
  SAFE: {
    key: 'safe',
    label: 'Safe',
    color: '#22c55e',
    icon: <CheckCircle2 size={16} />,
  },
};

/**
 * Document types
 */
export const DOCUMENT_TYPES = {
  LEASE: { key: 'lease', label: 'Lease Agreement', icon: <Home size={16} /> },
  EMPLOYMENT: { key: 'employment', label: 'Employment Contract', icon: <Briefcase size={16} /> },
  INSURANCE: { key: 'insurance', label: 'Insurance Policy', icon: <Stethoscope size={16} /> },
  TOS: { key: 'tos', label: 'Terms of Service', icon: <Smartphone size={16} /> },
  NDA: { key: 'nda', label: 'NDA', icon: <Handshake size={16} /> },
  MEDICAL: { key: 'medical', label: 'Medical Agreement', icon: <Stethoscope size={16} /> },
  FINANCIAL: { key: 'financial', label: 'Financial Agreement', icon: <PieChart size={16} /> },
  OTHER: { key: 'other', label: 'Other', icon: <FileText size={16} /> },
};

/**
 * Get category by key
 */
export function getCategoryByKey(key) {
  return Object.values(CATEGORIES).find(cat => cat.key === key);
}

/**
 * Get severity by key
 */
export function getSeverityByKey(key) {
  return Object.values(SEVERITIES).find(sev => sev.key === key);
}

/**
 * Get document type by key
 */
export function getDocumentTypeByKey(key) {
  return Object.values(DOCUMENT_TYPES).find(type => type.key === key);
}

/**
 * Category order for sorting/display
 */
export const CATEGORY_ORDER = [
  CATEGORIES.RIGHTS_GIVEN_UP,
  CATEGORIES.ONE_SIDED,
  CATEGORIES.FINANCIAL_IMPACT,
  CATEGORIES.MISSING_PROTECTION,
  CATEGORIES.STANDARD,
];

/**
 * Severity order for sorting (most severe first)
 */
export const SEVERITY_ORDER = [
  SEVERITIES.CRITICAL,
  SEVERITIES.WARNING,
  SEVERITIES.INFO,
  SEVERITIES.SAFE,
];

/**
 * Configuration constants
 */
export const CONFIG = {
  MAX_FILE_SIZE_MB: 50,
  SESSION_TTL_MINUTES: 30,
  API_BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
};

/**
 * Sample documents for demo
 */
export const SAMPLE_DOCUMENTS = [
  { name: 'Airbnb ToS', type: 'tos', icon: <Smartphone size={16} /> },
  { name: 'Sample Lease', type: 'lease', icon: <Home size={16} /> },
  { name: 'NDA Template', type: 'nda', icon: <Handshake size={16} /> },
];

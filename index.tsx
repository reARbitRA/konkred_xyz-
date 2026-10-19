
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { ToastProvider } from './contexts/ToastContext.tsx';
import { ModalProvider } from './contexts/ModalContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './styles/globals.css';

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found.');
}

const root = createRoot(container);
root.render(
    <React.StrictMode>
        <ErrorBoundary>
            <ToastProvider>
                <AuthProvider>
                    <ModalProvider>
                        <App />
                        <Analytics />
                    </ModalProvider>
                </AuthProvider>
            </ToastProvider>
        </ErrorBoundary>
    </React.StrictMode>
);

console.log('🚀 KONKRED AI Hub re-initialized with full context layers');

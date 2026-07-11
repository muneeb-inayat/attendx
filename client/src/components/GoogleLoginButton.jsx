import { useEffect, useRef, useState, useCallback } from 'react';
import './GoogleLoginButton.css';

const GoogleLoginButton = ({
    onSuccess,
    onError,
    text = 'signin_with'
}) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const buttonId = useRef(`gsi-${Math.random().toString(36).substr(2, 9)}`);
    const renderedRef = useRef(false);

    const handleGoogleResponse = useCallback((response) => {
        if (response.credential) {
            onSuccess?.(response.credential);
        } else {
            onError?.('No credential received from Google');
        }
    }, [onSuccess, onError]);

    useEffect(() => {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        if (!clientId || clientId === 'your_google_client_id_here') {
            setLoadError(true);
            return;
        }

        // Prevent double render in StrictMode
        if (renderedRef.current) return;

        const initializeGoogle = () => {
            const container = document.getElementById(buttonId.current);
            if (!container || renderedRef.current) return;

            try {
                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: handleGoogleResponse,
                    auto_select: false,
                    cancel_on_tap_outside: true,
                    ux_mode: 'popup'
                });

                // Clear container before rendering
                container.innerHTML = '';

                window.google.accounts.id.renderButton(container, {
                    theme: 'filled_blue',
                    size: 'large',
                    width: 280,
                    text: text,
                    shape: 'pill',
                    logo_alignment: 'left'
                });

                renderedRef.current = true;
                setIsLoaded(true);
            } catch (error) {
                console.error('Google init error:', error);
                setLoadError(true);
            }
        };

        // Load Google script
        if (window.google?.accounts?.id) {
            setTimeout(initializeGoogle, 50);
        } else {
            let script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
            if (!script) {
                script = document.createElement('script');
                script.src = 'https://accounts.google.com/gsi/client';
                script.async = true;
                script.defer = true;
                document.head.appendChild(script);
            }
            script.onload = () => setTimeout(initializeGoogle, 50);
            script.onerror = () => setLoadError(true);
        }
    }, [handleGoogleResponse, text]);

    if (loadError) {
        return (
            <div className="google-login-wrapper">
                <div className="google-button-error">
                    ⚠️ Google Sign-In Unavailable
                </div>
            </div>
        );
    }

    return (
        <div className="google-login-wrapper">
            {!isLoaded && (
                <div className="google-button-loading">
                    <div className="google-spinner"></div>
                    <span>Loading...</span>
                </div>
            )}
            <div
                id={buttonId.current}
                style={{
                    display: isLoaded ? 'flex' : 'none',
                    justifyContent: 'center'
                }}
            />
        </div>
    );
};

export default GoogleLoginButton;

import { useState, useEffect } from 'react';
import './InstallPrompt.css';

const InstallPrompt = () => {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        // Check if already installed (standalone mode)
        if (window.matchMedia('(display-mode: standalone)').matches) {
            return; // Already installed as PWA
        }

        // Check if dismissed recently (within 3 days)
        const dismissed = localStorage.getItem('pwa-install-dismissed');
        if (dismissed && Date.now() - parseInt(dismissed) < 3 * 24 * 60 * 60 * 1000) {
            return;
        }

        // Detect iOS
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        setIsIOS(isIOSDevice);

        if (isIOSDevice) {
            // iOS doesn't support beforeinstallprompt, show manual instructions
            setTimeout(() => setShowPrompt(true), 2000);
            return;
        }

        // Listen for beforeinstallprompt event
        const handler = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setTimeout(() => setShowPrompt(true), 2000); // Show after 2 seconds
        };

        window.addEventListener('beforeinstallprompt', handler);

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            // PWA installed successfully
        }
        setDeferredPrompt(null);
        setShowPrompt(false);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    };

    if (!showPrompt) return null;

    return (
        <div className="install-prompt">
            <div className="install-prompt-content">
                <div className="install-icon">📱</div>
                <div className="install-text">
                    <h4>Install AttendX</h4>
                    {isIOS ? (
                        <p>
                            Tap <span className="share-icon">⎙</span> then <strong>"Add to Home Screen"</strong>
                        </p>
                    ) : (
                        <p>Add to home screen for quick access</p>
                    )}
                </div>
                <div className="install-actions">
                    {!isIOS && (
                        <button className="btn-install" onClick={handleInstall}>
                            Install
                        </button>
                    )}
                    <button className="btn-dismiss" onClick={handleDismiss}>
                        {isIOS ? 'Got it' : 'Later'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InstallPrompt;

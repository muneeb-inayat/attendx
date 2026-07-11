/**
 * Device Fingerprinting Utility
 * Generates a unique device fingerprint for security binding
 * 
 * This fingerprint helps prevent:
 * - Same device marking attendance for multiple students
 * - Device sharing abuse
 */

/**
 * Collect browser and device characteristics
 * @returns {object} Fingerprint components
 */
export const collectFingerprintComponents = () => {
    const components = {
        // User Agent
        userAgent: navigator.userAgent || '',

        // Screen properties
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        screenColorDepth: window.screen.colorDepth?.toString() || '',
        screenPixelRatio: window.devicePixelRatio?.toString() || '1',

        // Platform info
        platform: navigator.platform || '',
        language: navigator.language || navigator.userLanguage || '',
        languages: navigator.languages?.join(',') || '',

        // Timezone
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        timezoneOffset: new Date().getTimezoneOffset().toString(),

        // Hardware
        hardwareConcurrency: navigator.hardwareConcurrency?.toString() || '',
        deviceMemory: navigator.deviceMemory?.toString() || '',

        // Touch support
        touchSupport: (
            'ontouchstart' in window ||
            navigator.maxTouchPoints > 0
        ).toString(),
        maxTouchPoints: navigator.maxTouchPoints?.toString() || '0',

        // Canvas fingerprint (simplified)
        canvasFingerprint: getCanvasFingerprint(),

        // WebGL info
        webglVendor: getWebGLInfo().vendor,
        webglRenderer: getWebGLInfo().renderer,

        // Storage available
        localStorage: (typeof localStorage !== 'undefined').toString(),
        sessionStorage: (typeof sessionStorage !== 'undefined').toString(),

        // Do Not Track
        doNotTrack: navigator.doNotTrack || '',

        // Cookies enabled
        cookieEnabled: navigator.cookieEnabled?.toString() || ''
    };

    return components;
};

/**
 * Generate canvas fingerprint
 * @returns {string} Canvas hash
 */
const getCanvasFingerprint = () => {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) return '';

        // Draw some text
        canvas.width = 200;
        canvas.height = 50;
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 200, 50);
        ctx.fillStyle = '#069';
        ctx.fillText('AttendX🔐', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('Device FP', 4, 17);

        // Get data URL and hash it
        const dataUrl = canvas.toDataURL();
        return hashString(dataUrl);
    } catch (e) {
        return '';
    }
};

/**
 * Get WebGL vendor and renderer
 * @returns {object} { vendor, renderer }
 */
const getWebGLInfo = () => {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

        if (!gl) return { vendor: '', renderer: '' };

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) return { vendor: '', renderer: '' };

        return {
            vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '',
            renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''
        };
    } catch (e) {
        return { vendor: '', renderer: '' };
    }
};

/**
 * Simple hash function for strings
 * @param {string} str 
 * @returns {string} Hash
 */
const hashString = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
};

/**
 * Generate a deterministic fingerprint from components
 * @param {object} components 
 * @returns {string} Fingerprint string
 */
const generateFingerprintFromComponents = (components) => {
    const values = Object.values(components).join('|');

    // Use a simple hash
    let hash = 5381;
    for (let i = 0; i < values.length; i++) {
        hash = ((hash << 5) + hash) + values.charCodeAt(i);
    }

    return Math.abs(hash).toString(36);
};

/**
 * Get or create a persistent device ID
 * (Fallback for when fingerprint changes)
 * @returns {string}
 */
const getPersistentDeviceId = () => {
    const key = 'cc_device_id_v2';
    let id = localStorage.getItem(key);

    if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() :
            'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        localStorage.setItem(key, id);
    }

    return id;
};

/**
 * Generate complete device fingerprint
 * Combines hardware fingerprint with persistent ID
 * @returns {object} { fingerprint, components }
 */
export const generateDeviceFingerprint = () => {
    const components = collectFingerprintComponents();
    const hardwareFingerprint = generateFingerprintFromComponents(components);
    const persistentId = getPersistentDeviceId();

    // Combine hardware fingerprint with persistent ID
    // This provides stability (persistent ID) with uniqueness (hardware fp)
    const combinedFingerprint = `${hardwareFingerprint}-${persistentId.split('-')[0]}`;

    return {
        fingerprint: combinedFingerprint,
        components: components
    };
};

/**
 * Get simple fingerprint string (for backward compatibility)
 * @returns {string}
 */
export const getDeviceFingerprint = () => {
    const { fingerprint } = generateDeviceFingerprint();
    return fingerprint;
};

/**
 * Detect device type
 * @returns {string} 'mobile' | 'tablet' | 'desktop'
 */
export const detectDeviceType = () => {
    const ua = navigator.userAgent.toLowerCase();

    if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/i.test(ua)) {
        return 'mobile';
    }

    if (/tablet|ipad|playbook|silk/i.test(ua)) {
        return 'tablet';
    }

    return 'desktop';
};

/**
 * Get browser name
 * @returns {string}
 */
export const getBrowserName = () => {
    const ua = navigator.userAgent;

    if (ua.indexOf('Chrome') > -1 && ua.indexOf('Edg') === -1) return 'Chrome';
    if (ua.indexOf('Safari') > -1 && ua.indexOf('Chrome') === -1) return 'Safari';
    if (ua.indexOf('Firefox') > -1) return 'Firefox';
    if (ua.indexOf('Edg') > -1) return 'Edge';
    if (ua.indexOf('MSIE') > -1 || ua.indexOf('Trident') > -1) return 'IE';

    return 'Unknown';
};

/**
 * Get OS name
 * @returns {string}
 */
export const getOSName = () => {
    const ua = navigator.userAgent;

    if (ua.indexOf('Android') > -1) return 'Android';
    if (ua.indexOf('iPhone') > -1 || ua.indexOf('iPad') > -1) return 'iOS';
    if (ua.indexOf('Windows') > -1) return 'Windows';
    if (ua.indexOf('Mac') > -1) return 'macOS';
    if (ua.indexOf('Linux') > -1) return 'Linux';

    return 'Unknown';
};

export default {
    generateDeviceFingerprint,
    getDeviceFingerprint,
    collectFingerprintComponents,
    detectDeviceType,
    getBrowserName,
    getOSName
};

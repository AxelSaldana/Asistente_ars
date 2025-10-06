/**
 * Configuración del Asistente Virtual AR
 */
export const CONFIG = {
    // Configuración del modelo 3D
    MODEL: {
        PATH: './assets/models',
        FILE_NAME: 'avatar_prueba.glb', // Cambia por tu archivo GLB
        SCALE: 0.35,
        ANIMATIONS: {
            IDLE: 'idle',
            TALKING: 'talking',
            THINKING: 'thinking', 
            LISTENING: 'listening'
        }
    },

    // Configuración de Gemini IA
    GEMINI: {
        API_KEY: 'AIzaSyCo0VMAPnglts8T0e1Ap8x7MbtdhgsFrq4', // REEMPLAZAR CON TU API KEY
        MODEL: 'gemini-1.5-flash',
        MAX_TOKENS: 1000,
        TEMPERATURE: 0.7
    },

    // Configuración de Speech
    SPEECH: {
        LANGUAGE: 'es-ES',
        VOICE_RATE: 0.85,
        VOICE_PITCH: 0.8,
        VOICE_VOLUME: 1.0,
        RECOGNITION_TIMEOUT: 8000
    },

    // Mensajes del sistema
    MESSAGES: {
        LOADING: '🤔 Pensando...',
        SUCCESS: '✅ Listo',
        ERROR: '❌ Error',
        WELCOME: '¡Hola! Soy tu asistente virtual. ¿En qué puedo ayudarte?',
        AR_WELCOME: 'Bienvenido al modo AR. Puedes hacer preguntas escribiendo o usando comandos de voz.',
        NO_SPEECH: 'No se detectó voz. Inténtalo de nuevo.',
        SPEECH_ERROR: 'Error con el micrófono. Verifica los permisos.'
    }
};

// EXPORTS ADICIONALES (para compatibilidad)
export const MODEL_CONFIG = CONFIG.MODEL;
export const GEMINI_CONFIG = CONFIG.GEMINI;
export const SPEECH_CONFIG = CONFIG.SPEECH;
export const MESSAGES = CONFIG.MESSAGES;

// DEBUG CONFIG (que necesitan los otros archivos)
export const DEBUG_CONFIG = {
    ENABLED: true,
    LOG_LEVEL: 'info'
};

export const BABYLON_CONFIG = {
    ANTIALIAS: true,
    STENCIL: true
};

export const WEBXR_CONFIG = {
    SESSION_MODE: 'immersive-ar',
    REFERENCE_SPACE: 'local-floor',
    OPTIONAL_FEATURES: ['hit-test', 'dom-overlay']
};

export const UI_CONFIG = {
    THEME: 'default'
};

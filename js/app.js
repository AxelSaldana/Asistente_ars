/**
 * Asistente Virtual AR - SIMPLE Y DIRECTO
 * Modelo: models/avatar_prueba.glb
 */
// ===== CONFIGURACIÓN SIMPLE =====
const CONFIG = {
    MODEL: {
        PATH: 'models/avatar_prueba.glb', // ← RUTA DIRECTA
        SCALE: 1,
        AUTO_ROTATE: false,
        ROTATE_SPEED: 0.005,
        ANIMATION_SPEED: 3, // velocidad 20% más rápida
        ANIMATIONS: {
            IDLE: 'Animation',
            TALKING: 'animation',
            THINKING: 'animation',
            LISTENING: 'animation'
        }
    },
    GEMINI: {
        API_KEY: 'AIzaSyBMJS5ER99gH_kPswjUzu6GrlhrAdhC940',
        MODEL: 'gemini-2.5-flash',
        MAX_TOKENS: 2000,
        TEMPERATURE: 0.9
    },
    SPEECH: {
        LANGUAGE: 'es-ES',
        VOICE_RATE: 1.0,
        VOICE_PITCH: 1.0,
        VOICE_VOLUME: 1.0,
        RECOGNITION_TIMEOUT: 15000
    },
    AR: {
        // Si es true, saltar WebXR y usar cámara HTML + tap-to-place siempre
        FORCE_FALLBACK: false
    }
};

// ===== GEMINI CLIENT =====
class GeminiClient {
    constructor() {
        this.apiKey = CONFIG.GEMINI.API_KEY;
        this.model = CONFIG.GEMINI.MODEL;
        this.baseURL = 'https://generativelanguage.googleapis.com/v1beta/models';
        this.isInitialized = false;
        this.conversationHistory = [];
    }

    async init() {
        try {
            console.log('Conectando con Gemini 2.0...');

            const testResult = await this.testConnection();
            if (testResult) {
                this.isInitialized = true;
                console.log('Gemini 2.0 conectado correctamente');
                return true;
            } else {
                throw new Error('No se pudo conectar con Gemini 2.0');
            }

        } catch (error) {
            console.error('❌ ERROR GEMINI 2.0:', error);
            throw new Error('Gemini 2.0 no disponible: ' + error.message);
        }
    }

    async testConnection() {
        try {
            console.log('🔍 Probando conexión con API Key:', this.apiKey.substring(0, 10) + '...');
            const response = await this.sendDirectToGemini("Test");
            console.log('✅ Test exitoso, respuesta:', response);
            return response.length > 0;
        } catch (error) {
            console.error('❌ Test de conexión falló:', error);
            console.error('📋 Detalles del error:', error.message);

            // Si es rate limiting, aún consideramos la conexión como válida
            if (error.message.includes('429')) {
                console.warn('⚠️ Rate limit alcanzado, pero API Key es válida');
                return true; // API Key funciona, solo hay límite de cuota
            }

            return false;
        }
    }

    async sendDirectToGemini(message) {
        const url = `${this.baseURL}/${this.model}:generateContent?key=${this.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: message }] }],
                generationConfig: {
                    temperature: CONFIG.GEMINI.TEMPERATURE,
                    maxOutputTokens: CONFIG.GEMINI.MAX_TOKENS
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();

            // Manejo específico para rate limiting
            if (response.status === 429) {
                console.warn('⚠️ Cuota de Gemini excedida. Usando respuesta de fallback.');
                return 'Lo siento, he alcanzado mi límite de consultas por hoy. Por favor, intenta más tarde o considera actualizar tu plan de Gemini API.';
            }

            throw new Error(`Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (data.candidates && data.candidates.length > 0) {
            const content = data.candidates[0].content;
            if (content && content.parts && content.parts.length > 0) {
                return content.parts[0].text.trim();
            }
        }

        throw new Error('Respuesta inválida');
    }

    async sendMessage(message) {
        if (!this.isInitialized) {
            throw new Error('Gemini 2.0 no conectado');
        }

        try {
            const prompt = `Eres Avatar, un asistente virtual inteligente con IA Gemini 2.0.
Respondes en español de forma natural y conversacional.
Eres amigable, útil y entusiasta.
No uses emojis en tus respuestas.

Usuario: ${message}
Avatar:`;

            const response = await this.sendDirectToGemini(prompt);

            this.addToHistory('user', message);
            this.addToHistory('assistant', response);

            return response;

        } catch (error) {
            throw error;
        }
    }

    addToHistory(role, content) {
        this.conversationHistory.push({ role, content, timestamp: Date.now() });
        if (this.conversationHistory.length > 10) {
            this.conversationHistory = this.conversationHistory.slice(-10);
        }
    }

    async getWelcomeMessage() {
        try {
            return await this.sendDirectToGemini('Saluda al usuario como Avatar, un asistente virtual con IA Gemini 2.0. Sé amigable y entusiasta, máximo 2 frases. No uses emojis.');
        } catch (error) {
            throw new Error('No se pudo obtener mensaje de bienvenida');
        }
    }

    async getARWelcomeMessage() {
        try {
            return await this.sendDirectToGemini('El usuario activó el modo AR. Salúdalo con entusiasmo sobre la experiencia AR con Gemini 2.0. Máximo 2 frases. No uses emojis.');
        } catch (error) {
            throw new Error('No se pudo obtener mensaje AR');
        }
    }
}

// ===== SPEECH MANAGER =====
class SpeechManager {
    constructor() {
        this.recognition = null;
        this.synthesis = (typeof window !== 'undefined' && 'speechSynthesis' in window) ? window.speechSynthesis : null;
        this.isListening = false;
        this.isSpeaking = false;
        this.voices = [];
        this.selectedVoice = null;
        this.isInitialized = false;
        this.unsupportedReason = '';
        this.lastError = '';
        // Detección de iOS/Safari mejorada
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        this.isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        this.isIOSSafari = this.isIOS && this.isSafari;

        // Detección específica de iPhone 16 (problema de micrófono)
        this.isiPhone16 = /iPhone16/.test(navigator.userAgent) || (this.isIOS && navigator.userAgent.includes('16_'));
        this.isiPhone17Pro = /iPhone17/.test(navigator.userAgent) || (this.isIOS && navigator.userAgent.includes('17_'));

        // Fallback para iOS
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        // Estado específico para iOS TTS
        this.iosTTSActivated = false;
        this.iosTTSReady = false;
        this.pendingSpeech = null;
    }

    async init() {
        try {
            console.log('🎤 Inicializando Speech Manager...');
            console.log('📱 Dispositivo detectado:', {
                isIOS: this.isIOS,
                isSafari: this.isSafari,
                isIOSSafari: this.isIOSSafari,
                isiPhone16: this.isiPhone16,
                isiPhone17Pro: this.isiPhone17Pro,
                isSecureContext: window.isSecureContext,
                protocol: window.location.protocol,
                userAgent: navigator.userAgent
            });

            // Verificar contexto seguro para iOS
            if (this.isIOSSafari && !window.isSecureContext) {
                this.unsupportedReason = 'iOS Safari requiere HTTPS para funciones de voz. Usa una conexión segura.';
                return false;
            }

            // Verificar soporte de Speech Recognition
            const hasSpeechRecognition = ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);

            if (!hasSpeechRecognition) {
                if (this.isIOSSafari) {
                    console.warn('🍎 Safari en iOS no soporta Web Speech API, usando fallback con MediaRecorder');
                    return await this.initIOSFallback();
                } else {
                    this.unsupportedReason = 'Este navegador no soporta reconocimiento de voz. Usa Chrome/Edge en escritorio.';
                    return false;
                }
            }

            // Solicitar permiso de micrófono explícito con timeout para iOS
            try {
                console.log('🎤 Solicitando permisos de micrófono...');

                // Configuración específica para iPhone 16 y 17 Pro (problemas de micrófono)
                let constraints;
                if (this.isiPhone16 || this.isiPhone17Pro) {
                    console.log(`📱 Configuración específica para ${this.isiPhone16 ? 'iPhone 16' : 'iPhone 17 Pro'}...`);
                    constraints = {
                        audio: {
                            echoCancellation: false, // Desactivar para iPhone 16/17 Pro
                            noiseSuppression: false, // Desactivar para iPhone 16/17 Pro
                            autoGainControl: true,
                            sampleRate: { ideal: 44100 }, // Frecuencia más alta
                            channelCount: { ideal: 1 }
                        }
                    };
                } else if (this.isIOSSafari) {
                    constraints = {
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                            sampleRate: { ideal: 16000 },
                            channelCount: { ideal: 1 }
                        }
                    };
                } else {
                    constraints = { audio: true };
                }

                const permissionTimeout = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Timeout solicitando permisos')), 10000);
                });

                const stream = await Promise.race([
                    navigator.mediaDevices.getUserMedia(constraints),
                    permissionTimeout
                ]);

                console.log('✅ Permisos de micrófono concedidos');
                stream.getTracks().forEach(track => track.stop());
            } catch (e) {
                console.warn('⚠️ Error al solicitar permisos:', e?.name || e?.message || e);
                if (this.isIOSSafari) {
                    if (e?.name === 'NotAllowedError') {
                        this.unsupportedReason = 'Acceso al micrófono denegado. En iOS Safari, toca "Permitir" cuando se solicite acceso.';
                    } else if (e?.name === 'NotFoundError') {
                        this.unsupportedReason = 'No se encontró micrófono. Verifica que tu dispositivo tenga micrófono disponible.';
                    } else if (e?.message?.includes('Timeout')) {
                        this.unsupportedReason = 'Timeout solicitando permisos. Intenta nuevamente y permite el acceso rápidamente.';
                    } else {
                        this.unsupportedReason = 'Error de micrófono en iOS Safari. Verifica permisos en Configuración > Safari > Micrófono.';
                    }
                } else {
                    this.unsupportedReason = 'Acceso al micrófono denegado. Permite el acceso en la configuración del navegador.';
                }
                return false;
            }

            console.log('🔧 Configurando Speech Recognition...');
            this.setupSpeechRecognition();

            console.log('🔧 Configurando Speech Synthesis...');
            try {
                await this.setupSpeechSynthesis();
                console.log('🔧 Speech Synthesis configurado');

                // Configuración específica para iOS TTS
                if (this.isIOSSafari) {
                    console.log('🍎 Configurando TTS específico para iOS Safari...');
                    await this.setupIOSSpeechSynthesis();
                }
            } catch (synthError) {
                console.warn('⚠️ Error en Speech Synthesis, continuando sin TTS:', synthError);
                // Continuar sin síntesis de voz
            }

            this.isInitialized = true;
            console.log('✅ Speech Manager inicializado correctamente');
            return true;
        } catch (error) {
            console.error('❌ Error inicializando Speech Manager:', error);
            this.unsupportedReason = 'No se pudo inicializar la voz: ' + (error?.message || 'desconocido');
            return false;
        }
    }

    async initIOSFallback() {
        try {
            console.log('Configurando fallback para iOS Safari...');

            // Verificar contexto seguro
            if (!window.isSecureContext) {
                this.unsupportedReason = 'iOS Safari requiere HTTPS para acceso al micrófono.';
                return false;
            }

            // Verificar MediaRecorder support
            if (!('MediaRecorder' in window)) {
                this.unsupportedReason = 'Tu dispositivo iOS no soporta grabación de audio web.';
                return false;
            }

            // Solicitar permisos específicos para iOS con timeout
            let constraints;
            if (this.isiPhone16 || this.isiPhone17Pro) {
                console.log(`📱 Fallback específico para ${this.isiPhone16 ? 'iPhone 16' : 'iPhone 17 Pro'}...`);
                constraints = {
                    audio: {
                        echoCancellation: false, // Desactivar para iPhone 16/17 Pro
                        noiseSuppression: false, // Desactivar para iPhone 16/17 Pro
                        autoGainControl: true,
                        sampleRate: { ideal: 44100 }, // Frecuencia más alta
                        channelCount: { ideal: 1 }
                    }
                };
            } else {
                constraints = {
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: { ideal: 16000 },
                        channelCount: { ideal: 1 }
                    }
                };
            }

            const permissionTimeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout solicitando permisos')), 10000);
            });

            const stream = await Promise.race([
                navigator.mediaDevices.getUserMedia(constraints),
                permissionTimeout
            ]);

            this.stream = stream;
            console.log('✅ Permisos de audio concedidos en iOS');

            // Configurar MediaRecorder con detección de formato
            const supportedTypes = ['audio/mp4', 'audio/webm', 'audio/wav', 'audio/ogg'];
            let options = {};

            for (const type of supportedTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    options.mimeType = type;
                    console.log('🎧 Formato de audio seleccionado:', type);
                    break;
                }
            }

            this.mediaRecorder = new MediaRecorder(stream, options);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            await this.setupSpeechSynthesis();

            // Configuración específica para iOS TTS
            console.log('🍎 Configurando TTS específico para iOS Safari...');
            await this.setupIOSSpeechSynthesis();

            this.isInitialized = true;
            console.log('Fallback iOS configurado correctamente');
            return true;

        } catch (error) {
            console.error('❌ Error configurando fallback iOS:', error);
            if (error?.name === 'NotAllowedError') {
                this.unsupportedReason = 'Acceso al micrófono denegado. En iOS Safari, toca "Permitir" cuando se solicite.';
            } else if (error?.name === 'NotFoundError') {
                this.unsupportedReason = 'No se encontró micrófono en tu dispositivo iOS.';
            } else if (error?.message?.includes('Timeout')) {
                this.unsupportedReason = 'Timeout solicitando permisos. Intenta nuevamente y permite el acceso rápidamente.';
            } else {
                this.unsupportedReason = 'Error de micrófono en iOS Safari. Verifica permisos en Configuración > Safari.';
            }
            return false;
        }
    }

    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        this.recognition = new SpeechRecognition();

        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = CONFIG.SPEECH.LANGUAGE;
        this.recognition.maxAlternatives = 1;

        this.recognition.onstart = () => {
            this.isListening = true;
            console.log('🎤 Reconocimiento iniciado');
        };
        this.recognition.onend = () => {
            this.isListening = false;
            console.log('🎤 Reconocimiento terminado');
        };
        this.recognition.onerror = (e) => {
            this.isListening = false;
            this.lastError = e && e.error ? e.error : 'unknown_error';
            console.warn('🎤 SpeechRecognition error:', this.lastError);
        };
    }

    async setupSpeechSynthesis() {
        if (!this.synthesis) {
            console.log('🔇 Speech synthesis no disponible');
            return;
        }

        return new Promise((resolve) => {
            let resolved = false;

            const loadVoices = () => {
                if (resolved) return;
                resolved = true;

                this.voices = this.synthesis.getVoices();
                console.log('🎵 Voces disponibles:', this.voices.length);

                const spanishVoice = this.voices.find(voice =>
                    voice.lang.startsWith('es') || voice.lang.includes('ES')
                );
                if (spanishVoice) {
                    this.selectedVoice = spanishVoice;
                    console.log('🗣️ Voz en español seleccionada:', spanishVoice.name);
                } else {
                    console.log('🔤 Usando voz por defecto');
                }
                resolve();
            };

            // Timeout para evitar que se cuelgue
            const timeout = setTimeout(() => {
                if (!resolved) {
                    console.log('⏰ Timeout en carga de voces, continuando...');
                    resolved = true;
                    resolve();
                }
            }, 2000);

            // Intentar cargar voces
            try {
                this.voices = this.synthesis.getVoices();
                if (this.voices.length > 0) {
                    clearTimeout(timeout);
                    loadVoices();
                } else {
                    this.synthesis.onvoiceschanged = () => {
                        clearTimeout(timeout);
                        loadVoices();
                    };
                }
            } catch (error) {
                console.warn('⚠️ Error configurando síntesis:', error);
                clearTimeout(timeout);
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            }
        });
    }

    async setupIOSSpeechSynthesis() {
        if (!this.synthesis) {
            console.log('🔇 Speech synthesis no disponible en iOS');
            return;
        }

        return new Promise((resolve) => {
            console.log('🍎 Configurando TTS para iOS Safari...');

            // En iOS, necesitamos "activar" la síntesis con una interacción del usuario
            this.iosTTSReady = false;
            this.iosTTSActivated = false;

            const activateIOSTTS = () => {
                if (this.iosTTSActivated) return;

                try {
                    console.log('🍎📱 Activando TTS en iOS Safari (iPhone 14+)...');
                    console.log('🔍 Estado actual:', {
                        synthesis: !!this.synthesis,
                        speaking: this.synthesis?.speaking,
                        pending: this.synthesis?.pending,
                        paused: this.synthesis?.paused,
                        voices: this.synthesis?.getVoices()?.length || 0
                    });

                    // Limpiar cualquier síntesis pendiente
                    if (this.synthesis.speaking || this.synthesis.pending) {
                        this.synthesis.cancel();
                    }

                    // Crear una utterance silenciosa para "activar" el TTS
                    // En iPhone 14+ necesitamos un texto muy corto pero audible
                    const silentUtterance = new SpeechSynthesisUtterance('.');
                    silentUtterance.volume = 0.01; // Muy bajo pero no 0
                    silentUtterance.rate = 10; // Muy rápido
                    silentUtterance.pitch = 0.1;

                    let activationTimeout = setTimeout(() => {
                        console.warn('⏰ Timeout activando TTS, marcando como activado de todos modos');
                        this.iosTTSActivated = true;
                        this.iosTTSReady = true;

                        // Ocultar indicador de iOS TTS
                        if (window.app && window.app.hideIOSTTSNotice) {
                            window.app.hideIOSTTSNotice();
                        }

                        if (this.pendingSpeech) {
                            console.log('🗣️ Ejecutando síntesis pendiente (timeout):', this.pendingSpeech.substring(0, 50) + '...');
                            setTimeout(() => this.speak(this.pendingSpeech), 100);
                            this.pendingSpeech = null;
                        }
                    }, 3000);

                    silentUtterance.onstart = () => {
                        clearTimeout(activationTimeout);
                        console.log('✅🍎 TTS activado exitosamente en iOS Safari');
                        this.iosTTSActivated = true;
                        this.iosTTSReady = true;

                        // Ocultar indicador de iOS TTS
                        if (window.app && window.app.hideIOSTTSNotice) {
                            window.app.hideIOSTTSNotice();
                        }

                        // Si hay una síntesis pendiente, ejecutarla ahora
                        if (this.pendingSpeech) {
                            console.log('🗣️ Ejecutando síntesis pendiente:', this.pendingSpeech.substring(0, 50) + '...');
                            setTimeout(() => this.speak(this.pendingSpeech), 200);
                            this.pendingSpeech = null;
                        }
                    };

                    silentUtterance.onend = () => {
                        clearTimeout(activationTimeout);
                        this.iosTTSReady = true;
                        console.log('🍎 TTS activación completada');
                    };

                    silentUtterance.onerror = (e) => {
                        clearTimeout(activationTimeout);
                        console.warn('⚠️ Error activando TTS en iOS:', e?.error || e);
                        // Marcar como activado de todos modos para intentar funcionar
                        this.iosTTSActivated = true;
                        this.iosTTSReady = true;

                        // Ocultar indicador de iOS TTS
                        if (window.app && window.app.hideIOSTTSNotice) {
                            window.app.hideIOSTTSNotice();
                        }

                        if (this.pendingSpeech) {
                            console.log('🗣️ Intentando síntesis pendiente a pesar del error...');
                            setTimeout(() => this.speak(this.pendingSpeech), 300);
                            this.pendingSpeech = null;
                        }
                    };

                    console.log('🍎 Ejecutando utterance de activación...');
                    this.synthesis.speak(silentUtterance);

                } catch (error) {
                    console.warn('⚠️ Error en activación TTS iOS:', error);
                    // Marcar como activado de todos modos
                    this.iosTTSActivated = true;
                    this.iosTTSReady = true;

                    // Ocultar indicador de iOS TTS
                    if (window.app && window.app.hideIOSTTSNotice) {
                        window.app.hideIOSTTSNotice();
                    }

                    if (this.pendingSpeech) {
                        console.log('🗣️ Intentando síntesis pendiente tras error de activación...');
                        setTimeout(() => this.speak(this.pendingSpeech), 500);
                        this.pendingSpeech = null;
                    }
                }
            };

            // Activar TTS en la primera interacción del usuario
            // Más eventos para iPhone 14+ y iOS recientes
            const userInteractionEvents = [
                'touchstart', 'touchend', 'touchmove',
                'click', 'tap', 'pointerdown', 'pointerup',
                'mousedown', 'mouseup', 'keydown', 'keyup'
            ];

            let interactionDetected = false;

            const onFirstInteraction = (event) => {
                if (interactionDetected || this.iosTTSActivated) return;
                interactionDetected = true;

                console.log('👆 Primera interacción detectada para TTS:', event.type);

                // Pequeña pausa para asegurar que el evento se complete
                setTimeout(() => {
                    if (!this.iosTTSActivated) {
                        activateIOSTTS();
                    }
                }, 50);

                // No remover listeners inmediatamente, intentar varias veces
                setTimeout(() => {
                    userInteractionEvents.forEach(eventType => {
                        document.removeEventListener(eventType, onFirstInteraction, { passive: true });
                    });
                }, 5000);
            };
            userInteractionEvents.forEach(eventType => {
                document.addEventListener(eventType, onFirstInteraction, { passive: true });
            });

            // También intentar activar cuando se toque cualquier botón
            const tryActivateOnButtonClick = (event) => {
                if (this.iosTTSActivated) return;

                const target = event.target;
                if (target && (target.tagName === 'BUTTON' || target.classList.contains('btn') || target.onclick)) {
                    console.log('🔘 Interacción con botón detectada, intentando activar TTS');
                    setTimeout(() => {
                        if (!this.iosTTSActivated) {
                            activateIOSTTS();
                        }
                    }, 100);
                }
            };

            document.addEventListener('click', tryActivateOnButtonClick, { passive: true });
            document.addEventListener('touchend', tryActivateOnButtonClick, { passive: true });

            // ACTIVACIÓN AUTOMÁTICA MÁS AGRESIVA
            // Intentar activar en cualquier interacción con la página
            const autoActivateTTS = (event) => {
                if (this.iosTTSActivated) return;

                console.log('👆 Cualquier interacción detectada, activando TTS automáticamente...');
                setTimeout(() => {
                    if (!this.iosTTSActivated) {
                        activateIOSTTS();
                    }
                }, 50);
            };

            // Escuchar CUALQUIER interacción del usuario
            document.addEventListener('touchstart', autoActivateTTS, { passive: true, once: true });
            document.addEventListener('click', autoActivateTTS, { passive: true, once: true });
            document.addEventListener('keydown', autoActivateTTS, { passive: true, once: true });

            // También intentar después de un delay corto
            setTimeout(() => {
                if (!this.iosTTSActivated) {
                    console.log('⏰ Intentando activación automática después de 2 segundos...');
                    activateIOSTTS();
                }
            }, 2000);

            // Intentar activación más agresiva después de 5 segundos
            setTimeout(() => {
                if (!this.iosTTSActivated) {
                    console.log('🔄 Segundo intento de activación automática...');
                    activateIOSTTS();
                }
            }, 5000);

            console.log('🍎📱 TTS iOS configurado para iPhone 14+. Esperando primera interacción del usuario...');
            console.log('📝 Eventos escuchando:', userInteractionEvents);
            resolve();
        });
    }

    async listen() {
        if (this.isListening) return null;

        // Si estamos en iOS Safari, usar el fallback
        if (this.isIOSSafari && this.mediaRecorder) {
            return await this.listenIOSFallback();
        }

        // Usar Web Speech API en navegadores compatibles
        return new Promise((resolve) => {
            // detener cualquier síntesis en curso
            this.stopSpeaking();

            // Crear una nueva instancia para cada intento (algunos navegadores fallan en reusar)
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                console.warn('🎤 Web Speech API no disponible');
                return resolve(null);
            }

            const rec = new SpeechRecognition();
            this.recognition = rec;

            rec.continuous = false;
            rec.interimResults = false;
            rec.lang = CONFIG.SPEECH.LANGUAGE;
            rec.maxAlternatives = 1;

            this.isListening = true;

            let settled = false;
            const finish = (val) => {
                if (settled) return;
                settled = true;
                try { rec.stop(); } catch (_) { }
                this.isListening = false;
                resolve(val);
            };

            const timeoutMs = Math.max(5000, (CONFIG.SPEECH.RECOGNITION_TIMEOUT || 8000), 12000);
            const timer = setTimeout(() => {
                console.warn('🎤 Timeout de reconocimiento');
                finish(null);
            }, timeoutMs);

            // Diagnóstico útil
            rec.onaudiostart = () => console.log('🎤 onaudiostart');
            rec.onsoundstart = () => console.log('🎤 onsoundstart');
            rec.onspeechstart = () => console.log('🎤 onspeechstart');
            rec.onsoundend = () => console.log('🎤 onsoundend');
            rec.onnomatch = () => console.warn('🎤 onnomatch');

            rec.onresult = (event) => {
                clearTimeout(timer);
                let text = null;
                try {
                    if (event.results && event.results.length > 0) {
                        text = (event.results[0][0]?.transcript || '').trim();
                        console.log('🎤 Texto reconocido:', text);
                    }
                } catch (_) { }
                finish(text && text.length > 0 ? text : null);
            };

            rec.onerror = (e) => {
                clearTimeout(timer);
                console.warn('🎤 recognition.onerror:', e?.error || e);
                finish(null);
            };

            rec.onend = () => {
                clearTimeout(timer);
                if (!settled) {
                    console.log('🎤 Reconocimiento terminado sin resultado');
                    finish(null);
                }
            };

            try {
                console.log('🎤 Iniciando reconocimiento de voz...');
                rec.start();
            } catch (err) {
                console.warn('🎤 Error al iniciar reconocimiento:', err?.message || err);
                clearTimeout(timer);
                finish(null);
            }
        });
    }

    async listenIOSFallback() {
        console.log('Usando transcripción web para iOS...');

        if (!this.mediaRecorder || !this.stream) {
            console.error('❌ MediaRecorder no configurado');
            return null;
        }

        return new Promise((resolve) => {
            this.audioChunks = [];
            this.isListening = true;

            const timeout = setTimeout(() => {
                if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                    this.mediaRecorder.stop();
                }
            }, 4000); // 4 segundos de grabación

            this.mediaRecorder.onstop = async () => {
                clearTimeout(timeout);
                this.isListening = false;

                if (this.audioChunks.length > 0) {
                    try {
                        // Crear blob de audio
                        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                        console.log('🎤 Audio capturado:', audioBlob.size, 'bytes');

                        // Intentar transcripción con Web Speech API si está disponible
                        const transcript = await this.transcribeAudioBlob(audioBlob);

                        if (transcript) {
                            resolve(transcript);
                        } else {
                            // Fallback: mostrar interfaz de entrada manual
                            resolve(await this.showManualInputFallback());
                        }
                    } catch (error) {
                        console.error('❌ Error procesando audio:', error);
                        resolve(await this.showManualInputFallback());
                    }
                } else {
                    resolve(null);
                }
            };

            this.mediaRecorder.onerror = (e) => {
                clearTimeout(timeout);
                this.isListening = false;
                console.error('❌ Error en MediaRecorder:', e);
                resolve(null);
            };

            try {
                this.mediaRecorder.start(100); // Capturar en chunks de 100ms
                console.log('🎤 Grabación iniciada en iOS Safari');
            } catch (err) {
                clearTimeout(timeout);
                this.isListening = false;
                console.error('❌ Error iniciando grabación:', err);
                resolve(null);
            }
        });
    }

    async transcribeAudioBlob(audioBlob) {
        // Intentar usar Web Speech API con el audio grabado (experimental)
        try {
            // Convertir blob a URL para reproducción
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            // Esta es una aproximación - Web Speech API no acepta blobs directamente
            // pero podemos simular el comportamiento
            console.log('🔄 Intentando transcripción experimental...');

            // Por ahora retornamos null para usar el fallback manual
            URL.revokeObjectURL(audioUrl);
            return null;

        } catch (error) {
            console.warn('⚠️ Transcripción experimental falló:', error);
            return null;
        }
    }

    async showManualInputFallback() {
        return new Promise((resolve) => {
            // Crear modal temporal para entrada manual
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            `;

            const content = document.createElement('div');
            content.style.cssText = `
                background: #2a2a2a;
                padding: 20px;
                border-radius: 10px;
                max-width: 90%;
                width: 400px;
                text-align: center;
            `;

            content.innerHTML = `
                <h3 style="color: #fff; margin-bottom: 15px;">🎤 Comando de Voz</h3>
                <p style="color: #ccc; margin-bottom: 15px;">Audio grabado. Escribe lo que dijiste:</p>
                <input type="text" id="voiceInput" placeholder="Escribe tu comando aquí..." 
                       style="width: 100%; padding: 10px; border: none; border-radius: 5px; margin-bottom: 15px; font-size: 16px;">
                <div>
                    <button id="voiceOk" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin-right: 10px; cursor: pointer;">Enviar</button>
                    <button id="voiceCancel" style="background: #f44336; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Cancelar</button>
                </div>
            `;

            modal.appendChild(content);
            document.body.appendChild(modal);

            const input = content.querySelector('#voiceInput');
            const okBtn = content.querySelector('#voiceOk');
            const cancelBtn = content.querySelector('#voiceCancel');

            // Enfocar input
            setTimeout(() => input.focus(), 100);

            const cleanup = () => {
                document.body.removeChild(modal);
            };

            okBtn.onclick = () => {
                const text = input.value.trim();
                cleanup();
                resolve(text || null);
            };

            cancelBtn.onclick = () => {
                cleanup();
                resolve(null);
            };

            input.onkeypress = (e) => {
                if (e.key === 'Enter') {
                    okBtn.click();
                }
            };
        });
    }

    async speak(text) {
        if (!this.synthesis || !text) {
            console.warn('🔇 Speech synthesis no disponible o texto vacío');
            return false;
        }

        // Manejo especial para iOS Safari
        if (this.isIOSSafari) {
            return await this.speakIOS(text);
        }

        try {
            this.stopSpeaking();

            return new Promise((resolve) => {
                this.currentUtterance = new SpeechSynthesisUtterance(text);

                if (this.selectedVoice) {
                    this.currentUtterance.voice = this.selectedVoice;
                }
                this.currentUtterance.rate = CONFIG.SPEECH.VOICE_RATE;
                this.currentUtterance.pitch = CONFIG.SPEECH.VOICE_PITCH;
                this.currentUtterance.volume = CONFIG.SPEECH.VOICE_VOLUME;

                // Timeout de seguridad para navegadores que no disparan eventos
                const safetyTimeout = setTimeout(() => {
                    console.warn('⏰ Timeout de seguridad en síntesis de voz');
                    this.isSpeaking = false;
                    this.currentUtterance = null;
                    resolve(false);
                }, 10000);

                this.currentUtterance.onstart = () => {
                    clearTimeout(safetyTimeout);
                    this.isSpeaking = true;
                    console.log('🗣️ Iniciando síntesis de voz:', text.substring(0, 50) + '...');
                };

                this.currentUtterance.onend = () => {
                    clearTimeout(safetyTimeout);
                    this.isSpeaking = false;
                    this.currentUtterance = null;
                    console.log('✅ Síntesis de voz completada');
                    resolve(true);
                };

                this.currentUtterance.onerror = (e) => {
                    clearTimeout(safetyTimeout);
                    this.isSpeaking = false;
                    this.currentUtterance = null;
                    console.warn('❌ Error en síntesis de voz:', e);
                    resolve(false);
                };

                try {
                    this.synthesis.speak(this.currentUtterance);
                    console.log('🔊 Comando speak() ejecutado');
                } catch (speakError) {
                    clearTimeout(safetyTimeout);
                    console.error('❌ Error ejecutando speak():', speakError);
                    this.isSpeaking = false;
                    this.currentUtterance = null;
                    resolve(false);
                }
            });

        } catch (error) {
            console.error('❌ Error en speak():', error);
            return false;
        }
    }

    async speakIOS(text) {
        console.log('🍎📱 Iniciando síntesis de voz en iOS Safari (iPhone 17 Pro):', text.substring(0, 50) + '...');

        // Debug del estado actual
        console.log('🔍 Estado TTS iOS:', {
            activated: this.iosTTSActivated,
            ready: this.iosTTSReady,
            speaking: this.isSpeaking,
            synthesis: {
                speaking: this.synthesis?.speaking,
                pending: this.synthesis?.pending,
                paused: this.synthesis?.paused
            }
        });

        // VERIFICACIÓN CRÍTICA: iOS puede "desactivar" TTS aleatoriamente
        // Verificar si synthesis sigue funcionando
        if (this.iosTTSActivated && this.synthesis) {
            try {
                // Test rápido para ver si synthesis sigue activo
                const testVoices = this.synthesis.getVoices();
                if (testVoices.length === 0) {
                    console.warn('🍎⚠️ TTS se desactivó automáticamente, reactivando...');
                    this.iosTTSActivated = false;
                    this.iosTTSReady = false;
                }
            } catch (e) {
                console.warn('🍎⚠️ Error verificando TTS, reactivando...', e);
                this.iosTTSActivated = false;
                this.iosTTSReady = false;
            }
        }

        // Si TTS no está activado o se desactivó, intentar reactivarlo
        if (!this.iosTTSActivated) {
            console.log('🔄 TTS no activado/desactivado, intentando (re)activación automática...');
            await this.forceActivateIOSTTS();

            // Si aún no está activado, guardar para después y mostrar mensaje claro
            if (!this.iosTTSActivated) {
                console.log('🗓️ TTS no activado aún, guardando para después de la interacción del usuario');
                this.pendingSpeech = text;
                this.showIOSTTSNotice();

                // Mostrar mensaje visual de que el asistente quiere hablar
                if (window.app && window.app.showStatus) {
                    window.app.showStatus('🔊 El asistente quiere hablar. Toca "Activar Audio" para escucharlo.', 5000);
                }

                return false;
            }
        }
        // Si TTS no está listo, esperar un poco más
        if (!this.iosTTSReady) {
            console.log('⏳ Esperando que TTS esté listo...');
            await new Promise(resolve => setTimeout(resolve, 1200));
        }

        try {
            this.stopSpeaking();

            return new Promise((resolve) => {
                // Limpiar la cola de síntesis en iOS (crítico para iPhone 17 Pro)
                if (this.synthesis.speaking || this.synthesis.pending) {
                    console.log('🧹 Limpiando cola de síntesis...');
                    this.synthesis.cancel();
                }

                // Pausa más larga para iPhone 17 Pro (más tiempo que iPhone 14)
                setTimeout(() => {
                    console.log('🍎 Creando utterance para iPhone 17 Pro...');

                    // VERIFICACIÓN ADICIONAL: Asegurar que synthesis sigue disponible
                    if (!this.synthesis || typeof this.synthesis.speak !== 'function') {
                        console.error('🍎❌ Synthesis no disponible, reintentando...');
                        this.isSpeaking = false;
                        this.currentUtterance = null;
                        this.iosTTSReady = true;
                        resolve(false);
                        return;
                    }

                    this.currentUtterance = new SpeechSynthesisUtterance(text);

                    // Configuración específica para iOS
                    if (this.selectedVoice) {
                        this.currentUtterance.voice = this.selectedVoice;
                        console.log('🎤 Voz seleccionada:', this.selectedVoice.name);
                    } else {
                        console.log('🎤 Usando voz por defecto');
                    }

                    // Configuración optimizada para iPhone 17 Pro
                    this.currentUtterance.rate = Math.min(CONFIG.SPEECH.VOICE_RATE, 0.9); // Más conservador
                    this.currentUtterance.pitch = CONFIG.SPEECH.VOICE_PITCH;
                    this.currentUtterance.volume = Math.max(CONFIG.SPEECH.VOICE_VOLUME, 0.9); // Asegurar volumen audible

                    console.log('🔊 Configuración TTS iPhone 17 Pro:', {
                        rate: this.currentUtterance.rate,
                        pitch: this.currentUtterance.pitch,
                        volume: this.currentUtterance.volume,
                        voice: this.currentUtterance.voice?.name || 'default'
                    });

                    let hasStarted = false;
                    let hasEnded = false;

                    // Timeout de seguridad más largo para iPhone 17 Pro
                    const safetyTimeout = setTimeout(() => {
                        if (!hasStarted && !hasEnded) {
                            console.warn('⏰ Timeout de seguridad - TTS no inició en iPhone 17 Pro');
                            this.isSpeaking = false;
                            this.currentUtterance = null;
                            this.iosTTSReady = true;
                            // Marcar TTS como desactivado para forzar reactivación
                            this.iosTTSActivated = false;
                            resolve(false);
                        }
                    }, 7000); // Timeout más largo

                    this.currentUtterance.onstart = () => {
                        hasStarted = true;
                        clearTimeout(safetyTimeout);
                        this.isSpeaking = true;
                        this.iosTTSReady = false;
                        console.log('🍎🗣️ TTS iniciado exitosamente en iPhone 17 Pro:', text.substring(0, 50) + '...');
                    };

                    this.currentUtterance.onend = () => {
                        hasEnded = true;
                        clearTimeout(safetyTimeout);
                        this.isSpeaking = false;
                        this.currentUtterance = null;
                        this.iosTTSReady = true;
                        console.log('🍎✅ TTS completado exitosamente en iPhone 17 Pro');
                        resolve(true);
                    };

                    this.currentUtterance.onerror = (e) => {
                        hasEnded = true;
                        clearTimeout(safetyTimeout);
                        this.isSpeaking = false;
                        this.currentUtterance = null;
                        this.iosTTSReady = true;
                        // Marcar TTS como desactivado para forzar reactivación en próximo intento
                        this.iosTTSActivated = false;
                        console.error('🍎❌ Error TTS en iPhone 17 Pro (marcando para reactivación):', {
                            error: e?.error || e,
                            message: e?.message,
                            type: e?.type
                        });
                        resolve(false);
                    };

                    // Intentar hablar con manejo de errores mejorado
                    try {
                        console.log('🍎 Ejecutando synthesis.speak() en iPhone 17 Pro...');
                        this.synthesis.speak(this.currentUtterance);
                        console.log('🍎 synthesis.speak() ejecutado, esperando eventos...');
                    } catch (speakError) {
                        clearTimeout(safetyTimeout);
                        console.error('🍎❌ Error al ejecutar speak() en iPhone 17 Pro:', speakError);
                        this.isSpeaking = false;
                        this.currentUtterance = null;
                        this.iosTTSReady = true;
                        // Marcar TTS como desactivado para forzar reactivación
                        this.iosTTSActivated = false;
                        resolve(false);
                    }
                }, 300); // Pausa más larga para iPhone 17 Pro
            });

        } catch (error) {
            console.error('🍎❌ Error en speakIOS() para iPhone 17 Pro:', error);
            this.iosTTSReady = true;
            // Marcar TTS como desactivado para forzar reactivación
            this.iosTTSActivated = false;
            return false;
        }
    }

    /**
     * Forzar activación de TTS en iOS Safari
     */
    async forceActivateIOSTTS() {
        if (!this.isIOSSafari || this.iosTTSActivated) return true;

        try {
            console.log('🔄 Forzando activación de TTS en iOS Safari...');

            // Limpiar cualquier síntesis pendiente primero
            if (this.synthesis.speaking || this.synthesis.pending) {
                this.synthesis.cancel();
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Crear utterance de activación más audible para iOS
            const activationUtterance = new SpeechSynthesisUtterance('Activando audio');
            activationUtterance.volume = 0.1; // Muy bajo pero audible
            activationUtterance.rate = 2; // Rápido
            activationUtterance.pitch = 0.5;

            // Seleccionar voz en español si está disponible
            const voices = this.synthesis.getVoices();
            const spanishVoice = voices.find(voice =>
                voice.lang.startsWith('es') || voice.lang.includes('ES')
            );
            if (spanishVoice) {
                activationUtterance.voice = spanishVoice;
            }

            return new Promise((resolve) => {
                let resolved = false;

                const timeout = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        console.log('⏰ Timeout en activación forzada, marcando como activado');
                        this.iosTTSActivated = true;
                        this.iosTTSReady = true;
                        resolve(true);
                    }
                }, 2000);

                activationUtterance.onstart = () => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        console.log('✅ TTS activado exitosamente (forzado)');
                        this.iosTTSActivated = true;
                        this.iosTTSReady = true;
                        resolve(true);
                    }
                };

                activationUtterance.onend = () => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        console.log('🔚 TTS activación completada');
                        this.iosTTSActivated = true;
                        this.iosTTSReady = true;
                        resolve(true);
                    }
                };

                activationUtterance.onerror = (e) => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        console.warn('⚠️ Error en activación forzada:', e?.error || e);
                        // Marcar como activado de todos modos para intentar funcionar
                        this.iosTTSActivated = true;
                        this.iosTTSReady = true;
                        resolve(false);
                    }
                };

                try {
                    console.log('🍎 Ejecutando utterance de activación...');
                    this.synthesis.speak(activationUtterance);
                } catch (error) {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        console.warn('⚠️ Error ejecutando activación forzada:', error);
                        this.iosTTSActivated = true;
                        this.iosTTSReady = true;
                        resolve(false);
                    }
                }
            });
        } catch (error) {
            console.warn('⚠️ Error en forceActivateIOSTTS:', error);
            this.iosTTSActivated = true;
            this.iosTTSReady = true;
            return false;
        }
    }

    stopSpeaking() {
        if (this.synthesis && this.isSpeaking) {
            this.synthesis.cancel();
            this.isSpeaking = false;
            this.currentUtterance = null;

            // Restablecer estado para iOS
            if (this.isIOSSafari) {
                this.iosTTSReady = true;
            }
        }
    }

    dispose() {
        this.stopSpeaking();

        // Limpiar recursos de iOS
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.mediaRecorder) {
            if (this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
            this.mediaRecorder = null;
        }

        this.isInitialized = false;
    }
}

// ===== CAMERA MANAGER =====
class CameraManager {
    constructor() {
        this.videoElement = null;
        this.stream = null;
        this.isInitialized = false;

        this.constraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: false
        };
    }

    async init() {
        try {
            this.videoElement = document.getElementById('camera');
            if (!this.videoElement) {
                throw new Error('Elemento video no encontrado');
            }

            await this.startCamera();
            this.isInitialized = true;
            return true;

        } catch (error) {
            console.error('❌ Error cámara:', error);
            this.handleCameraError(error);
            return false;
        }
    }

    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
            this.videoElement.srcObject = this.stream;

            return new Promise((resolve, reject) => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play().then(resolve).catch(reject);
                };
                setTimeout(() => reject(new Error('Timeout cámara')), 10000);
            });

        } catch (error) {
            throw new Error('Error cámara: ' + error.message);
        }
    }

    handleCameraError(error) {
        let userMessage = 'Error con la cámara';
        if (error.name === 'NotAllowedError') {
            userMessage = 'Acceso denegado. Permite la cámara.';
        }

        const statusElement = document.querySelector('.modal-content p');
        if (statusElement) {
            statusElement.textContent = `❌ ${userMessage}`;
        }
    }

    destroy() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
        this.isInitialized = false;
    }
}

// ===== MODEL 3D MANAGER SIMPLE =====
class Model3DManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.model = null;
        this.mixer = null;
        this.animations = {};
        this.currentAnimation = null;
        this.isARMode = false;
        this.clock = new THREE.Clock();
        this.isVisible = false;
        this.modelLoaded = false;
        this.defaultScale = (CONFIG && CONFIG.MODEL && CONFIG.MODEL.SCALE) ? CONFIG.MODEL.SCALE : 1.0;
        // WebXR state
        this.xrSession = null;
        this.xrRefSpace = null;        // 'local' reference space
        this.xrViewerSpace = null;     // 'viewer' reference for hit-test source
        this.xrHitTestSource = null;
        this.reticle = null;           // visual reticle for hit pose
        this.hasPlaced = false;        // whether the avatar is locked in place
        this._onXRFrameBound = null;   // cached bound frame callback
        this._xrFrames = 0;            // frames counted in XR
        this._xrHits = 0;              // number of hit-test results observed
        this._xrStartTs = 0;           // session start timestamp
        this._lastXRFrame = null;      // last XRFrame for select fallback
        // Anchors
        this.xrAnchor = null;          // active XRAnchor
        this.xrAnchorSpace = null;     // anchor space to get poses
        this._lastHitResult = null;    // cache last XRHitTestResult
        // Controles
        this._controls = {
            isDragging: false,
            lastX: 0,
            lastY: 0,
            rotateSpeed: 0.005,
            moveSpeed: 0.2,
            scaleMin: 0.1,
            scaleMax: 10.0
        };
        // Estado táctil (móvil)
        this._touch = {
            isTouching: false,
            isTwoFinger: false,
            startDist: 0,
            lastCenter: { x: 0, y: 0 }
        };
        // Tap-to-place (AR)
        this._raycaster = new THREE.Raycaster();
        this._ndc = new THREE.Vector2();
        this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y = 0
        this._tapPlacementEnabled = false;
        this._tapHandler = null;
        this._touchEndHandler = null;
        // Tap detection state to avoid triggering placement after pinch
        this._tapTouchStartHandler = null;
        this._tapTouchMoveHandler = null;
        this._tapTouchEndHandler = null;
        this._tapStartX = 0;
        this._tapStartY = 0;
        this._tapStartTime = 0;
        this._tapHadMultiTouch = false;
    }

    async init() {
        try {
            console.log('Inicializando Model 3D...');

            if (typeof THREE === 'undefined') {
                throw new Error('Three.js no disponible');
            }

            this.setupRenderer();
            this.setupScene();
            this.setupCamera();
            this.setupLights();

            // CARGAR TU MODELO DIRECTAMENTE
            try {
                await this.loadModel();
                console.log('Modelo cargado correctamente');
            } catch (error) {
                console.warn('⚠️ No se pudo cargar tu modelo:', error);
                this.createTemporaryModel();
            }
            // Activar controles interactivos
            this.enableControls();

            this.startRenderLoop();
            console.log('Model 3D Manager listo');
        } catch (error) {
            console.error('❌ Error Model 3D:', error);
            this.createTemporaryModel();
            this.startRenderLoop();
        }
    }

    async loadModel() {
        return new Promise((resolve, reject) => {
            console.log('Cargando modelo:', CONFIG.MODEL.PATH);

            const loader = new THREE.GLTFLoader();

            // Configurar DRACO si está disponible
            if (THREE.DRACOLoader) {
                const dracoLoader = new THREE.DRACOLoader();
                dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
                loader.setDRACOLoader(dracoLoader);
                console.log('DRACO configurado');
            }

            loader.load(
                CONFIG.MODEL.PATH,
                (gltf) => {
                    console.log('Modelo 3D cargado correctamente');

                    this.model = gltf.scene;
                    this.modelLoaded = true;

                    // Configurar escala
                    this.model.scale.setScalar(CONFIG.MODEL.SCALE);

                    // Centrar modelo
                    const box = new THREE.Box3().setFromObject(this.model);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());

                    console.log('📏 Tamaño de tu modelo:', size);
                    console.log('📍 Centro de tu modelo:', center);

                    this.model.position.sub(center);
                    this.model.position.y = 0;

                    // Configurar materiales
                    this.model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    this.scene.add(this.model);

                    // Configurar animaciones si existen
                    if (gltf.animations && gltf.animations.length > 0) {
                        this.setupAnimations(gltf.animations);
                        console.log(`🎬 ${gltf.animations.length} animaciones en tu modelo`);
                    } else {
                        console.log('ℹ️ Tu modelo no tiene animaciones');
                    }

                    resolve();
                },
                (progress) => {
                    let percent = 0;
                    if (progress && typeof progress.total === 'number' && progress.total > 0) {
                        percent = Math.round((progress.loaded / progress.total) * 100);
                    } else if (progress && typeof progress.loaded === 'number') {
                        // fallback cuando no hay total
                        percent = Math.min(99, Math.round((progress.loaded / (1024 * 1024)) * 10));
                    }
                    console.log(`📥 Cargando tu modelo: ${percent}%`);
                },
                (error) => {
                    console.error('❌ ERROR CARGANDO TU MODELO:', error);
                    console.error('Verifica que el archivo esté en: models/avatar_prueba.glb');
                    reject(error);
                }
            );
        });
    }

    createTemporaryModel() {
        console.log('Creando modelo temporal visible...');

        // Crear cubo brillante que se vea
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshPhongMaterial({
            color: 0xff4444,
            shininess: 100
        });

        this.model = new THREE.Mesh(geometry, material);
        this.model.position.set(0, 1, 0);
        this.model.castShadow = true;
        this.modelLoaded = true;

        this.scene.add(this.model);

        console.log('Modelo temporal creado');
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true,
            antialias: true
        });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        // Enable WebXR rendering (AR)
        if (this.renderer && this.renderer.xr) {
            this.renderer.xr.enabled = true;
        }
        // Ensure full transparency in AR
        try { this.renderer.domElement.style.backgroundColor = 'transparent'; } catch (_) { }
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = this.isARMode ? null : new THREE.Color(0x87CEEB);
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 3, 5);
        this.camera.lookAt(0, 1, 0);
    }

    setupLights() {
        // Luces brillantes para máxima visibilidad
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
        directionalLight.position.set(10, 10, 5);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        const pointLight1 = new THREE.PointLight(0xffffff, 1.0, 50);
        pointLight1.position.set(5, 5, 5);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0xffffff, 1.0, 50);
        pointLight2.position.set(-5, 5, -5);
        this.scene.add(pointLight2);
    }

    setupAnimations(animations) {
        this.mixer = new THREE.AnimationMixer(this.model);

        animations.forEach((clip) => {
            const action = this.mixer.clipAction(clip);
            this.animations[clip.name.toLowerCase()] = action;
            console.log('🎬 Animación:', clip.name);
        });

        this.playIdleAnimation();
    }

    // Métodos de animación
    playIdleAnimation() {
        if (!this.modelLoaded) return;
        this.playAnimation(CONFIG.MODEL.ANIMATIONS.IDLE);
    }

    playTalkingAnimation() {
        if (!this.modelLoaded) return;
        this.playAnimation(CONFIG.MODEL.ANIMATIONS.TALKING);
    }

    playThinkingAnimation() {
        if (!this.modelLoaded) return;
        this.playAnimation(CONFIG.MODEL.ANIMATIONS.THINKING);
    }

    playListeningAnimation() {
        if (!this.modelLoaded) return;
        this.playAnimation(CONFIG.MODEL.ANIMATIONS.LISTENING);
    }

    playAnimation(animationName) {
        if (!this.mixer || !animationName) return;

        const action = this.animations[animationName.toLowerCase()];
        if (action) {
            // Ajustar velocidad global de reproducción
            const spd = (CONFIG && CONFIG.MODEL && typeof CONFIG.MODEL.ANIMATION_SPEED === 'number') ? CONFIG.MODEL.ANIMATION_SPEED : 1.0;
            this.mixer.timeScale = Math.max(0.1, spd);
            if (this.currentAnimation && this.currentAnimation !== action) {
                this.currentAnimation.fadeOut(0.3);
            }
            action.reset().fadeIn(0.3).play();
            this.currentAnimation = action;
            console.log('🎬 Reproduciendo:', animationName);
        }
    }

    setARMode(isAR) {
        this.isARMode = isAR;

        if (isAR) {
            this.scene.background = null;
            this.renderer.setClearColor(0x000000, 0);
            // Ensure canvas covers screen in AR
            if (this.canvas && this.canvas.style) {
                this.canvas.style.width = '100vw';
                this.canvas.style.height = '100vh';
            }
        } else {
            this.scene.background = new THREE.Color(0x87CEEB);
            this.renderer.setClearColor(0x87CEEB, 1);
            if (this.canvas && this.canvas.style) {
                this.canvas.style.width = '';
                this.canvas.style.height = '';
            }
        }
    }

    // ===== WebXR AR Session with Hit-Test =====
    async startARSession(useDomOverlay = true) {
        try {
            // Detectar dispositivo y navegador
            const isAndroid = /Android/i.test(navigator.userAgent);
            const isChrome = /Chrome/i.test(navigator.userAgent);
            const isFirefox = /Firefox/i.test(navigator.userAgent);
            const isBrave = /Brave/i.test(navigator.userAgent) || (navigator.brave && navigator.brave.isBrave);

            console.log('📱 Dispositivo detectado:', {
                isAndroid,
                isChrome,
                isFirefox,
                isBrave,
                userAgent: navigator.userAgent
            });

            // Verificar soporte WebXR
            if (!navigator.xr || !this.renderer || !this.renderer.xr) {
                console.warn('⚠️ WebXR no disponible en este navegador');
                if (isAndroid) {
                    console.log('🤖 Android detectado: usando fallback de cámara HTML');
                }
                return false;
            }

            // Verificar soporte de sesión AR
            let supported = false;
            try {
                supported = await navigator.xr.isSessionSupported?.('immersive-ar');
            } catch (error) {
                console.warn('⚠️ Error verificando soporte AR:', error);
                supported = false;
            }

            if (!supported) {
                console.warn('⚠️ Sesión immersive-ar no soportada');
                if (isAndroid) {
                    if (isChrome) {
                        console.log('🔧 Chrome Android: WebXR puede requerir activación manual');
                        console.log('📝 Instrucciones: chrome://flags/#webxr-incubations');
                    } else if (isFirefox) {
                        console.log('🦊 Firefox Android: WebXR limitado, usando fallback');
                    } else if (isBrave) {
                        console.log('🦁 Brave Android: WebXR puede estar deshabilitado, usando fallback');
                    }
                }
                return false;
            }

            // Request AR session con configuración optimizada para Android
            console.log('🕶️ Solicitando sesión WebXR immersive-ar...');
            this.renderer.xr.setReferenceSpaceType?.('local');

            // Configuración base más conservadora para Android
            const sessionInit = {
                requiredFeatures: [],
                optionalFeatures: ['hit-test', 'local-floor', 'bounded-floor', 'unbounded']
            };

            // Añadir características adicionales solo si no es Android problemático
            if (!isAndroid || isChrome) {
                sessionInit.optionalFeatures.push('light-estimation', 'anchors');
            }

            // Dom overlay solo en navegadores compatibles
            if (useDomOverlay && !isFirefox && !isBrave) {
                sessionInit.optionalFeatures.push('dom-overlay');
                sessionInit.domOverlay = { root: document.body };
            }

            console.log('⚙️ Configuración de sesión:', sessionInit);
            this.xrSession = await navigator.xr.requestSession('immersive-ar', sessionInit);

            // Set session to renderer
            this.renderer.xr.setSession(this.xrSession);

            // Reference spaces (prefer local-floor if available)
            try {
                this.xrRefSpace = await this.xrSession.requestReferenceSpace('local-floor');
            } catch (_) {
                this.xrRefSpace = await this.xrSession.requestReferenceSpace('local');
            }
            this.xrViewerSpace = await this.xrSession.requestReferenceSpace('viewer');

            console.log('✅ Sesión WebXR iniciada exitosamente!');
            console.log('🌈 environmentBlendMode:', this.xrSession.environmentBlendMode);
            console.log('🛠️ inputSources:', this.xrSession.inputSources?.length || 0);

            // Verificar modo de mezcla
            if (this.xrSession.environmentBlendMode && this.xrSession.environmentBlendMode === 'opaque') {
                console.warn('⚠️ Modo "opaque" detectado (sin passthrough de cámara)');
                if (isAndroid) {
                    console.log('🤖 Android: esto es normal en algunos dispositivos, continuando...');
                    // En Android, a veces funciona a pesar del modo opaque
                } else {
                    console.warn('🚫 Usando fallback por modo opaque');
                    try { await this.stopARSession(); } catch (_) { }
                    return false;
                }
            }

            // Crear hit-test source con fallbacks para Android
            let hitTestSource = null;
            try {
                // Intentar con XRRay primero (más preciso)
                if (typeof XRRay !== 'undefined' && !isFirefox) {
                    hitTestSource = await this.xrSession.requestHitTestSource({
                        space: this.xrViewerSpace,
                        offsetRay: new XRRay()
                    });
                } else {
                    hitTestSource = await this.xrSession.requestHitTestSource({
                        space: this.xrViewerSpace
                    });
                }
            } catch (e) {
                console.warn('⚠️ requestHitTestSource falló:', e);
                try {
                    // Fallback sin offsetRay
                    hitTestSource = await this.xrSession.requestHitTestSource({
                        space: this.xrViewerSpace
                    });
                } catch (e2) {
                    console.error('❌ No se pudo crear hit-test source:', e2);
                    // Continuar sin hit-test
                }
            }
            this.xrHitTestSource = hitTestSource;

            // Transient input hit-test (para toques en pantalla) - opcional en Android
            try {
                if (!isFirefox && !isBrave) {
                    this.xrTransientHitTestSource = await this.xrSession.requestHitTestSourceForTransientInput({
                        profile: 'generic-touchscreen'
                    });
                } else {
                    this.xrTransientHitTestSource = null;
                }
            } catch (e) {
                console.warn('⚠️ requestHitTestSourceForTransientInput no disponible:', e);
                this.xrTransientHitTestSource = null;
            }

            // Create reticle if not exists
            if (!this.reticle) this.createReticle();
            this.reticle.visible = false;
            this.hasPlaced = false;
            this._xrFrames = 0;
            this._xrHits = 0;
            this._xrStartTs = performance.now ? performance.now() : Date.now();

            // Input: place model on select. Prefer anchors; if no plane hit, fallback 1.5m in front of camera
            this._onXRSelect = (ev) => {
                try {
                    // If we have a recent hit result, try to create an anchor
                    const frame = this._lastXRFrame;
                    if (this._lastHitResult && frame && typeof this._lastHitResult.createAnchor === 'function') {
                        this._lastHitResult.createAnchor().then((anchor) => {
                            this.xrAnchor = anchor;
                            this.xrAnchorSpace = anchor.anchorSpace;
                            this.hasPlaced = true;
                            if (this.reticle) this.reticle.visible = false;
                            // Deshabilitar matrixAutoUpdate para que el anchor controle la posición
                            if (this.model) this.model.matrixAutoUpdate = false;
                            // Aviso UI
                            try { this.canvas?.dispatchEvent(new CustomEvent('xr-anchored')); } catch (_) { }
                        }).catch((e) => {
                            console.warn('No se pudo crear anchor, usando posición de retícula:', e);
                            if (this.model && this.reticle) {
                                // Guardar la pose completa de la retícula
                                this.model.matrix.copy(this.reticle.matrix);
                                this.model.matrix.decompose(this.model.position, this.model.quaternion, this.model.scale);
                                // Deshabilitar updates automáticos para mantener fijo
                                this.model.matrixAutoUpdate = false;
                                this.model.updateMatrix();
                                this.hasPlaced = true;
                                if (this.reticle) this.reticle.visible = false;
                                try { this.canvas?.dispatchEvent(new CustomEvent('xr-placed-no-anchor')); } catch (_) { }
                            }
                        });
                        return;
                    }

                    // Si no tenemos hit anclable pero sí retícula visible, colocar en esa pose
                    if (this.model && this.reticle && this.reticle.visible) {
                        // Guardar la pose completa de la retícula
                        this.model.matrix.copy(this.reticle.matrix);
                        this.model.matrix.decompose(this.model.position, this.model.quaternion, this.model.scale);
                        // Deshabilitar updates automáticos para mantener fijo
                        this.model.matrixAutoUpdate = false;
                        this.model.updateMatrix();
                        this.hasPlaced = true;
                        if (this.reticle) this.reticle.visible = false;
                        return;
                    }

                    // Fallback: viewer pose forward
                    if (frame && this.xrRefSpace) {
                        const viewerPose = frame.getViewerPose(this.xrRefSpace);
                        if (viewerPose && viewerPose.views && viewerPose.views[0]) {
                            const m = new THREE.Matrix4().fromArray(viewerPose.views[0].transform.matrix);
                            const pos = new THREE.Vector3().setFromMatrixPosition(m);
                            const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(new THREE.Matrix4().extractRotation(m));
                            const fallbackPos = pos.clone().add(dir.multiplyScalar(1.5));
                            this.model.position.copy(fallbackPos);
                            // Deshabilitar updates automáticos para mantener fijo
                            this.model.matrixAutoUpdate = false;
                            this.model.updateMatrix();
                            this.hasPlaced = true;
                            try { this.canvas?.dispatchEvent(new CustomEvent('xr-placed-fallback')); } catch (_) { }
                        }
                    }
                } catch (e) {
                    console.warn('onXRSelect fallback error:', e);
                }
            };
            this.xrSession.addEventListener('select', this._onXRSelect);
            this.xrSession.addEventListener('end', () => console.log('🛑 XRSession end'));

            // Animation loop for XR frames
            this._onXRFrameBound = (time, frame) => this._onXRFrame(time, frame);
            this.renderer.setAnimationLoop(this._onXRFrameBound);

            // Si no hay frames después de 1.5s, reintentar sin domOverlay una sola vez
            if (useDomOverlay) {
                setTimeout(async () => {
                    try {
                        if (this._xrFrames === 0 && this.xrSession) {
                            console.warn('⚠️ Sin frames XR con domOverlay. Reintentando sin domOverlay...');
                            await this.stopARSession();
                            await this.startARSession(false);
                        }
                    } catch (e) { console.warn('Retry sin domOverlay falló:', e); }
                }, 1500);
            }

            return true;
        } catch (err) {
            console.error('❌ startARSession error:', err);

            // Mensajes específicos para Android
            if (isAndroid) {
                if (err.name === 'NotSupportedError') {
                    console.log('📝 Android: WebXR no soportado en este dispositivo/navegador');
                } else if (err.name === 'SecurityError') {
                    console.log('🔒 Android: Error de seguridad - verifica HTTPS y permisos');
                } else if (err.name === 'NotAllowedError') {
                    console.log('🚫 Android: Permisos denegados - permite cámara y sensores');
                }
            }

            return false;
        }
    }

    async stopARSession() {
        try {
            if (this.xrSession) {
                if (this._onXRSelect) {
                    try { this.xrSession.removeEventListener('select', this._onXRSelect); } catch (_) { }
                }
                await this.xrSession.end();
            }
        } catch (e) {
            console.warn('stopARSession warning:', e);
        } finally {
            this.xrSession = null;
            this.xrRefSpace = null;
            this.xrViewerSpace = null;
            this.xrHitTestSource = null;
            this.xrAnchor = null;
            this.xrAnchorSpace = null;
            this._onXRSelect = null;
            // Return to normal RAF loop
            if (this.renderer) this.renderer.setAnimationLoop(null);
            if (this.reticle) this.reticle.visible = false;
            this.hasPlaced = false;
            // Restaurar matrixAutoUpdate para modo preview
            if (this.model) {
                this.model.matrixAutoUpdate = true;
            }
        }
    }

    _onXRFrame(time, frame) {
        if (!frame || !this.renderer || !this.scene || !this.camera) return;

        const session = frame.session;
        this._lastXRFrame = frame;
        // Update hit-test
        if (this.xrHitTestSource && this.xrRefSpace) {
            const results = frame.getHitTestResults(this.xrHitTestSource);
            if (results && results.length > 0) {
                const hit = results[0];
                this._lastHitResult = hit;
                const pose = hit.getPose(this.xrRefSpace);
                if (pose && this.reticle) {
                    this.reticle.visible = !this.hasPlaced; // hide reticle after placement
                    this.reticle.matrix.fromArray(pose.transform.matrix);
                    this._xrHits++;
                    // Aviso UI: se detecta plano
                    try { this.canvas?.dispatchEvent(new CustomEvent('xr-plane-detected')); } catch (_) { }
                }
            } else if (this.reticle) {
                // If no hits, try to place reticle 1.5m in front of the camera for visual confirmation
                const viewerPose = frame.getViewerPose(this.xrRefSpace);
                if (viewerPose && !this.hasPlaced) {
                    const view = viewerPose.views[0];
                    if (view) {
                        const m = new THREE.Matrix4().fromArray(view.transform.matrix);
                        const pos = new THREE.Vector3().setFromMatrixPosition(m);
                        const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(new THREE.Matrix4().extractRotation(m));
                        const fallbackPos = pos.clone().add(dir.multiplyScalar(1.5));
                        this.reticle.visible = true;
                        this.reticle.matrix.identity();
                        this.reticle.matrix.setPosition(fallbackPos);
                    }
                } else {
                    this.reticle.visible = false && !this.hasPlaced;
                }
            }
        }

        // Transient input hits (on tap)
        if (this.xrTransientHitTestSource && this.xrRefSpace) {
            const transientResults = frame.getHitTestResultsForTransientInput(this.xrTransientHitTestSource);
            if (transientResults && transientResults.length > 0) {
                const first = transientResults[0];
                if (first && first.results && first.results.length > 0) {
                    const pose = first.results[0].getPose(this.xrRefSpace);
                    if (pose && this.reticle && !this.hasPlaced) {
                        this.reticle.visible = true;
                        this.reticle.matrix.fromArray(pose.transform.matrix);
                        this._xrHits++;
                    }
                }
            }
        }

        // If anchored, update model pose from anchor space to keep it fixed in the real world
        if (this.xrAnchorSpace && this.hasPlaced) {
            const anchorPose = frame.getPose(this.xrAnchorSpace, this.xrRefSpace);
            if (anchorPose && this.model) {
                const m = new THREE.Matrix4().fromArray(anchorPose.transform.matrix);
                this.model.matrix.copy(m);
                // NO descomponemos ni actualizamos position/rotation/scale individualmente
                // para evitar conflictos con las transformaciones manuales
            }
        }
        // Si está colocado sin anchor, mantener la matriz fija (no hacer nada, matrixAutoUpdate=false)

        // Animate and render
        const deltaTime = this.clock.getDelta();
        if (this.mixer && this.modelLoaded) this.mixer.update(deltaTime);
        if (this.isVisible) this.renderer.render(this.scene, this.camera);

        // Diagnostics: count frames and optionally fallback after 5s without hits
        this._xrFrames++;
        if (this._xrStartTs && ((performance.now ? performance.now() : Date.now()) - this._xrStartTs) > 5000) {
            if (this._xrHits === 0) {
                console.warn('⏳ Sin resultados de hit-test en 5s. Considera mover el dispositivo o tocar para colocar al frente.');
                if (this.ui && this.ui.arStatus) {
                    try {
                        this.ui.arStatus.classList.remove('hidden');
                        this.ui.arStatus.textContent = 'Sin plano: toca para colocar al frente o mueve el teléfono';
                    } catch (_) { }
                }
            }
            // Only report once
            this._xrStartTs = 0;
        }
    }

    createReticle() {
        const geo = new THREE.RingGeometry(0.12, 0.15, 32).rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide });
        this.reticle = new THREE.Mesh(geo, mat);
        this.reticle.matrixAutoUpdate = false;
        this.reticle.visible = false;
        this.scene.add(this.reticle);
    }

    enableTapPlacement(enable = true) {
        if (!this.canvas) return;
        if (enable === this._tapPlacementEnabled) return;
        this._tapPlacementEnabled = enable;

        const handleTap = (clientX, clientY) => {
            if (!this.camera || !this.model) return;
            const rect = this.canvas.getBoundingClientRect();
            const x = ((clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((clientY - rect.top) / rect.height) * 2 + 1;
            this._ndc.set(x, y);
            this._raycaster.setFromCamera(this._ndc, this.camera);
            const hit = new THREE.Vector3();
            if (this._raycaster.ray.intersectPlane(this._groundPlane, hit)) {
                this.model.position.x = hit.x;
                this.model.position.z = hit.z;
                // Mantener en el piso
                this.model.position.y = 0;
                console.log('📍 Colocado en:', hit.x.toFixed(2), hit.z.toFixed(2));
            }
        };

        if (enable) {
            // Click (desktop)
            this._tapHandler = (e) => {
                e.preventDefault();
                handleTap(e.clientX, e.clientY);
            };
            this.canvas.addEventListener('click', this._tapHandler, { passive: false });

            // Touch: solo disparar tap cuando NO hubo multitouch ni movimiento significativo
            this._tapTouchStartHandler = (e) => {
                if (!e.touches || e.touches.length === 0) return;
                const t = e.touches[0];
                this._tapStartX = t.clientX;
                this._tapStartY = t.clientY;
                this._tapStartTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                // Si comenzó con más de un dedo, no es tap
                this._tapHadMultiTouch = e.touches.length > 1;
            };

            this._tapTouchMoveHandler = (e) => {
                // Si en cualquier momento hay 2+ dedos, marcar como multitouch
                if (e.touches && e.touches.length > 1) {
                    this._tapHadMultiTouch = true;
                }
            };

            this._tapTouchEndHandler = (e) => {
                if (!e.changedTouches || e.changedTouches.length === 0) return;
                // Si aún quedan dedos en pantalla, no considerar como tap
                if (e.touches && e.touches.length > 0) return;

                const t = e.changedTouches[0];
                const endX = t.clientX;
                const endY = t.clientY;
                const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - (this._tapStartTime || 0);
                const dx = endX - (this._tapStartX || 0);
                const dy = endY - (this._tapStartY || 0);
                const moved = Math.hypot(dx, dy);

                // Umbrales: 12px de movimiento y 500ms de duración
                const isQuick = elapsed <= 500;
                const isStationary = moved <= 12;

                if (!this._tapHadMultiTouch && isQuick && isStationary) {
                    e.preventDefault();
                    handleTap(endX, endY);
                }

                // Reset flag para próximos toques
                this._tapHadMultiTouch = false;
            };

            this.canvas.addEventListener('touchstart', this._tapTouchStartHandler, { passive: false });
            this.canvas.addEventListener('touchmove', this._tapTouchMoveHandler, { passive: false });
            this.canvas.addEventListener('touchend', this._tapTouchEndHandler, { passive: false });
        } else {
            if (this._tapHandler) this.canvas.removeEventListener('click', this._tapHandler);
            this._tapHandler = null;
            // Limpiar handlers táctiles de tap
            if (this._tapTouchStartHandler) this.canvas.removeEventListener('touchstart', this._tapTouchStartHandler);
            if (this._tapTouchMoveHandler) this.canvas.removeEventListener('touchmove', this._tapTouchMoveHandler);
            if (this._tapTouchEndHandler) this.canvas.removeEventListener('touchend', this._tapTouchEndHandler);
            this._tapTouchStartHandler = null;
            this._tapTouchMoveHandler = null;
            this._tapTouchEndHandler = null;
        }
    }

    setVisible(visible) {
        this.isVisible = visible;
        if (this.canvas) {
            this.canvas.style.display = visible ? 'block' : 'none';
            this.canvas.style.visibility = visible ? 'visible' : 'hidden';
            // Asegurar interacción táctil en móvil
            this.canvas.style.pointerEvents = visible ? 'auto' : 'none';
            console.log('👁️ Modelo visible:', visible);
        }
    }

    // Restablece escala, posición y rotación a un estado cómodo para Preview
    resetForPreview() {
        if (!this.model) return;
        // Escala por defecto
        const s = this.defaultScale || 1.0;
        this.model.scale.setScalar(s);
        // Centrado en origen, sobre el piso (y=0)
        // Recalcular caja para centrar si es necesario
        try {
            const box = new THREE.Box3().setFromObject(this.model);
            const center = box.getCenter(new THREE.Vector3());
            this.model.position.sub(center);
        } catch (_) { }
        this.model.position.y = 0;
        this.model.position.x = 0;
        this.model.position.z = 0;
        // Rotación cómoda
        this.model.rotation.set(0, 0, 0);
        // Cámara de preview
        if (this.camera) {
            this.camera.position.set(0, 3, 5);
            this.camera.lookAt(0, 1, 0);
        }
        // Animación idle
        this.playIdleAnimation();
        console.log('✅ Reset preview: escala', s);
    }

    handleResize() {
        if (!this.camera || !this.renderer) return;
        // Evitar cambiar tamaño mientras una sesión XR está presentando
        if (this.renderer.xr && this.renderer.xr.isPresenting) {
            // WebXR gestiona el viewport; ignorar este resize
            return;
        }

        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    startRenderLoop() {
        const animate = () => {
            requestAnimationFrame(animate);

            const deltaTime = this.clock.getDelta();

            if (this.mixer && this.modelLoaded) {
                this.mixer.update(deltaTime);
            }

            // Rotación automática para que se vea
            if (this.model && CONFIG.MODEL.AUTO_ROTATE) {
                this.model.rotation.y += CONFIG.MODEL.ROTATE_SPEED;
            }

            // Renderizar cuando visible
            // Evitar render doble: si XR está presentando, el render lo maneja setAnimationLoop
            if (this.isVisible && this.renderer && this.scene && this.camera && !(this.renderer.xr && this.renderer.xr.isPresenting)) {
                this.renderer.render(this.scene, this.camera);
            }
        };

        animate();
        console.log('🎬 Renderizado iniciado');
    }

    // ===== Controles Interactivos =====
    enableControls() {
        if (!this.canvas) return;


        // Rueda del ratón deshabilitada

        // Arrastrar: rotar
        this._pointerDown = (e) => {
            this._controls.isDragging = true;
            this._controls.lastX = e.clientX;
            this._controls.lastY = e.clientY;
        };
        this._pointerMove = (e) => {
            if (!this._controls.isDragging || !this.model) return;
            const dx = e.clientX - this._controls.lastX;
            const dy = e.clientY - this._controls.lastY;
            this._controls.lastX = e.clientX;
            this._controls.lastY = e.clientY;
            this.model.rotation.y += dx * this._controls.rotateSpeed;
            this.model.rotation.x += dy * this._controls.rotateSpeed;
        };
        this._pointerUp = () => { this._controls.isDragging = false; };
        this.canvas.addEventListener('mousedown', this._pointerDown);
        window.addEventListener('mousemove', this._pointerMove);
        window.addEventListener('mouseup', this._pointerUp);

        // Teclado: mover, rotar, escalar
        this._keyHandler = (e) => {
            if (!this.model) return;
            const k = e.key.toLowerCase();
            const m = this._controls.moveSpeed;
            switch (k) {
                case 'arrowleft':
                case 'a':
                    this.model.position.x -= m; break;
                case 'arrowright':
                case 'd':
                    this.model.position.x += m; break;
                case 'arrowup':
                case 'w':
                    this.model.position.z -= m; break;
                case 'arrowdown':
                case 's':
                    this.model.position.z += m; break;
                case 'r':
                    this.model.position.y += m; break;
                case 'f':
                    this.model.position.y -= m; break;
                case 'q':
                    this.model.rotation.y -= 0.1; break;
                case 'e':
                    this.model.rotation.y += 0.1; break;
                // Zoom con teclado deshabilitado
            }
        };
        window.addEventListener('keydown', this._keyHandler);

        // ==== Gestos táctiles ====
        const distance = (t1, t2) => {
            const dx = t2.clientX - t1.clientX;
            const dy = t2.clientY - t1.clientY;
            return Math.hypot(dx, dy);
        };
        const centerPt = (t1, t2) => ({ x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 });

        this._touchStart = (e) => {
            if (!this.model) return;
            this._touch.isTouching = true;
            if (e.touches.length === 1) {
                // rotación con un dedo
                this._controls.isDragging = true;
                this._controls.lastX = e.touches[0].clientX;
                this._controls.lastY = e.touches[0].clientY;
                this._touch.isTwoFinger = false;
            } else if (e.touches.length >= 2) {
                // pinch para escalar, pan para mover
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                this._touch.startDist = distance(t1, t2);
                this._touch.lastCenter = centerPt(t1, t2);
                this._touch.isTwoFinger = true;
                this._controls.isDragging = false;
            }
        };

        this._touchMove = (e) => {
            if (!this.model || !this._touch.isTouching) return;
            if (this._touch.isTwoFinger && e.touches.length >= 2) {
                // Solo pan (mover), sin escala
                const t1 = e.touches[0];
                const t2 = e.touches[1];

                // Pan (mover)
                const c = centerPt(t1, t2);
                if (!this.isARMode && !this._tapPlacementEnabled) {
                    const dx = (c.x - this._touch.lastCenter.x) * 0.01;
                    const dy = (c.y - this._touch.lastCenter.y) * 0.01;
                    // Umbral para evitar jitter por micro-movimientos
                    if (Math.abs(dx) + Math.abs(dy) > 0.06) {
                        this.model.position.x += dx;
                        this.model.position.y -= dy;
                    }
                } else {
                    // En AR mantener al avatar pegado al piso tras escalar
                    this.model.position.y = 0;
                }
                this._touch.lastCenter = c;
            } else if (e.touches.length === 1 && this._controls.isDragging) {
                // Rotar con un dedo
                const tx = e.touches[0].clientX;
                const ty = e.touches[0].clientY;
                const dx = tx - this._controls.lastX;
                const dy = ty - this._controls.lastY;
                this._controls.lastX = tx;
                this._controls.lastY = ty;
                this.model.rotation.y += dx * this._controls.rotateSpeed;
                this.model.rotation.x += dy * this._controls.rotateSpeed;
            }
        };

        this._touchEnd = () => {
            this._touch.isTouching = false;
            this._touch.isTwoFinger = false;
            this._controls.isDragging = false;
        };

        this.canvas.addEventListener('touchstart', this._touchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this._touchMove, { passive: false });
        this.canvas.addEventListener('touchend', this._touchEnd, { passive: false });
        this.canvas.addEventListener('touchcancel', this._touchEnd, { passive: false });
    }


    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
        }
        // Limpiar listeners de controles
        if (this.canvas && this._wheelHandler) this.canvas.removeEventListener('wheel', this._wheelHandler);
        if (this.canvas && this._pointerDown) this.canvas.removeEventListener('mousedown', this._pointerDown);
        if (this._pointerMove) window.removeEventListener('mousemove', this._pointerMove);
        if (this._pointerUp) window.removeEventListener('mouseup', this._pointerUp);
        if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
        if (this.canvas && this._touchStart) this.canvas.removeEventListener('touchstart', this._touchStart);
        if (this.canvas && this._touchMove) this.canvas.removeEventListener('touchmove', this._touchMove);
        if (this.canvas && this._touchEnd) {
            this.canvas.removeEventListener('touchend', this._touchEnd);
            this.canvas.removeEventListener('touchcancel', this._touchEnd);
        }
    }
}

// ===== APLICACIÓN PRINCIPAL =====
class VirtualAssistantApp {
    constructor() {
        this.cameraManager = null;
        this.model3dManager = null;
        this.gemini = new GeminiClient();
        this.speech = new SpeechManager();

        this.isInAR = false;
        this.isInPreview = false;
        this.isLoading = true;
        this.isProcessing = false;
        this.isInitialized = false;

        this.initUIElements();
        this.init();
    }

    initUIElements() {
        this.ui = {
            loadingScreen: document.getElementById('loadingScreen'),
            permissionModal: document.getElementById('permissionModal'),

            mainControls: document.getElementById('mainControls'),
            chatBtn: document.getElementById('chatBtn'),
            arBtn: document.getElementById('arBtn'),
            voiceBtn: document.getElementById('voiceBtn'),
            modelBtn: document.getElementById('modelBtn'),

            chatModal: document.getElementById('chatModal'),
            chatMessages: document.getElementById('chatMessages'),
            userInput: document.getElementById('userInput'),
            sendBtn: document.getElementById('sendBtn'),
            micBtn: document.getElementById('micBtn'),
            closeBtn: document.getElementById('closeBtn'),
            chatStatus: document.getElementById('chatStatus'),

            arChat: document.getElementById('arChat'),
            arResponse: document.getElementById('arResponse'),
            arInput: document.getElementById('arInput'),
            arSendBtn: document.getElementById('arSendBtn'),
            arMicBtn: document.getElementById('arMicBtn'),
            arCloseBtn: document.getElementById('arCloseBtn'),

            statusDisplay: document.getElementById('statusDisplay'),
            appStatus: document.getElementById('appStatus'),
            arStatus: document.getElementById('arStatus'),

            camera: document.getElementById('camera'),
            model3dCanvas: document.getElementById('model3dCanvas'),

            // iOS TTS Notice
            iosTTSNotice: document.getElementById('iosTTSNotice')
        };
    }

    async init() {
        try {
            console.log('🚀 Iniciando Asistente Virtual AR...');
            // Mostrar el modelo en modo Preview antes de pedir permisos
            await this.initPreviewModel();

            this.setupEventListeners();
            this.showPermissionModal();
        } catch (error) {
            console.error('❌ Error inicializando:', error);
        }
    }

    async initPreviewModel() {
        try {
            if (!this.ui || !this.ui.model3dCanvas) return;
            if (!this.model3dManager) {
                this.model3dManager = new Model3DManager(this.ui.model3dCanvas);
                await this.model3dManager.init();
            }
            this.isInPreview = true;
            this.isInAR = false;
            if (this.ui.camera) this.ui.camera.style.display = 'none';
            this.model3dManager.setARMode(false);
            this.model3dManager.setVisible(true);
            console.log('✅ Preview inicial listo');
        } catch (e) {
            console.error('⚠️ No se pudo iniciar preview inicial:', e);
        }
    }

    showPermissionModal() {
        if (this.ui.permissionModal) {
            this.ui.permissionModal.classList.remove('hidden');
            this.ui.permissionModal.style.display = 'flex';
        }
    }

    hidePermissionModal() {
        if (this.ui.permissionModal) {
            this.ui.permissionModal.classList.add('hidden');
            setTimeout(() => {
                this.ui.permissionModal.style.display = 'none';
            }, 300);
        }
    }

    /**
     * Solicitar permisos - MODIFICADO para iOS
     */
    async requestPermissions() {
        try {
            this.updatePermissionStatus('Inicializando...');

            // 1. Cámara
            this.updatePermissionStatus('Inicializando cámara...');
            this.cameraManager = new CameraManager();
            const cameraSuccess = await this.cameraManager.init();
            if (!cameraSuccess) {
                throw new Error('No se pudo acceder a la cámara');
            }

            // 2. Speech ANTES de Gemini para iOS user gesture
            this.updatePermissionStatus('Activando voz para iOS...');
            console.log('🎤 Iniciando configuración de voz...');
            const speechOk = await this.speech.init();
            console.log('🎤 Speech init resultado:', speechOk);

            if (!speechOk) {
                const reason = this.speech?.unsupportedReason ? this.speech.unsupportedReason : 'Voz no disponible';
                console.log('⚠️ Speech falló:', reason);
                this.updatePermissionStatus(reason);
                // No lanzar error - continuar sin voz
                console.log('⚠️ Continuando sin reconocimiento de voz');
            } else {
                console.log('✅ Speech configurado correctamente');
            }

            // 3. Gemini 2.0
            this.updatePermissionStatus('Conectando Gemini 2.0...');
            const aiSuccess = await this.gemini.init();
            if (!aiSuccess) {
                throw new Error('No se pudo conectar con Gemini 2.0');
            }

            // 4. Modelo 3D (reutilizar si ya está cargado para preview)
            this.updatePermissionStatus('Preparando modelo 3D...');
            if (!this.model3dManager) {
                this.model3dManager = new Model3DManager(this.ui.model3dCanvas);
                await this.model3dManager.init();
            }

            // 5. Listo
            this.isInitialized = true;
            this.hidePermissionModal();
            this.hideLoadingScreen();

            // Dejar al usuario en Preview por defecto tras permisos
            this.enterPreviewMode();

            console.log('✅ Sistema inicializado correctamente');

            // 6. Mostrar mensaje de bienvenida automático
            setTimeout(() => {
                this.showWelcomeMessage();
            }, 1000);

        } catch (error) {
            console.error('❌ ERROR CRÍTICO:', error);
            this.updatePermissionStatus(error.message);

            const btn = document.getElementById('requestPermissions');
            if (btn) {
                btn.textContent = 'Reintentar';
            }
        }
    }


    // ===== MODOS DE OPERACIÓN =====

    enterNormalMode() {
        this.isInPreview = false;
        this.isInAR = false;

        if (this.ui.camera) this.ui.camera.style.display = 'none';
        if (this.model3dManager) this.model3dManager.setVisible(false);

        if (this.ui.mainControls) this.ui.mainControls.style.display = 'flex';
        if (this.ui.arChat) this.ui.arChat.style.display = 'none';

        if (this.ui.arBtn) {
            this.ui.arBtn.innerHTML = '<span class="btn-icon">📱</span><span class="btn-text">AR</span>';
        }
        if (this.ui.modelBtn) {
            this.ui.modelBtn.innerHTML = '<span class="btn-icon">🎭</span><span class="btn-text">Ver Avatar</span>';
        }

        if (this.ui.appStatus) this.ui.appStatus.textContent = '🤖 Avatar con Gemini 2.0 listo';
        if (this.ui.arStatus) this.ui.arStatus.classList.add('hidden');
    }

    enterPreviewMode() {
        console.log('Mostrando modelo...');

        this.isInPreview = true;
        this.isInAR = false;

        if (this.ui.camera) this.ui.camera.style.display = 'none';
        if (this.model3dManager) {
            this.model3dManager.setVisible(true);
            this.model3dManager.setARMode(false);
            // Asegurar escala y posición correctas en Preview
            this.model3dManager.resetForPreview();
        }

        if (this.ui.mainControls) this.ui.mainControls.style.display = 'flex';
        if (this.ui.arChat) this.ui.arChat.style.display = 'none';

        if (this.ui.modelBtn) {
            this.ui.modelBtn.innerHTML = '<span class="btn-icon">🎭</span><span class="btn-text">Ocultar Avatar</span>';
        }

        if (this.ui.appStatus) this.ui.appStatus.textContent = '🎭 Viendo Avatar 3D';

        if (this.model3dManager) {
            this.model3dManager.playIdleAnimation();
        }

        console.log('✅ Modelo visible en preview');
    }

    enterARMode() {
        this.isInAR = true;
        this.isInPreview = false;

        const startXR = async () => {
            // Detectar dispositivo para mejor manejo
            const isAndroid = /Android/i.test(navigator.userAgent);
            const isChrome = /Chrome/i.test(navigator.userAgent);
            const isFirefox = /Firefox/i.test(navigator.userAgent);
            const isBrave = /Brave/i.test(navigator.userAgent) || (navigator.brave && navigator.brave.isBrave);

            console.log('🚀 Iniciando modo AR...');

            // Force fallback path if configured
            if (CONFIG && CONFIG.AR && CONFIG.AR.FORCE_FALLBACK) {
                console.warn('⚙️ FORCE_FALLBACK activo: usando cámara HTML.');
                await this.setupFallbackAR('Fallback AR (configurado)');
                return;
            }

            // Intentar WebXR primero
            let xrOk = false;
            if (this.model3dManager) {
                this.model3dManager.setVisible(true);
                this.model3dManager.setARMode(true);

                console.log('🔍 Intentando WebXR AR...');
                xrOk = await this.model3dManager.startARSession();
            }

            if (xrOk && !isAndroid) {
                // WebXR exitoso solo en dispositivos no-Android
                console.log('✅ WebXR AR iniciado correctamente');
                if (this.ui.camera) this.ui.camera.style.display = 'none';
                if (this.model3dManager) this.model3dManager.enableTapPlacement(false);
                if (this.ui.arStatus) this.ui.arStatus.textContent = 'WebXR AR activo';

                // Mostrar mensaje de éxito
                this.showARSuccessMessage();
            } else {
                // En Android, siempre usar fallback aunque WebXR se "inicie"
                if (isAndroid && xrOk) {
                    console.log('🤖 Android detectado: forzando fallback para mejor compatibilidad');
                    // Detener WebXR si se había iniciado
                    if (this.model3dManager && this.model3dManager.xrSession) {
                        await this.model3dManager.stopARSession();
                    }
                }
                // Fallback para Android y otros navegadores
                console.log('🔄 WebXR no disponible, usando fallback...');

                let fallbackReason = 'Fallback AR';
                if (isAndroid) {
                    if (isChrome) {
                        fallbackReason = 'AR optimizado para Chrome Android';
                    } else if (isFirefox) {
                        fallbackReason = 'AR optimizado para Firefox Android';
                    } else if (isBrave) {
                        fallbackReason = 'AR optimizado para Brave Android';
                    } else {
                        fallbackReason = 'AR optimizado para Android';
                    }
                }

                await this.setupFallbackAR(fallbackReason);
                this.showARFallbackMessage(isAndroid, isChrome, isFirefox, isBrave);
            }
        };
        startXR();

        if (this.ui.mainControls) this.ui.mainControls.style.display = 'none';
        if (this.ui.chatModal) this.ui.chatModal.style.display = 'none';

        if (this.ui.arChat) {
            this.ui.arChat.style.display = 'block';
            this.ui.arChat.style.visibility = 'visible';
            this.ui.arChat.style.opacity = '1';
            this.ui.arChat.style.zIndex = '9999';
        }

        if (this.ui.appStatus) this.ui.appStatus.textContent = '📱 Modo AR Activo';
        if (this.ui.arStatus) this.ui.arStatus.classList.remove('hidden');

        setTimeout(() => this.showARWelcome(), 1000);
    }

    async setupFallbackAR(statusText) {
        console.log('Configurando AR con cámara HTML...');

        // Crear e inicializar CameraManager si no existe
        if (!this.cameraManager) {
            console.log('Creando CameraManager...');
            this.cameraManager = new CameraManager();
        }

        // Asegurar que la cámara esté iniciada
        if (!this.cameraManager.isInitialized) {
            console.log('Iniciando cámara para fallback...');
            try {
                await this.cameraManager.init();
                console.log('Cámara iniciada para fallback');
            } catch (error) {
                console.error('❌ Error iniciando cámara:', error);
                // Continuar sin cámara
            }
        }

        if (this.ui.camera) {
            this.ui.camera.style.display = 'block';
            console.log('Cámara HTML visible');
        }

        if (this.model3dManager) {
            this.model3dManager.setVisible(true);
            this.model3dManager.setARMode(true); // Usar modo AR para fondo transparente
            this.model3dManager.enableTapPlacement(true);
            console.log('Modelo 3D configurado para fallback');
        }

        if (this.ui.arStatus) this.ui.arStatus.textContent = statusText;

        console.log('Fallback AR configurado completamente');
    }

    showARSuccessMessage() {
        if (this.ui.arResponse) {
            this.ui.arResponse.innerHTML = `
                <div style="color: #00ff88; font-size: 16px; margin-bottom: 10px;">
                    ✅ Realidad Aumentada Activada
                </div>
                <div style="color: #ccc;">Toca la pantalla para colocar el avatar en tu espacio.</div>
            `;
        }
    }

    showARFallbackMessage(isAndroid, isChrome, isFirefox, isBrave) {
        if (this.ui.arResponse) {
            let message = '📱 Realidad Aumentada Activada';
            let instructions = 'Toca la pantalla para colocar el avatar en tu espacio.';

            this.ui.arResponse.innerHTML = `
                <div style="color: #4CAF50; font-size: 16px; margin-bottom: 10px;">
                    ${message}
                </div>
                <div style="color: #ccc;">${instructions}</div>
            `;
        }
    }

    exitARMode() {
        this.isInAR = false;
        // Al salir de AR, volver a Preview para mantener el modelo visible
        this.enterPreviewMode();

        if (this.ui.arChat) this.ui.arChat.style.display = 'none';
        if (this.ui.arResponse) this.ui.arResponse.innerHTML = '';
        if (this.ui.arInput) this.ui.arInput.value = '';

        if (this.model3dManager) {
            this.model3dManager.setARMode(false);
            // Deshabilitar tap-to-place fuera de AR
            this.model3dManager.enableTapPlacement(false);
            // Restablecer pose y escala en Preview
            this.model3dManager.resetForPreview();
            // Parar sesión XR si estaba activa
            if (this.model3dManager.xrSession) {
                this.model3dManager.stopARSession();
            }
        }
    }

    toggleAR() {
        if (!this.isInitialized) {
            this.showPermissionModal();
            return;
        }

        if (this.isInAR) {
            this.exitARMode();
        } else {
            this.enterARMode();
        }
    }

    toggleModel() {
        if (!this.isInitialized) {
            this.showPermissionModal();
            return;
        }

        console.log('🔄 Toggle modelo - Preview:', this.isInPreview);

        if (this.isInPreview) {
            this.enterNormalMode();
        } else {
            this.enterPreviewMode();
        }
    }

    setupEventListeners() {
        const permissionBtn = document.getElementById('requestPermissions');
        if (permissionBtn) {
            permissionBtn.addEventListener('click', () => this.requestPermissions());
        }

        if (this.ui.arBtn) this.ui.arBtn.addEventListener('click', () => this.toggleAR());
        if (this.ui.chatBtn) this.ui.chatBtn.addEventListener('click', () => this.openChat());
        if (this.ui.voiceBtn) this.ui.voiceBtn.addEventListener('click', () => this.startVoiceInteraction());
        if (this.ui.modelBtn) this.ui.modelBtn.addEventListener('click', () => {
            if (!this.isInitialized) {
                this.showPermissionModal();
                return;
            }
            // Forzar mostrar el modelo en Preview
            this.enterPreviewMode();
            if (this.model3dManager) {
                this.model3dManager.resetForPreview();
            }
        });

        if (this.ui.sendBtn) this.ui.sendBtn.addEventListener('click', () => this.sendMessage());
        if (this.ui.closeBtn) this.ui.closeBtn.addEventListener('click', () => this.closeChat());
        if (this.ui.micBtn) this.ui.micBtn.addEventListener('click', () => this.startVoiceInteraction());

        if (this.ui.arSendBtn) this.ui.arSendBtn.addEventListener('click', () => this.sendARMessage());
        if (this.ui.arCloseBtn) this.ui.arCloseBtn.addEventListener('click', () => this.toggleAR());
        const relocateBtn = document.getElementById('arRelocateBtn');
        if (relocateBtn) relocateBtn.addEventListener('click', () => {
            if (!this.model3dManager) return;
            // Permitir recolocar: mostrar retícula y permitir tap de nuevo
            this.model3dManager.hasPlaced = false;
            // Limpiar anchor activo para permitir nueva fijación
            this.model3dManager.xrAnchor = null;
            this.model3dManager.xrAnchorSpace = null;
            if (this.model3dManager.reticle) this.model3dManager.reticle.visible = true;
            // Hint en UI
            if (this.ui && this.ui.arResponse) {
                this.ui.arResponse.innerHTML = '<div style="color:#00ff88">Recoloca: mueve el teléfono para encontrar una superficie o toca para colocar al frente.</div>';
            }
        });
        if (this.ui.arMicBtn) this.ui.arMicBtn.addEventListener('click', () => this.startVoiceInteraction(true));

        // Listeners para eventos XR (emitidos desde Model3DManager)
        if (this.model3dManager && this.model3dManager.canvas) {
            const c = this.model3dManager.canvas;
            c.addEventListener('xr-no-plane', () => {
                if (this.ui.arStatus) {
                    this.ui.arStatus.classList.remove('hidden');
                    this.ui.arStatus.textContent = 'Sin plano: toca para colocar al frente o mueve el teléfono';
                    setTimeout(() => this.ui.arStatus && this.ui.arStatus.classList.add('hidden'), 3000);
                }
            });
            c.addEventListener('xr-plane-detected', () => {
                if (this.ui.arStatus) {
                    this.ui.arStatus.classList.remove('hidden');
                    this.ui.arStatus.textContent = 'Plano detectado: toca para fijar el avatar';
                    setTimeout(() => this.ui.arStatus && this.ui.arStatus.classList.add('hidden'), 3000);
                }
            });
            c.addEventListener('xr-anchored', () => {
                if (this.ui.arStatus) {
                    this.ui.arStatus.classList.remove('hidden');
                    this.ui.arStatus.textContent = 'Anclado al mundo ✅';
                    setTimeout(() => this.ui.arStatus && this.ui.arStatus.classList.add('hidden'), 3000);
                }
            });
            c.addEventListener('xr-placed-no-anchor', () => {
                if (this.ui.arStatus) {
                    this.ui.arStatus.classList.remove('hidden');
                    this.ui.arStatus.textContent = 'Colocado (sin anchor). Puedes Recolocar cuando detecte plano';
                    setTimeout(() => this.ui.arStatus && this.ui.arStatus.classList.add('hidden'), 3000);
                }
            });
            c.addEventListener('xr-placed-fallback', () => {
                if (this.ui.arStatus) {
                    this.ui.arStatus.classList.remove('hidden');
                    this.ui.arStatus.textContent = 'Colocado al frente. Usa Recolocar para anclar';
                    setTimeout(() => this.ui.arStatus && this.ui.arStatus.classList.add('hidden'), 3000);
                }
            });
        }

        if (this.ui.userInput) {
            this.ui.userInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        if (this.ui.arInput) {
            this.ui.arInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendARMessage();
                }
            });
        }

        window.addEventListener('resize', () => {
            if (this.model3dManager) {
                this.model3dManager.handleResize();
            }
        });
    }

    async openChat() {
        if (!this.isInitialized) {
            this.showPermissionModal();
            return;
        }
        if (this.ui.chatModal) {
            this.ui.chatModal.style.display = 'flex';
        }

        if (this.ui.chatMessages && this.ui.chatMessages.children.length === 0) {
            try {
                const welcomeMsg = await this.gemini.getWelcomeMessage();
                this.addMessage('assistant', welcomeMsg);

                // NO hablar automáticamente al abrir chat - solo mostrar mensaje
                // El asistente ya se presentó al iniciar la app
                console.log('Chat abierto - mensaje mostrado sin voz para evitar repetición');

                // NO animar el modelo automáticamente al abrir chat
                // Solo mostrar el mensaje de texto
            } catch (error) {
                console.error('Error bienvenida:', error);
                this.addMessage('assistant', 'Error: No se pudo conectar con Gemini 2.0.');
            }
        }

        if (this.ui.userInput) {
            setTimeout(() => this.ui.userInput.focus(), 100);
        }
    }

    closeChat() {
        if (this.ui.chatModal) {
            this.ui.chatModal.style.display = 'none';
        }

        if (this.speech) {
            this.speech.stopSpeaking();
        }

        if ((this.isInPreview || this.isInAR) && this.model3dManager) {
            this.model3dManager.playIdleAnimation();
        }
    }

    async sendMessage() {
        if (!this.ui.userInput) return;

        const message = this.ui.userInput.value.trim();
        if (!message || this.isProcessing) return;

        this.ui.userInput.value = '';
        this.addMessage('user', message);
        await this.processMessage(message, false);
    }

    async sendARMessage() {
        if (!this.ui.arInput) return;

        const message = this.ui.arInput.value.trim();
        if (!message || this.isProcessing) return;

        this.ui.arInput.value = '';
        await this.processMessage(message, true);
    }

    async processMessage(message, isAR = false) {
        this.isProcessing = true;
        this.updateChatStatus('🤔 Preguntando a Gemini 2.0...');

        if ((this.isInPreview || this.isInAR) && this.model3dManager) {
            this.model3dManager.playThinkingAnimation();
        }

        try {
            console.log('🧠 Enviando a Gemini 2.0:', message);

            const response = await this.gemini.sendMessage(message);

            console.log('💭 Respuesta Gemini 2.0:', response);

            if (isAR && this.ui.arResponse) {
                this.ui.arResponse.innerHTML = `
                    <div style="color: #00dd88; margin-bottom: 8px; font-weight: bold;">
                        Tu pregunta: ${message}
                    </div>
                    <div>${response}</div>
                `;
            } else {
                this.addMessage('assistant', response);
            }

            if (this.speech) {
                const speechResult = this.speech.speak(response);

                // Si es iOS Safari y no se pudo hablar (TTS no activado), mostrar indicador
                if (this.speech.isIOSSafari && !speechResult) {
                    this.checkAndShowIOSTTSNotice();
                }
            }

            if ((this.isInPreview || this.isInAR) && this.model3dManager) {
                this.model3dManager.playTalkingAnimation();
            }
            this.updateChatStatus('✅ Respuesta de Gemini 2.0');

        } catch (error) {
            console.error('❌ Error Gemini 2.0:', error);
            const fallback = 'Lo siento, ahora mismo no puedo ayudarte con eso. ¿Podrías reformular tu pregunta o intentar con otro tema?';
            const suggestions = 'Sugerencias: "Cuéntame un dato curioso", "¿Qué clima hay en Madrid?", "Explícame HTML en 1 frase", "Dime un chiste corto".';

            if (isAR && this.ui.arResponse) {
                this.ui.arResponse.innerHTML = `
                    <div style="color: #ffd166;">
                        🤔 ${fallback}
                    </div>
                    <div style="margin-top:8px;color:#ddd;">${suggestions}</div>
                `;
            } else {
                this.addMessage('assistant', `${fallback}\n\n${suggestions}`);
            }

            if (this.speech) {
                const speechResult = this.speech.speak(`${fallback} ${suggestions}`);

                // Si es iOS Safari y no se pudo hablar (TTS no activado), mostrar indicador
                if (this.speech.isIOSSafari && !speechResult) {
                    this.checkAndShowIOSTTSNotice();
                }
            }

            this.updateChatStatus('');

        } finally {
            this.isProcessing = false;

            setTimeout(() => {
                if ((this.isInPreview || this.isInAR) && this.model3dManager) {
                    this.model3dManager.playIdleAnimation();
                }
                this.updateChatStatus('');
            }, 3000);
        }
    }

    async startVoiceInteraction(isAR = false) {
        if (this.isProcessing) return;
        if (!this.speech) {
            this.updateChatStatus('❌ Voz no inicializada');
            return;
        }
        if (!this.speech.isInitialized) {
            const reason = this.speech.unsupportedReason || 'Reconocimiento de voz no disponible en este navegador o contexto.';
            this.updateChatStatus(`❌ ${reason}`);

            return;
        }

        try {
            console.log('🎤 Iniciando reconocimiento...');

            if (this.speech.isIOSSafari) {
                this.updateChatStatus('🎤 Escuchando...');
            } else {
                this.updateChatStatus('🎤 Habla ahora...');
            }

            if ((this.isInPreview || this.isInAR) && this.model3dManager) {
                this.model3dManager.playListeningAnimation();
            }

            const transcript = await this.speech.listen();

            if (transcript && transcript.length > 1) {
                console.log('👂 Reconocido:', transcript);
                await this.processMessage(transcript, isAR);
            } else {
                if (this.speech.isIOSSafari) {
                    this.updateChatStatus('🍎 Listo para tu comando');
                } else {
                    this.updateChatStatus('🤷 No se detectó voz');
                }

                if ((this.isInPreview || this.isInAR) && this.model3dManager) {
                    this.model3dManager.playIdleAnimation();
                }
            }

        } catch (error) {
            console.error('❌ Error voz:', error);

            if (this.speech.isIOSSafari) {
                this.updateChatStatus('❌ Error de audio - Intenta de nuevo');
            } else {
                this.updateChatStatus('❌ Error micrófono');
            }

            if ((this.isInPreview || this.isInAR) && this.model3dManager) {
                this.model3dManager.playIdleAnimation();
            }
        }
    }

    async showWelcomeMessage() {
        if (!this.isInitialized) return;

        try {
            console.log('🤖 Mostrando mensaje de bienvenida automático...');

            const welcomeMsg = await this.gemini.getWelcomeMessage();

            // Mostrar mensaje visual en el status
            this.showStatus(`🤖 ${welcomeMsg}`, 8000);

            // Intentar hablar el mensaje de bienvenida
            if (this.speech) {
                console.log('🗣️ Intentando hablar mensaje de bienvenida...');
                const speechResult = await this.speech.speak(welcomeMsg);

                if (!speechResult && this.speech.isIOSSafari) {
                    // Si no se pudo hablar en iOS, mostrar indicador
                    console.log('🍎 TTS no activado en iOS, mostrando indicador...');
                    this.showIOSTTSNotice();
                }
            }

            // Animar el modelo si está visible
            if (this.isInPreview && this.model3dManager) {
                this.model3dManager.playTalkingAnimation();

                // Volver a idle después de hablar
                setTimeout(() => {
                    if (this.model3dManager) {
                        this.model3dManager.playIdleAnimation();
                    }
                }, 5000);
            }

        } catch (error) {
            console.error('❌ Error en mensaje de bienvenida:', error);
            // Mostrar mensaje de bienvenida básico como fallback
            const fallbackMsg = '¡Hola! Soy tu asistente virtual con IA Gemini 2.0. ¿En qué puedo ayudarte?';
            this.showStatus(`🤖 ${fallbackMsg}`, 6000);

            if (this.speech) {
                this.speech.speak(fallbackMsg);
            }
        }
    }

    async showARWelcome() {
        if (!this.isInAR || !this.ui.arResponse) return;

        try {
            const welcomeMsg = await this.gemini.getARWelcomeMessage();

            this.ui.arResponse.innerHTML = `
                <div style="color: #00ff88; font-size: 18px; margin-bottom: 10px;">
                    🤖 ¡Avatar con Gemini 2.0 en AR!
                </div>
                <div>${welcomeMsg}</div>
            `;

            if (this.speech) {
                this.speech.speak(welcomeMsg);
            }

            if (this.model3dManager) {
                this.model3dManager.playTalkingAnimation();
            }

        } catch (error) {
            console.error('Error bienvenida AR:', error);
            if (this.ui.arResponse) {
                this.ui.arResponse.innerHTML = `
                    <div style="color: #ff6b6b;">
                        ❌ Error obteniendo bienvenida de Gemini 2.0
                    </div>
                `;
            }
        }
    }

    addMessage(sender, text) {
        if (!this.ui.chatMessages) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = text;

        messageDiv.appendChild(contentDiv);
        this.ui.chatMessages.appendChild(messageDiv);

        this.ui.chatMessages.scrollTop = this.ui.chatMessages.scrollHeight;
    }

    updateChatStatus(status) {
        if (this.ui.chatStatus) {
            this.ui.chatStatus.textContent = status;
        }
    }

    updatePermissionStatus(message) {
        const statusElement = document.querySelector('.modal-content p');
        if (statusElement) {
            statusElement.textContent = message;
        }
        console.log('📋', message);
    }

    showStatus(message, duration = 3000) {
        console.log('📢 Status:', message);

        // Mostrar en el status display si existe
        if (this.ui.statusDisplay) {
            const statusContent = this.ui.statusDisplay.querySelector('.status-content');
            if (statusContent) {
                // Crear elemento temporal para el mensaje
                const statusMsg = document.createElement('div');
                statusMsg.textContent = message;
                statusMsg.style.cssText = `
                    background: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 8px 12px;
                    border-radius: 15px;
                    margin-bottom: 5px;
                    font-size: 14px;
                    animation: fadeInOut 0.3s ease-in;
                `;

                statusContent.appendChild(statusMsg);

                // Auto-remover después del duration
                setTimeout(() => {
                    if (statusMsg.parentNode) {
                        statusMsg.style.opacity = '0';
                        setTimeout(() => {
                            if (statusMsg.parentNode) {
                                statusMsg.parentNode.removeChild(statusMsg);
                            }
                        }, 300);
                    }
                }, duration);
            }
        }

        // También mostrar en chat status si está visible
        if (this.ui.chatStatus && this.ui.chatModal && this.ui.chatModal.style.display !== 'none') {
            this.updateChatStatus(message);
            setTimeout(() => {
                this.updateChatStatus('');
            }, duration);
        }
    }

    hideLoadingScreen() {
        this.isLoading = false;
        if (this.ui.loadingScreen) {
            this.ui.loadingScreen.style.opacity = '0';
            setTimeout(() => {
                this.ui.loadingScreen.style.display = 'none';
            }, 500);
        }
    }

    // ===== iOS TTS INDICATOR MANAGEMENT =====
    showIOSTTSNotice() {
        if (!this.speech?.isIOSSafari || this.speech?.iosTTSActivated) return;

        console.log('🍎📢 Mostrando indicador de activación TTS para iOS');
        if (this.ui.iosTTSNotice) {
            this.ui.iosTTSNotice.classList.remove('hidden');

            // Agregar event listener al botón de activación
            const activateBtn = this.ui.iosTTSNotice.querySelector('.tts-activate-btn');
            if (activateBtn) {
                // Remover listeners anteriores
                activateBtn.replaceWith(activateBtn.cloneNode(true));
                const newActivateBtn = this.ui.iosTTSNotice.querySelector('.tts-activate-btn');

                newActivateBtn.onclick = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('👆 Usuario presionó botón de activación TTS');
                    newActivateBtn.textContent = '🔄 Activando...';
                    newActivateBtn.disabled = true;
                    await this.activateTTSFromUserGesture();
                };

                // También agregar eventos táctiles para iOS
                newActivateBtn.ontouchstart = (e) => {
                    e.preventDefault();
                    newActivateBtn.style.transform = 'scale(0.95)';
                };

                newActivateBtn.ontouchend = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    newActivateBtn.style.transform = 'scale(1)';
                    console.log('👆 Touch: Usuario activó TTS');
                    newActivateBtn.textContent = '🔄 Activando...';
                    newActivateBtn.disabled = true;
                    await this.activateTTSFromUserGesture();
                };
            }

            // También permitir activación tocando el modal completo
            this.ui.iosTTSNotice.onclick = async (e) => {
                if (e.target === this.ui.iosTTSNotice || e.target.classList.contains('tts-notice-content')) {
                    console.log('👆 Usuario tocó modal de activación TTS');
                    await this.activateTTSFromUserGesture();
                }
            };

            // Auto-ocultar después de 3 segundos si no se activa (más rápido)
            setTimeout(() => {
                if (!this.speech?.iosTTSActivated && this.ui.iosTTSNotice && !this.ui.iosTTSNotice.classList.contains('hidden')) {
                    console.log('⏰ Auto-ocultando indicador TTS después de 3s');
                    this.hideIOSTTSNotice();
                }
            }, 3000);

            // Intentar activación automática inmediata
            setTimeout(async () => {
                if (!this.speech?.iosTTSActivated) {
                    console.log('🤖 Intentando activación automática del modal...');
                    await this.activateTTSFromUserGesture();
                }
            }, 500);
        }
    }

    async activateTTSFromUserGesture() {
        try {
            console.log('🍎🎤 Activando TTS desde gesto del usuario...');

            if (this.speech && this.speech.isIOSSafari) {
                // Mostrar feedback visual inmediato
                this.showStatus('🔊 Activando audio del asistente...');

                // Forzar activación inmediata
                const activated = await this.speech.forceActivateIOSTTS();

                if (activated) {
                    console.log('✅ TTS activado exitosamente desde gesto del usuario');
                    this.showStatus('✅ Audio del asistente activado', 2000);

                    // Si hay speech pendiente, ejecutarlo
                    if (this.speech.pendingSpeech) {
                        console.log('🗣️ Ejecutando speech pendiente:', this.speech.pendingSpeech.substring(0, 50) + '...');
                        setTimeout(async () => {
                            const success = await this.speech.speak(this.speech.pendingSpeech);
                            if (success) {
                                console.log('✅ Speech pendiente ejecutado exitosamente');
                            } else {
                                console.warn('⚠️ Falló la ejecución del speech pendiente');
                                this.showStatus('⚠️ Error reproduciendo audio. Intenta de nuevo.', 3000);
                            }
                            this.speech.pendingSpeech = null;
                        }, 500);
                    }
                } else {
                    console.warn('⚠️ No se pudo activar TTS desde gesto del usuario');
                    this.showStatus('⚠️ No se pudo activar el audio. Intenta de nuevo.', 3000);
                }
            }

            this.hideIOSTTSNotice();

        } catch (error) {
            console.error('❌ Error activando TTS desde gesto:', error);
            this.showStatus('❌ Error activando audio. Intenta de nuevo.', 3000);
            this.hideIOSTTSNotice();
        }
    }

    hideIOSTTSNotice() {
        if (this.ui.iosTTSNotice) {
            this.ui.iosTTSNotice.classList.add('hidden');
        }
    }

    checkAndShowIOSTTSNotice() {
        // Mostrar indicador si es iOS Safari y TTS no está activado
        if (this.speech?.isIOSSafari && !this.speech?.iosTTSActivated) {
            // Mostrar después de un pequeño delay para que el usuario vea la respuesta primero
            setTimeout(() => {
                this.showIOSTTSNotice();
            }, 1000);
        }
    }

    dispose() {
        if (this.cameraManager) this.cameraManager.destroy();
        if (this.model3dManager) this.model3dManager.dispose();
        if (this.speech) this.speech.dispose();
    }
}

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('Iniciando Asistente Virtual AR...');
    window.app = new VirtualAssistantApp();
});

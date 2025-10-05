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
        API_KEY: 'AIzaSyCo0VMAPnglts8T0e1Ap8x7MbtdhgsFrq4',
        MODEL: 'gemini-2.0-flash-001',
        MAX_TOKENS: 2000,
        TEMPERATURE: 0.9
    },
    GLADIA: {
        API_KEY: 'd817e425-5dde-40eb-b034-8292ade1e8a2', // ← Reemplazar con tu API key de Gladia
        ENDPOINT: 'https://api.gladia.io/v2/transcription'
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
            const response = await this.sendDirectToGemini("Test");
            return response.length > 0;
        } catch (error) {
            return false;
        }
    }

    async sendDirectToGemini(message) {
        const url = `${this.baseURL}/${this.model}:generateContent?key=${this.apiKey}`;

        // Crear AbortController para timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos timeout

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: message }] }],
                    generationConfig: {
                        temperature: CONFIG.GEMINI.TEMPERATURE,
                        maxOutputTokens: CONFIG.GEMINI.MAX_TOKENS
                    }
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
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

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Timeout: Gemini tardó demasiado en responder');
            }
            throw error;
        }
    }

    async sendMessage(message, retryCount = 0) {
        if (!this.isInitialized) {
            throw new Error('Gemini 2.0 no conectado');
        }

        try {
            const prompt = `Eres Avatar, un asistente virtual inteligente con IA Gemini 2.0.
Respondes en español de forma natural y conversacional.
Eres amigable, útil y entusiasta.

Usuario: ${message}
Avatar:`;

            const response = await this.sendDirectToGemini(prompt);

            this.addToHistory('user', message);
            this.addToHistory('assistant', response);

            return response;

        } catch (error) {
            // Reintentar hasta 2 veces en caso de error de red o timeout
            if (retryCount < 2 && (error.message.includes('Timeout') || error.message.includes('network') || error.message.includes('fetch'))) {
                console.log(`🔄 Reintentando Gemini (${retryCount + 1}/2)...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo
                return this.sendMessage(message, retryCount + 1);
            }
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
            return await this.sendDirectToGemini('Saluda al usuario como Avatar, un asistente virtual con IA Gemini 2.0. Sé amigable y entusiasta, máximo 2 frases.');
        } catch (error) {
            throw new Error('No se pudo obtener mensaje de bienvenida');
        }
    }

    async getARWelcomeMessage() {
        try {
            return await this.sendDirectToGemini('El usuario activó el modo AR. Salúdalo con entusiasmo sobre la experiencia AR con Gemini 2.0. Máximo 2 frases.');
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
        this.currentUtterance = null;
        this.voices = [];
        this.selectedVoice = null;
        this.isInitialized = false;
        this.unsupportedReason = '';
        this.lastError = '';
        // Detección de iOS/Safari
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        this.isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        this.isIOSSafari = this.isIOS && this.isSafari;
        // Fallback para iOS
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
    }

    async init() {
        try {
            console.log('🎤 Inicializando Speech Manager...');
            console.log('📱 Dispositivo detectado:', {
                isIOS: this.isIOS,
                isSafari: this.isSafari,
                isIOSSafari: this.isIOSSafari,
                userAgent: navigator.userAgent,
                isSecureContext: window.isSecureContext,
                protocol: window.location.protocol
            });

            // Verificar contexto seguro (HTTPS) especialmente importante para iOS
            if (!window.isSecureContext && this.isIOSSafari) {
                console.error('❌ iOS requiere HTTPS para acceso al micrófono');
                this.unsupportedReason = 'iOS Safari requiere HTTPS para usar el micrófono. Accede desde https://';
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

            // Solicitar permiso de micrófono explícito con mejor manejo para iOS
            try {
                console.log('🎤 Solicitando permisos de micrófono...');

                // Configuración específica para iOS
                const constraints = this.isIOSSafari ? {
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: { ideal: 16000 },
                        channelCount: { ideal: 1 }
                    }
                } : { audio: true };

                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                console.log('✅ Permisos de micrófono concedidos');

                // Verificar que el stream tiene tracks de audio activos
                const audioTracks = stream.getAudioTracks();
                if (audioTracks.length === 0) {
                    throw new Error('No se obtuvieron tracks de audio');
                }

                console.log('🎤 Tracks de audio:', audioTracks.length, 'Estado:', audioTracks[0].readyState);
                stream.getTracks().forEach(track => track.stop());

            } catch (e) {
                console.error('❌ Error al solicitar permisos:', e);

                let errorMessage = 'Acceso al micrófono denegado.';
                if (this.isIOSSafari) {
                    if (e.name === 'NotAllowedError') {
                        errorMessage = '🍎 iOS Safari: Permite el acceso al micrófono en la configuración del navegador.';
                    } else if (e.name === 'NotFoundError') {
                        errorMessage = '🍎 iOS Safari: No se encontró micrófono disponible.';
                    } else if (e.name === 'NotSupportedError') {
                        errorMessage = '🍎 iOS Safari: Micrófono no soportado en este contexto.';
                    } else {
                        errorMessage = `🍎 iOS Safari: Error de micrófono (${e.name || 'desconocido'})`;
                    }
                } else {
                    errorMessage = `Acceso al micrófono denegado: ${e.name || e.message || 'desconocido'}`;
                }

                this.unsupportedReason = errorMessage;
                return false;
            }

            console.log('🔧 Configurando Speech Recognition...');
            this.setupSpeechRecognition();

            console.log('🔧 Configurando Speech Synthesis...');
            try {
                await this.setupSpeechSynthesis();
                console.log('🔧 Speech Synthesis configurado');
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
            console.log('🍎 Configurando fallback optimizado para iOS Safari...');

            // Verificar contexto seguro primero
            if (!window.isSecureContext) {
                console.error('❌ iOS requiere contexto seguro (HTTPS)');
                this.unsupportedReason = 'iOS Safari requiere HTTPS para usar el micrófono.';
                return false;
            }

            // Verificar MediaRecorder support
            if (!('MediaRecorder' in window)) {
                console.warn('❌ MediaRecorder no disponible, usando entrada manual directa');
                this.unsupportedReason = 'iOS Safari: usará entrada manual para comandos de voz.';
                // Aún así, configurar síntesis de voz
                await this.setupSpeechSynthesis();
                this.isInitialized = true;
                return true;
            }

            // Solicitar permisos específicos para iOS con configuración optimizada y timeout
            console.log('🎤 Solicitando permisos específicos para iOS...');

            const permissionTimeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout solicitando permisos')), 10000);
            });

            const getUserMediaPromise = navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: { ideal: 16000, min: 8000, max: 48000 },
                    channelCount: { ideal: 1, min: 1, max: 2 }
                }
            });

            const stream = await Promise.race([getUserMediaPromise, permissionTimeout]);

            // Verificar que el stream es válido
            if (!stream || stream.getAudioTracks().length === 0) {
                throw new Error('Stream de audio inválido');
            }

            this.stream = stream;
            console.log('✅ Permisos de audio concedidos en iOS con configuración optimizada');
            console.log('🎤 Audio tracks:', stream.getAudioTracks().length, 'Estado:', stream.getAudioTracks()[0].readyState);

            // Configurar MediaRecorder con formato compatible con iOS - Mejorado
            let options = {};
            const supportedTypes = ['audio/mp4', 'audio/webm', 'audio/wav', 'audio/ogg'];

            for (const type of supportedTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    options.mimeType = type;
                    console.log(`✅ Usando formato soportado: ${type}`);
                    break;
                }
            }

            if (!options.mimeType) {
                console.log('🔄 Usando formato por defecto del navegador (sin especificar)');
            }

            try {
                this.mediaRecorder = new MediaRecorder(stream, options);
                console.log('🎤 MediaRecorder configurado exitosamente con:', options.mimeType || 'formato por defecto');

                // Verificar que MediaRecorder está en estado correcto
                if (this.mediaRecorder.state !== 'inactive') {
                    console.warn('⚠️ MediaRecorder no está en estado inactive:', this.mediaRecorder.state);
                }

            } catch (mediaRecorderError) {
                console.error('❌ Error creando MediaRecorder:', mediaRecorderError);
                throw new Error(`MediaRecorder falló: ${mediaRecorderError.message}`);
            }

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    console.log('📊 Chunk de audio recibido:', event.data.size, 'bytes');
                }
            };

            await this.setupSpeechSynthesis();
            this.isInitialized = true;
            console.log('✅ Fallback iOS configurado correctamente con MediaRecorder');
            return true;

        } catch (error) {
            console.error('❌ Error configurando fallback iOS:', error);

            // Diagnóstico específico del error
            let specificError = 'Error desconocido';
            if (error.name === 'NotAllowedError') {
                specificError = 'Permisos de micrófono denegados';
            } else if (error.name === 'NotFoundError') {
                specificError = 'Micrófono no encontrado';
            } else if (error.name === 'NotSupportedError') {
                specificError = 'Micrófono no soportado';
            } else if (error.message.includes('Timeout')) {
                specificError = 'Timeout solicitando permisos';
            } else if (error.message.includes('MediaRecorder')) {
                specificError = 'Error configurando MediaRecorder';
            }

            console.log(`🔍 Error específico: ${specificError}`);

            // Fallback del fallback: solo entrada manual
            console.log('🔄 Configurando modo de entrada manual únicamente para iOS');
            this.unsupportedReason = `iOS Safari: ${specificError}. Usará entrada manual para comandos de voz.`;

            try {
                await this.setupSpeechSynthesis();
                this.isInitialized = true;
                console.log('✅ Modo entrada manual configurado para iOS');
                return true;
            } catch (synthError) {
                console.error('❌ Error configurando síntesis en iOS:', synthError);
                this.unsupportedReason = 'iOS Safari: funcionalidad de voz limitada.';
                return false;
            }
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

    async listen() {
        this.showDebugAlert('🎤 LISTEN START', `isListening: ${this.isListening}, isIOSSafari: ${this.isIOSSafari}`);
        
        if (this.isListening) return null;

        // Si estamos en iOS Safari, decidir el mejor método
        if (this.isIOSSafari) {
            if (this.mediaRecorder) {
                console.log('🍎 iOS: Intentando grabación con MediaRecorder...');
                this.showDebugAlert('🍎 iOS PATH', 'Usando MediaRecorder...');
                return await this.listenIOSFallback();
            } else {
                console.log('🍎 iOS: Usando entrada manual directa');
                this.showDebugAlert('🍎 iOS PATH', 'Entrada manual directa...');
                return await this.showManualInputFallback();
            }
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
        this.showDebugAlert('🍎 iOS FALLBACK', 'Iniciando listenIOSFallback...');

        if (!this.mediaRecorder || !this.stream) {
            console.error('❌ MediaRecorder no configurado');
            this.showDebugAlert('❌ ERROR', 'MediaRecorder no configurado');
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
                this.showDebugAlert('🛑 RECORDING STOP', `audioChunks: ${this.audioChunks.length}`);

                if (this.audioChunks.length > 0) {
                    try {
                        // Crear blob de audio
                        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                        console.log('🎤 Audio capturado:', audioBlob.size, 'bytes');
                        this.showDebugAlert('🎤 AUDIO BLOB', `Size: ${audioBlob.size} bytes, Type: ${audioBlob.type}`);

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
                        this.showDebugAlert('❌ AUDIO ERROR', error.message);
                        resolve(await this.showManualInputFallback());
                    }
                } else {
                    this.showDebugAlert('❌ NO AUDIO', 'Sin chunks de audio');
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
        // MOSTRAR DEBUG EN PANTALLA PARA MÓVIL
        const debugInfo = {
            isIOSSafari: this.isIOSSafari,
            gladiaApiKey: CONFIG.GLADIA.API_KEY,
            apiKeyValid: CONFIG.GLADIA.API_KEY !== 'TU_GLADIA_API_KEY',
            audioBlobSize: audioBlob.size,
            audioBlobType: audioBlob.type
        };
        
        console.log('🔍 DEBUGGING transcribeAudioBlob - Estado actual:', debugInfo);
        this.showDebugAlert('🔍 DEBUG transcribeAudioBlob', JSON.stringify(debugInfo, null, 2));

        // 🍎 iOS Safari: Usar Gladia API para transcripción real
        if (this.isIOSSafari && CONFIG.GLADIA.API_KEY !== 'TU_GLADIA_API_KEY') {
            console.log('✅ iOS Safari: Condiciones cumplidas, intentando Gladia API...');
            this.showDebugAlert('✅ GLADIA', 'iOS Safari: Intentando Gladia API...');
            console.log('🔄 Llamando a transcribeWithGladia...');
            return await this.transcribeWithGladia(audioBlob);
        } else {
            const reason = {
                isIOSSafari: this.isIOSSafari,
                hasValidApiKey: CONFIG.GLADIA.API_KEY !== 'TU_GLADIA_API_KEY',
                apiKeyValue: CONFIG.GLADIA.API_KEY.substring(0, 10) + '...'
            };
            console.log('❌ NO usando Gladia porque:', reason);
            this.showDebugAlert('❌ NO GLADIA', JSON.stringify(reason, null, 2));
        }

        // Fallback experimental para otros casos
        try {
            console.log('🔄 Intentando transcripción experimental (fallback)...');

            // Por ahora retornamos null para usar el fallback manual
            // En el futuro se podría implementar otra API de transcripción
            return null;

        } catch (error) {
            console.warn('⚠️ Transcripción experimental falló:', error);
            return null;
        }
    }

    // ===== TRANSCRIPCIÓN CON GLADIA API (SOLO iOS/Safari) =====
    async transcribeWithGladia(audioBlob) {
        console.log('🚀 ENTRANDO a transcribeWithGladia');
        const blobDetails = {
            size: audioBlob.size,
            type: audioBlob.type,
            gladiaEndpoint: CONFIG.GLADIA.ENDPOINT,
            apiKeyLength: CONFIG.GLADIA.API_KEY.length
        };
        console.log('📊 Audio blob details:', blobDetails);
        this.showDebugAlert('🚀 GLADIA START', JSON.stringify(blobDetails, null, 2));

        // Mostrar modal de progreso con opción de cancelar
        console.log('📱 Mostrando modal de progreso Gladia...');
        const progressModal = this.showGladiaProgressModal();
        
        try {
            console.log('🔄 Enviando audio a Gladia API...', audioBlob.size, 'bytes');

            // Preparar FormData para Gladia
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            formData.append('language', 'es'); // Español
            formData.append('output_format', 'json');

            // Configurar petición con timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos
            
            // Permitir cancelar desde el modal
            progressModal.onCancel = () => {
                controller.abort();
            };

            const response = await fetch(CONFIG.GLADIA.ENDPOINT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CONFIG.GLADIA.API_KEY}`,
                    'Accept': 'application/json'
                },
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            progressModal.close();

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Gladia API Error:', response.status, errorText);
                throw new Error(`Gladia API Error ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            console.log('📝 Respuesta completa de Gladia:', result);

            // Extraer transcripción (adaptable a diferentes estructuras)
            let transcription = this.extractGladiaTranscription(result);

            if (!transcription || transcription.trim().length === 0) {
                console.warn('⚠️ Transcripción vacía de Gladia');
                return null;
            }

            console.log('✅ Transcripción Gladia obtenida:', transcription);
            return transcription.trim();

        } catch (error) {
            progressModal.close();
            console.error('❌ Error en Gladia API:', error);

            if (error.name === 'AbortError') {
                console.warn('⏰ Usuario canceló o timeout en Gladia');
                // Si el usuario canceló, mostrar directamente entrada manual
                return await this.showManualInputFallback();
            }

            // Para otros errores, retornar null para usar fallback manual
            return null;
        }
    }

    // ===== MODAL DE PROGRESO GLADIA CON CANCELAR =====
    showGladiaProgressModal() {
        console.log('🎭 Creando modal de progreso Gladia...');
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
            padding: 30px;
            border-radius: 15px;
            max-width: 90%;
            width: 400px;
            text-align: center;
            color: white;
        `;

        content.innerHTML = `
            <div style="margin-bottom: 20px;">
                <div style="width: 40px; height: 40px; border: 4px solid #333; border-top: 4px solid #4CAF50; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px;"></div>
                <h3 style="color: #fff; margin-bottom: 10px;">🤖 Transcribiendo con IA</h3>
                <p style="color: #ccc; margin-bottom: 20px;">Procesando tu audio con Gladia...</p>
                <div style="background: rgba(76,175,80,0.1); padding: 10px; border-radius: 8px; margin-bottom: 20px;">
                    <p style="color: #4CAF50; font-size: 14px; margin: 0;">
                        ⚡ Transcripción automática en progreso
                    </p>
                </div>
            </div>
            <div>
                <button id="gladiaCancel" style="background: #f44336; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 14px; margin-right: 10px;">Cancelar</button>
                <button id="gladiaManual" style="background: #2196F3; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 14px;">Escribir Manualmente</button>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        const cancelBtn = content.querySelector('#gladiaCancel');
        const manualBtn = content.querySelector('#gladiaManual');

        let onCancel = null;
        let closed = false;

        const cleanup = () => {
            if (!closed) {
                closed = true;
                document.body.removeChild(modal);
            }
        };

        cancelBtn.onclick = () => {
            cleanup();
            if (onCancel) onCancel();
        };

        manualBtn.onclick = () => {
            cleanup();
            if (onCancel) onCancel(); // Esto activará el fallback manual
        };

        return {
            close: cleanup,
            set onCancel(callback) {
                onCancel = callback;
            }
        };
    }

    // ===== EXTRAER TRANSCRIPCIÓN DE RESPUESTA GLADIA =====
    extractGladiaTranscription(result) {
        // Intentar diferentes estructuras de respuesta de Gladia
        if (result.prediction && Array.isArray(result.prediction) && result.prediction.length > 0) {
            return result.prediction[0].transcription || result.prediction[0].text;
        }

        if (result.transcription) {
            return result.transcription;
        }

        if (result.text) {
            return result.text;
        }

        if (result.results && Array.isArray(result.results) && result.results.length > 0) {
            return result.results[0].transcript || result.results[0].text;
        }

        // Búsqueda recursiva de texto
        const findTranscript = (obj) => {
            if (typeof obj === 'string' && obj.length > 0) return obj;
            if (typeof obj === 'object' && obj !== null) {
                for (const key in obj) {
                    if (key.includes('transcript') || key.includes('text') || key.includes('transcription')) {
                        const value = obj[key];
                        if (typeof value === 'string' && value.length > 0) {
                            return value;
                        }
                    }
                }
            }
            return null;
        };

        return findTranscript(result);
    }

    // ===== MOSTRAR DEBUG EN PANTALLA PARA MÓVIL =====
    showDebugAlert(title, message) {
        // Crear modal temporal para mostrar debug info
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            right: 20px;
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 15px;
            border-radius: 10px;
            z-index: 20000;
            font-family: monospace;
            font-size: 12px;
            max-height: 200px;
            overflow-y: auto;
            border: 2px solid #4CAF50;
        `;
        
        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <strong style="color: #4CAF50;">${title}</strong>
                <button onclick="this.parentElement.parentElement.remove()" style="background: #f44336; color: white; border: none; border-radius: 3px; padding: 5px 10px; cursor: pointer;">✕</button>
            </div>
            <pre style="white-space: pre-wrap; margin: 0; font-size: 11px;">${message}</pre>
        `;
        
        document.body.appendChild(modal);
        
        // Auto-remover después de 8 segundos
        setTimeout(() => {
            if (modal.parentElement) {
                modal.remove();
            }
        }, 8000);
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

            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const title = isIOS ? '🍎 Comando de Voz (iOS)' : '🎤 Comando de Voz';
            const description = isIOS ?
                'En iOS Safari, escribe tu comando directamente:' :
                'Audio grabado. Escribe lo que dijiste:';

            content.innerHTML = `
                <h3 style="color: #fff; margin-bottom: 15px;">${title}</h3>
                <p style="color: #ccc; margin-bottom: 15px;">${description}</p>
                <input type="text" id="voiceInput" placeholder="Ejemplo: Hola, ¿cómo estás?" 
                       style="width: 100%; padding: 12px; border: none; border-radius: 8px; margin-bottom: 15px; font-size: 16px; box-sizing: border-box;">
                <div style="margin-bottom: 15px; color: #aaa; font-size: 13px; line-height: 1.4;">
                    💡 Sugerencias:<br>
                    • "Cuéntame un chiste"<br>
                    • "¿Qué tiempo hace hoy?"<br>
                    • "Explica qué es la inteligencia artificial"
                </div>
                <div>
                    <button id="voiceOk" style="background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 8px; margin-right: 10px; cursor: pointer; font-size: 14px;">Enviar a Gemini</button>
                    <button id="voiceCancel" style="background: #f44336; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 14px;">Cancelar</button>
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
        if (!this.synthesis || !text) return false;

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

                this.currentUtterance.onstart = () => this.isSpeaking = true;
                this.currentUtterance.onend = () => {
                    this.isSpeaking = false;
                    this.currentUtterance = null;
                    resolve(true);
                };
                this.currentUtterance.onerror = () => {
                    this.isSpeaking = false;
                    this.currentUtterance = null;
                    resolve(false);
                };

                this.synthesis.speak(this.currentUtterance);
            });

        } catch (error) {
            return false;
        }
    }

    stopSpeaking() {
        if (this.synthesis && this.isSpeaking) {
            this.synthesis.cancel();
            this.isSpeaking = false;
            this.currentUtterance = null;
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

        // Mejorar soporte móvil: no permitir gestos del navegador
        try {
            this.canvas.style.touchAction = 'none'; // desactiva gestos por defecto (pinch/zoom del navegador)
        } catch (_) { }

        // Rueda del ratón: escala
        this._wheelHandler = (e) => {
            if (!this.model) return;
            const delta = -e.deltaY * 0.001;
            const currentScale = this.model.scale.x || 1;
            const next = THREE.MathUtils.clamp(currentScale * (1 + delta), this._controls.scaleMin, this._controls.scaleMax);
            this.model.scale.setScalar(next);
        };
        this.canvas.addEventListener('wheel', this._wheelHandler, { passive: true });

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
                case '+':
                case '=':
                    this._scaleBy(1.1); break;
                case '-':
                case '_':
                    this._scaleBy(0.9); break;
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
            // Evitar scroll/zoom del navegador
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
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
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (!this.model || !this._touch.isTouching) return;
            if (this._touch.isTwoFinger && e.touches.length >= 2) {
                // Escala
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const dist = distance(t1, t2);
                const scaleFactor = dist / Math.max(this._touch.startDist, 1);
                this._scaleBy(scaleFactor);
                this._touch.startDist = dist;

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

    _scaleBy(factor) {
        if (!this.model) return;
        const current = this.model.scale.x || 1;
        const next = THREE.MathUtils.clamp(current * factor, this._controls.scaleMin, this._controls.scaleMax);
        this.model.scale.setScalar(next);
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
            model3dCanvas: document.getElementById('model3dCanvas')
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

    async requestPermissions() {
        try {
            this.updatePermissionStatus('🔄 Inicializando...');

            // 1. Cámara
            this.updatePermissionStatus('📷 Inicializando cámara...');
            this.cameraManager = new CameraManager();
            const cameraSuccess = await this.cameraManager.init();

            if (!cameraSuccess) {
                throw new Error('No se pudo acceder a la cámara');
            }

            // 2. Gemini 2.0
            this.updatePermissionStatus('🤖 Conectando Gemini 2.0...');
            const aiSuccess = await this.gemini.init();

            if (!aiSuccess) {
                throw new Error('No se pudo conectar con Gemini 2.0');
            }

            // 3. Speech
            this.updatePermissionStatus('🎤 Configurando voz...');
            console.log('📋 Iniciando configuración de voz...');
            const speechOk = await this.speech.init();
            console.log('📋 Speech init resultado:', speechOk);
            if (!speechOk) {
                const reason = (this.speech && this.speech.unsupportedReason) ? this.speech.unsupportedReason : 'Voz no disponible';
                console.log('📋 Speech falló:', reason);
                this.updatePermissionStatus(`❌ ${reason}`);
                throw new Error(reason);
            }
            console.log('📋 ✅ Speech configurado correctamente');

            // 4. Modelo 3D (reutilizar si ya está cargado para preview)
            this.updatePermissionStatus('🎭 Preparando modelo 3D...');
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

            console.log('Sistema inicializado correctamente');

        } catch (error) {
            console.error('❌ ERROR CRÍTICO:', error);
            this.updatePermissionStatus(`❌ ${error.message}`);

            const btn = document.getElementById('requestPermissions');
            if (btn) {
                btn.textContent = '🔄 Reintentar';
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

                if (this.speech) {
                    this.speech.speak(welcomeMsg);
                }

                if (this.isInPreview && this.model3dManager) {
                    this.model3dManager.playTalkingAnimation();
                }
            } catch (error) {
                console.error('❌ Error bienvenida:', error);
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
                this.speech.speak(response);
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
                this.speech.speak(`${fallback} ${suggestions}`);
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

        console.log('🎤 startVoiceInteraction llamado, isAR:', isAR);
        console.log('🔍 Estado del sistema:', {
            speechExists: !!this.speech,
            speechInitialized: this.speech?.isInitialized,
            isIOSSafari: this.speech?.isIOSSafari,
            unsupportedReason: this.speech?.unsupportedReason
        });

        // Verificar que Speech esté inicializado
        if (!this.speech) {
            console.error('❌ Speech manager no existe');
            this.updateChatStatus('❌ Voz no inicializada');
            return;
        }
        if (!this.speech.isInitialized) {
            const reason = this.speech.unsupportedReason || 'Reconocimiento de voz no disponible en este navegador o contexto.';
            console.error('❌ Speech no inicializado:', reason);
            this.updateChatStatus(`❌ ${reason}`);

            // En iOS, mostrar sugerencias adicionales
            if (this.speech.isIOSSafari) {
                setTimeout(() => {
                    this.updateChatStatus('🍎 Sugerencia iOS: Asegúrate de estar en HTTPS y permitir micrófono');
                }, 2000);
            }
            return;
        }

        // Verificar que Gemini esté conectado ANTES de iniciar el reconocimiento
        if (!this.gemini || !this.gemini.isInitialized) {
            this.updateChatStatus('❌ Gemini no está conectado. Reintentando...');
            try {
                await this.gemini.init();
                console.log('✅ Gemini reconectado exitosamente');
            } catch (error) {
                console.error('❌ Error reconectando Gemini:', error);
                this.updateChatStatus('❌ No se pudo conectar con Gemini. Verifica tu conexión.');
                return;
            }
        }

        try {
            console.log('🎤 Iniciando reconocimiento...');

            // Mensaje específico para iOS con más información
            if (this.speech.isIOSSafari) {
                if (this.speech.mediaRecorder) {
                    this.updateChatStatus('🍎 iOS: Grabando audio... (4 segundos)');
                } else {
                    this.updateChatStatus('🍎 iOS: Preparando entrada manual...');
                }
            } else {
                this.updateChatStatus('🎤 Habla ahora...');
            }

            if ((this.isInPreview || this.isInAR) && this.model3dManager) {
                this.model3dManager.playListeningAnimation();
            }

            console.log('🔍 Llamando a speech.listen()...');
            const transcript = await this.speech.listen();
            console.log('🔍 speech.listen() retornó:', transcript);

            if (transcript && transcript.length > 1) {
                console.log('👂 Reconocido:', transcript);

                // Verificar conexión con Gemini antes de procesar
                if (!this.gemini.isInitialized) {
                    this.updateChatStatus('❌ Perdida conexión con Gemini. Reintentando...');
                    try {
                        await this.gemini.init();
                        console.log('✅ Gemini reconectado para procesar mensaje');
                    } catch (geminiError) {
                        console.error('❌ Error reconectando Gemini:', geminiError);
                        this.updateChatStatus('❌ No se pudo reconectar con Gemini');
                        return;
                    }
                }

                await this.processMessage(transcript, isAR);
            } else {
                console.log('🔍 No se obtuvo transcript válido');

                if (this.speech.isIOSSafari) {
                    // En iOS, dar más contexto sobre qué pasó
                    if (this.speech.mediaRecorder) {
                        this.updateChatStatus('🍎 iOS: No se detectó audio. Intenta hablar más fuerte.');
                    } else {
                        this.updateChatStatus('🍎 iOS: Listo para entrada manual');
                    }
                } else {
                    this.updateChatStatus('🤷 No se detectó voz');
                }

                if ((this.isInPreview || this.isInAR) && this.model3dManager) {
                    this.model3dManager.playIdleAnimation();
                }
            }

        } catch (error) {
            console.error('❌ Error voz completo:', error);
            console.error('❌ Stack trace:', error.stack);

            let errorMessage = '❌ Error micrófono';
            let suggestion = '';

            if (this.speech.isIOSSafari) {
                // Errores específicos de iOS
                if (error.name === 'NotAllowedError') {
                    errorMessage = '❌ iOS: Permisos de micrófono denegados';
                    suggestion = '📱 Ve a Configuración > Safari > Micrófono y permite el acceso';
                } else if (error.name === 'NotFoundError') {
                    errorMessage = '❌ iOS: Micrófono no encontrado';
                    suggestion = '📱 Verifica que tu dispositivo tenga micrófono';
                } else if (error.message && error.message.includes('HTTPS')) {
                    errorMessage = '❌ iOS: Requiere conexión segura';
                    suggestion = '🔒 Accede desde https:// en lugar de http://';
                } else if (error.message && error.message.includes('MediaRecorder')) {
                    errorMessage = '❌ iOS: Error de grabación';
                    suggestion = '🔄 Intentará entrada manual';
                } else {
                    errorMessage = '❌ iOS: Error de audio - Intenta de nuevo';
                    suggestion = '🍎 Asegúrate de estar en Safari actualizado';
                }
            } else if (error.message && error.message.includes('Gemini')) {
                errorMessage = '❌ Error de conexión con Gemini';
                suggestion = '🌐 Verifica tu conexión a internet';
            } else if (error.message && error.message.includes('network')) {
                errorMessage = '❌ Error de red - Verifica tu conexión';
                suggestion = '🌐 Revisa tu conexión a internet';
            } else {
                errorMessage = `❌ Error micrófono: ${error.name || error.message || 'desconocido'}`;
            }

            this.updateChatStatus(errorMessage);

            // Mostrar sugerencia después de un momento
            if (suggestion) {
                setTimeout(() => {
                    this.updateChatStatus(suggestion);
                }, 2000);
            }

            if ((this.isInPreview || this.isInAR) && this.model3dManager) {
                this.model3dManager.playIdleAnimation();
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

    hideLoadingScreen() {
        this.isLoading = false;
        if (this.ui.loadingScreen) {
            this.ui.loadingScreen.style.opacity = '0';
            setTimeout(() => {
                this.ui.loadingScreen.style.display = 'none';
            }, 500);
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

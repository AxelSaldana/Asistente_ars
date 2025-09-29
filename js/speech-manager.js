/**
 * Speech Manager - Gestión de reconocimiento y síntesis de voz
 */
import { CONFIG, DEBUG_CONFIG } from './config.js';

export class SpeechManager {
    constructor() {
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.voices = [];
        this.selectedVoice = null;
        this.isInitialized = false;
    }

    /**
     * Inicializar Speech Manager
     */
    async init() {
        try {
            this.log('🎤 Inicializando Speech Manager...');

            // Inicializar reconocimiento de voz
            this.setupSpeechRecognition();
            
            // Inicializar síntesis de voz
            await this.setupSpeechSynthesis();

            this.isInitialized = true;
            this.log('✅ Speech Manager inicializado');
            return true;

        } catch (error) {
            this.logError('❌ Error inicializando Speech Manager:', error);
            return false;
        }
    }

    /**
     * Configurar reconocimiento de voz
     */
    setupSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            throw new Error('Reconocimiento de voz no disponible en este navegador');
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();

        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = CONFIG.SPEECH.LANGUAGE;
        this.recognition.maxAlternatives = 1;

        // Event listeners
        this.recognition.onstart = () => {
            this.isListening = true;
            this.log('👂 Reconocimiento de voz iniciado');
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this.log('🛑 Reconocimiento de voz terminado');
        };

        this.recognition.onerror = (event) => {
            this.isListening = false;
            this.logError('❌ Error en reconocimiento:', event.error);
        };

        this.log('👂 Reconocimiento de voz configurado');
    }

    /**
     * Configurar síntesis de voz
     */
    async setupSpeechSynthesis() {
        if (!this.synthesis) {
            throw new Error('Síntesis de voz no disponible');
        }

        // Esperar a que las voces estén disponibles
        await this.loadVoices();
        
        // Seleccionar voz española
        this.selectSpanishVoice();

        this.log('🔊 Síntesis de voz configurada');
    }

    /**
     * Cargar voces disponibles
     */
    async loadVoices() {
        return new Promise((resolve) => {
            const getVoices = () => {
                this.voices = this.synthesis.getVoices();
                if (this.voices.length > 0) {
                    this.log(`🎭 ${this.voices.length} voces disponibles`);
                    resolve();
                } else {
                    // Intentar de nuevo en caso de que las voces no estén listas
                    setTimeout(getVoices, 100);
                }
            };

            if (this.voices.length === 0) {
                this.synthesis.onvoiceschanged = getVoices;
                getVoices();
            } else {
                resolve();
            }
        });
    }

    /**
     * Seleccionar voz española
     */
    selectSpanishVoice() {
        // Buscar voz en español
        const spanishVoices = this.voices.filter(voice => 
            voice.lang.startsWith('es') || voice.lang.includes('ES')
        );

        if (spanishVoices.length > 0) {
            // Preferir voces femeninas o con mejor calidad
            this.selectedVoice = spanishVoices.find(voice => 
                voice.name.toLowerCase().includes('female') ||
                voice.name.toLowerCase().includes('mujer') ||
                voice.name.toLowerCase().includes('maria') ||
                voice.name.toLowerCase().includes('carmen')
            ) || spanishVoices[0];

            this.log('🎭 Voz seleccionada:', this.selectedVoice.name);
        } else {
            // Usar voz por defecto
            this.selectedVoice = this.voices[0] || null;
            this.log('⚠️ No se encontró voz en español, usando por defecto');
        }
    }

    /**
     * Escuchar comando de voz
     */
    async listen() {
        if (!this.isInitialized || !this.recognition) {
            throw new Error('Reconocimiento de voz no inicializado');
        }

        if (this.isListening) {
            this.log('⚠️ Ya está escuchando');
            return null;
        }

        return new Promise((resolve, reject) => {
            // Detener cualquier síntesis en curso
            this.stopSpeaking();

            let resolved = false;

            // Timeout de seguridad
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    this.recognition.stop();
                    reject(new Error('Timeout esperando comando de voz'));
                }
            }, CONFIG.SPEECH.RECOGNITION_TIMEOUT);

            this.recognition.onresult = (event) => {
                if (resolved) return;
                resolved = true;
                
                clearTimeout(timeout);
                
                if (event.results.length > 0) {
                    const transcript = event.results[0][0].transcript;
                    this.log('👂 Texto reconocido:', transcript);
                    resolve(transcript.trim());
                } else {
                    resolve(null);
                }
            };

            this.recognition.onerror = (event) => {
                if (resolved) return;
                resolved = true;
                
                clearTimeout(timeout);
                this.logError('❌ Error en reconocimiento:', event.error);
                reject(new Error(`Error de reconocimiento: ${event.error}`));
            };

            this.recognition.onend = () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve(null);
                }
            };

            try {
                this.recognition.start();
            } catch (error) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    reject(error);
                }
            }
        });
    }

    /**
     * Hablar texto
     */
    async speak(text) {
        if (!this.isInitialized || !this.synthesis) {
            this.logError('❌ Síntesis de voz no disponible');
            return false;
        }

        if (!text || text.trim().length === 0) {
            this.log('⚠️ No hay texto para hablar');
            return false;
        }

        try {
            // Detener síntesis anterior
            this.stopSpeaking();

            this.log('🔊 Hablando:', text);

            return new Promise((resolve) => {
                this.currentUtterance = new SpeechSynthesisUtterance(text);
                
                // Configurar voz
                if (this.selectedVoice) {
                    this.currentUtterance.voice = this.selectedVoice;
                }

                // Configurar parámetros
                this.currentUtterance.rate = CONFIG.SPEECH.VOICE_RATE;
                this.currentUtterance.pitch = CONFIG.SPEECH.VOICE_PITCH;
                this.currentUtterance.volume = CONFIG.SPEECH.VOICE_VOLUME;

                // Event listeners
                this.currentUtterance.onstart = () => {
                    this.isSpeaking = true;
                    this.log('🔊 Síntesis iniciada');
                };

                this.currentUtterance.onend = () => {
                    this.isSpeaking = false;
                    this.currentUtterance = null;
                    this.log('🔊 Síntesis terminada');
                    resolve(true);
                };

                this.currentUtterance.onerror = (event) => {
                    this.isSpeaking = false;
                    this.currentUtterance = null;
                    this.logError('❌ Error en síntesis:', event.error);
                    resolve(false);
                };

                // Iniciar síntesis
                this.synthesis.speak(this.currentUtterance);
            });

        } catch (error) {
            this.logError('❌ Error hablando:', error);
            return false;
        }
    }

    /**
     * Detener síntesis
     */
    stopSpeaking() {
        if (this.synthesis && this.isSpeaking) {
            this.synthesis.cancel();
            this.isSpeaking = false;
            this.currentUtterance = null;
            this.log('🛑 Síntesis detenida');
        }
    }

    /**
     * Detener reconocimiento
     */
    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.log('🛑 Reconocimiento detenido');
        }
    }

    /**
     * Cambiar voz
     */
    setVoice(voiceName) {
        const voice = this.voices.find(v => 
            v.name === voiceName || v.name.includes(voiceName)
        );

        if (voice) {
            this.selectedVoice = voice;
            this.log('🎭 Voz cambiada a:', voice.name);
            return true;
        }

        this.log('⚠️ Voz no encontrada:', voiceName);
        return false;
    }

    /**
     * Obtener voces disponibles
     */
    getAvailableVoices() {
        return this.voices.map(voice => ({
            name: voice.name,
            lang: voice.lang,
            gender: voice.name.toLowerCase().includes('female') ? 'female' : 'male'
        }));
    }

    /**
     * Verificar soporte
     */
    checkSupport() {
        return {
            recognition: ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window),
            synthesis: 'speechSynthesis' in window,
            voicesAvailable: this.voices.length > 0
        };
    }

    /**
     * Obtener estado
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isListening: this.isListening,
            isSpeaking: this.isSpeaking,
            selectedVoice: this.selectedVoice?.name || 'Ninguna',
            voicesCount: this.voices.length
        };
    }

    /**
     * Logging
     */
    log(message, ...args) {
        if (DEBUG_CONFIG.ENABLED) {
            console.log(`[SpeechManager] ${message}`, ...args);
        }
    }

    /**
     * Error logging
     */
    logError(message, error) {
        console.error(`[SpeechManager] ${message}`, error);
    }

    /**
     * Cleanup
     */
    dispose() {
        this.stopSpeaking();
        this.stopListening();
        this.isInitialized = false;
        this.log('🗑️ Speech Manager destruido');
    }
}

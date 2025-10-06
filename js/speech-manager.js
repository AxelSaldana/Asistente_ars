/**
 * Speech Manager - Gestión de reconocimiento y síntesis de voz
 * Optimizado para iOS Safari
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
        this.unsupportedReason = '';
        this.lastError = '';

        // Detección de iOS/Safari
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        this.isSafari = /^(?!.*chrome).*safari/i.test(navigator.userAgent);
        this.isIOSSafari = this.isIOS || this.isSafari;

        // iOS audio context para desbloquear
        this.audioContext = null;
        this.audioUnlocked = false;

        // Fallback para iOS
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
    }

    /**
     * Inicializar Speech Manager
     * NUEVO: Activación de audio desde user gesture
     */
    async init() {
        try {
            console.log('🎤 Inicializando Speech Manager...');
            console.log('Dispositivo detectado:', {
                isIOS: this.isIOS,
                isSafari: this.isSafari,
                isIOSSafari: this.isIOSSafari,
                userAgent: navigator.userAgent
            });

            // CRÍTICO: Desbloquear audio en iOS desde el user gesture
            if (this.isIOSSafari) {
                console.log('🔓 Desbloqueando audio para iOS...');
                await this.unlockAudioForIOS();
            }

            // Verificar soporte de Speech Recognition
            const hasSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
            
            if (!hasSpeechRecognition) {
                if (this.isIOSSafari) {
                    console.warn('Safari en iOS: usando fallback con MediaRecorder');
                    return await this.initIOSFallback();
                } else {
                    this.unsupportedReason = 'Este navegador no soporta reconocimiento de voz. Usa Chrome/Edge en escritorio.';
                    return false;
                }
            }

            // Solicitar permiso de micrófono explícito
            try {
                console.log('🎤 Solicitando permisos de micrófono...');
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                console.log('✅ Permisos de micrófono concedidos');
                stream.getTracks().forEach(track => track.stop());
            } catch (e) {
                console.warn('⚠️ Error al solicitar permisos:', e?.name, e);
                if (this.isIOSSafari) {
                    this.unsupportedReason = 'En iOS Safari, permite el acceso al micrófono cuando se solicite.';
                } else {
                    this.unsupportedReason = 'Acceso al micrófono denegado. Permite el acceso en la configuración del navegador.';
                }
                return false;
            }

            console.log('🎤 Configurando Speech Recognition...');
            this.setupSpeechRecognition();

            console.log('🔊 Configurando Speech Synthesis...');
            try {
                await this.setupSpeechSynthesis();
                console.log('✅ Speech Synthesis configurado');
            } catch (synthError) {
                console.warn('⚠️ Error en Speech Synthesis, continuando sin TTS:', synthError);
                // Continuar sin síntesis de voz
            }

            this.isInitialized = true;
            console.log('✅ Speech Manager inicializado correctamente');
            return true;

        } catch (error) {
            console.error('❌ Error inicializando Speech Manager:', error);
            this.unsupportedReason = `No se pudo inicializar la voz: ${error?.message || 'desconocido'}`;
            return false;
        }
    }

    /**
     * NUEVO: Desbloquear audio en iOS Safari
     * Debe ejecutarse en respuesta a user gesture
     */
    async unlockAudioForIOS() {
        if (!this.isIOSSafari || this.audioUnlocked) return true;

        try {
            // Crear audio context y reproducir silencio
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            const buffer = this.audioContext.createBuffer(1, 1, 22050);
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start(0);

            this.audioUnlocked = true;
            console.log('🔓 Audio desbloqueado para iOS');
            return true;
        } catch (error) {
            console.warn('⚠️ No se pudo desbloquear audio en iOS:', error);
            return false;
        }
    }

    /**
     * Configurar fallback para iOS Safari
     */
    async initIOSFallback() {
        try {
            console.log('📱 Configurando fallback para iOS Safari...');
            
            // Verificar MediaRecorder support
            if (!('MediaRecorder' in window)) {
                this.unsupportedReason = 'Tu dispositivo iOS no soporta grabación de audio web.';
                return false;
            }

            // Solicitar permisos específicos para iOS
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000,
                    channelCount: 1
                }
            });
            this.stream = stream;
            console.log('✅ Permisos de audio concedidos en iOS');

            // Configurar MediaRecorder
            this.mediaRecorder = new MediaRecorder(stream);
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            await this.setupSpeechSynthesis();

            this.isInitialized = true;
            console.log('✅ Fallback iOS configurado correctamente');
            return true;

        } catch (error) {
            console.error('❌ Error configurando fallback iOS:', error);
            this.unsupportedReason = 'No se pudo acceder al micrófono en iOS. Asegúrate de permitir el acceso cuando se solicite.';
            return false;
        }
    }

    /**
     * Configurar reconocimiento de voz
     */
    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        this.recognition = new SpeechRecognition();
        
        // iOS-specific optimizations
        if (this.isIOSSafari) {
            this.recognition.continuous = false;      // iOS funciona mejor con continuous=false
            this.recognition.interimResults = false;  // Reduce procesamiento en iOS
            this.recognition.maxAlternatives = 1;     // Una sola alternativa para iOS
        } else {
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.maxAlternatives = 1;
        }

        this.recognition.lang = CONFIG.SPEECH.LANGUAGE;

        // Event listeners
        this.recognition.onstart = () => {
            this.isListening = true;
            console.log('👂 Reconocimiento iniciado');
        };

        this.recognition.onend = () => {
            this.isListening = false;
            console.log('🔇 Reconocimiento terminado');
        };

        this.recognition.onerror = (e) => {
            this.isListening = false;
            this.lastError = e?.error ? e.error : 'unknown-error';
            console.warn('❌ SpeechRecognition error:', this.lastError);
        };
    }

    /**
     * Configurar síntesis de voz
     */
    async setupSpeechSynthesis() {
        if (!this.synthesis) {
            console.log('❌ Speech synthesis no disponible');
            return;
        }

        return new Promise((resolve) => {
            let resolved = false;

            const loadVoices = () => {
                if (resolved) return;
                resolved = true;
                
                this.voices = this.synthesis.getVoices();
                console.log('🎭 Voces disponibles:', this.voices.length);

                const spanishVoice = this.voices.find(voice => 
                    voice.lang.startsWith('es') || voice.lang.includes('ES')
                );

                if (spanishVoice) {
                    this.selectedVoice = spanishVoice;
                    console.log('🇪🇸 Voz en español seleccionada:', spanishVoice.name);
                } else {
                    console.log('⚠️ Usando voz por defecto');
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

    /**
     * Escuchar comando de voz
     */
    async listen() {
        if (this.isListening) return null;

        // Si estamos en iOS Safari, usar el fallback
        if (this.isIOSSafari && this.mediaRecorder) {
            return await this.listenIOSFallback();
        }

        // Usar Web Speech API en navegadores compatibles
        return new Promise((resolve) => {
            // Detener cualquier síntesis en curso
            this.stopSpeaking();

            // Crear una nueva instancia para cada intento (algunos navegadores fallan en reusar)
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                console.warn('❌ Web Speech API no disponible');
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
                try {
                    rec.stop();
                } catch (e) {}
                this.isListening = false;
                resolve(val);
            };

            const timeoutMs = Math.max(5000, CONFIG.SPEECH.RECOGNITION_TIMEOUT || 8000, 12000);
            const timer = setTimeout(() => {
                console.warn('⏰ Timeout de reconocimiento');
                finish(null);
            }, timeoutMs);

            rec.onresult = (event) => {
                clearTimeout(timer);
                let text = null;
                try {
                    if (event.results && event.results.length > 0) {
                        text = event.results[0]?.[0]?.transcript?.trim();
                        console.log('👂 Texto reconocido:', text);
                    }
                } catch (e) {}
                finish(text && text.length > 0 ? text : null);
            };

            rec.onerror = (e) => {
                clearTimeout(timer);
                console.warn('❌ recognition.onerror:', e?.error, e);
                finish(null);
            };

            rec.onend = () => {
                clearTimeout(timer);
                if (!settled) {
                    console.log('🔇 Reconocimiento terminado sin resultado');
                    finish(null);
                }
            };

            try {
                console.log('🎤 Iniciando reconocimiento de voz...');
                rec.start();
            } catch (err) {
                console.warn('❌ Error al iniciar reconocimiento:', err?.message, err);
                clearTimeout(timer);
                finish(null);
            }
        });
    }

    /**
     * Fallback de escucha para iOS
     */
    async listenIOSFallback() {
        console.log('📱 Usando transcripción web para iOS...');
        
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
                        console.log('🎵 Audio capturado:', audioBlob.size, 'bytes');

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

    /**
     * Intentar transcripción de audio blob (experimental)
     */
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

    /**
     * Mostrar modal de entrada manual como fallback
     */
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
                <input type="text" id="voiceInput" placeholder="Escribe tu comando aquí..." style="width: 100%; padding: 10px; border: none; border-radius: 5px; margin-bottom: 15px; font-size: 16px;">
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

    /**
     * Hablar texto
     */
    async speak(text) {
        if (!this.synthesis || !text) return false;

        try {
            this.stopSpeaking();

            // iOS-specific preparations
            if (this.isIOSSafari && !this.audioUnlocked) {
                await this.unlockAudioForIOS();
            }

            return new Promise((resolve) => {
                this.currentUtterance = new SpeechSynthesisUtterance(text);

                if (this.selectedVoice) {
                    this.currentUtterance.voice = this.selectedVoice;
                }

                this.currentUtterance.rate = CONFIG.SPEECH.VOICE_RATE;
                this.currentUtterance.pitch = CONFIG.SPEECH.VOICE_PITCH;
                this.currentUtterance.volume = CONFIG.SPEECH.VOICE_VOLUME;

                this.currentUtterance.onstart = () => {
                    this.isSpeaking = true;
                };

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

    /**
     * Detener síntesis
     */
    stopSpeaking() {
        if (this.synthesis && this.isSpeaking) {
            this.synthesis.cancel();
            this.isSpeaking = false;
            this.currentUtterance = null;
        }
    }

    /**
     * Cleanup
     */
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

        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.isInitialized = false;
    }
}

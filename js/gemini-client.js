/**
 * Cliente Gemini - Integración con Google Gemini AI
 */
import { CONFIG, DEBUG_CONFIG } from './config.js';

export class GeminiClient {
    constructor() {
        this.apiKey = CONFIG.GEMINI.API_KEY;
        this.model = CONFIG.GEMINI.MODEL;
        this.baseURL = 'https://generativelanguage.googleapis.com/v1beta/models';
        this.isInitialized = false;
        this.conversationHistory = [];
    }

    /**
     * Inicializar cliente
     */
    async init() {
        try {
            if (!this.apiKey || this.apiKey.includes('tu-api-key')) {
                throw new Error('API Key de Gemini no configurada');
            }

            // Test de conexión
            await this.testConnection();
            this.isInitialized = true;
            
            this.log('✅ Cliente Gemini inicializado');
            return true;

        } catch (error) {
            this.logError('❌ Error inicializando Gemini:', error);
            return false;
        }
    }

    /**
     * Test de conexión
     */
    async testConnection() {
        const url = `${this.baseURL}/${this.model}:generateContent?key=${this.apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: "Test de conexión"
                    }]
                }]
            })
        });

        if (!response.ok) {
            throw new Error(`Error de conexión: ${response.status}`);
        }

        this.log('🔗 Conexión con Gemini establecida');
    }

    /**
     * Enviar mensaje a Gemini
     */
    async sendMessage(message) {
        if (!this.isInitialized) {
            throw new Error('Cliente Gemini no inicializado');
        }

        try {
            this.log('📤 Enviando mensaje a Gemini:', message);

            const url = `${this.baseURL}/${this.model}:generateContent?key=${this.apiKey}`;
            
            const requestBody = {
                contents: [{
                    parts: [{
                        text: this.buildPrompt(message)
                    }]
                }],
                generationConfig: {
                    temperature: CONFIG.GEMINI.TEMPERATURE,
                    maxOutputTokens: CONFIG.GEMINI.MAX_TOKENS
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }

            const data = await response.json();
            const reply = this.extractReply(data);

            // Guardar en historial
            this.addToHistory('user', message);
            this.addToHistory('assistant', reply);

            this.log('📥 Respuesta recibida de Gemini');
            return reply;

        } catch (error) {
            this.logError('❌ Error enviando mensaje:', error);
            throw error;
        }
    }

    /**
     * Construir prompt con contexto
     */
    buildPrompt(message) {
        const systemPrompt = `Eres un asistente virtual inteligente y amigable. 
Tu personalidad es profesional pero cercana. 
Respondes de forma clara, concisa y útil.
Puedes ayudar con información general, conversación y tareas variadas.
Mantén las respuestas en español y con un tono conversacional.

Historial de conversación:`;

        // Agregar historial reciente (últimos 6 mensajes)
        const recentHistory = this.conversationHistory.slice(-6);
        const contextHistory = recentHistory.map(msg => 
            `${msg.role}: ${msg.content}`
        ).join('\n');

        return `${systemPrompt}\n${contextHistory}\n\nUsuario: ${message}\nAsistente:`;
    }

    /**
     * Extraer respuesta del JSON de Gemini
     */
    extractReply(data) {
        try {
            if (data.candidates && data.candidates.length > 0) {
                const candidate = data.candidates[0];
                if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                    return candidate.content.parts[0].text.trim();
                }
            }
            
            throw new Error('Respuesta inválida de Gemini');
        } catch (error) {
            this.logError('❌ Error extrayendo respuesta:', error);
            throw new Error('No se pudo procesar la respuesta de Gemini');
        }
    }

    /**
     * Agregar al historial
     */
    addToHistory(role, content) {
        this.conversationHistory.push({
            role,
            content,
            timestamp: Date.now()
        });

        // Mantener solo los últimos 20 mensajes
        if (this.conversationHistory.length > 20) {
            this.conversationHistory = this.conversationHistory.slice(-20);
        }
    }

    /**
     * Obtener mensaje de bienvenida
     */
    async getWelcomeMessage() {
        try {
            if (!this.isInitialized) {
                return CONFIG.MESSAGES.WELCOME;
            }

            const welcomePrompt = "Saluda al usuario como asistente virtual y pregúntale en qué puedes ayudarlo. Sé breve y amigable.";
            return await this.sendMessage(welcomePrompt);
        } catch (error) {
            this.logError('❌ Error obteniendo mensaje de bienvenida:', error);
            return CONFIG.MESSAGES.WELCOME;
        }
    }

    /**
     * Obtener mensaje de bienvenida AR
     */
    async getARWelcomeMessage() {
        try {
            if (!this.isInitialized) {
                return CONFIG.MESSAGES.AR_WELCOME;
            }

            const arWelcomePrompt = "El usuario acaba de activar el modo AR (Realidad Aumentada). Salúdalo y explícale brevemente que puede interactuar contigo mediante texto o voz en este modo AR. Sé entusiasta pero conciso.";
            return await this.sendMessage(arWelcomePrompt);
        } catch (error) {
            this.logError('❌ Error obteniendo mensaje de bienvenida AR:', error);
            return CONFIG.MESSAGES.AR_WELCOME;
        }
    }

    /**
     * Generar respuesta contextual
     */
    async generateContextualResponse(context, message) {
        try {
            const contextPrompt = `Contexto: ${context}\n\nUsuario pregunta: ${message}\n\nResponde considerando el contexto proporcionado.`;
            return await this.sendMessage(contextPrompt);
        } catch (error) {
            this.logError('❌ Error generando respuesta contextual:', error);
            return 'Lo siento, no pude procesar tu solicitud en este momento.';
        }
    }

    /**
     * Limpiar historial
     */
    clearHistory() {
        this.conversationHistory = [];
        this.log('🗑️ Historial de conversación limpiado');
    }

    /**
     * Obtener estadísticas
     */
    getStats() {
        return {
            isInitialized: this.isInitialized,
            messagesInHistory: this.conversationHistory.length,
            apiKeyConfigured: !this.apiKey.includes('tu-api-key')
        };
    }

    /**
     * Validar configuración
     */
    validateConfig() {
        const issues = [];

        if (!this.apiKey || this.apiKey.includes('tu-api-key')) {
            issues.push('API Key de Gemini no configurada');
        }

        if (!this.model) {
            issues.push('Modelo de Gemini no especificado');
        }

        return {
            isValid: issues.length === 0,
            issues
        };
    }

    /**
     * Logging
     */
    log(message, ...args) {
        if (DEBUG_CONFIG.ENABLED) {
            console.log(`[GeminiClient] ${message}`, ...args);
        }
    }

    /**
     * Error logging
     */
    logError(message, error) {
        console.error(`[GeminiClient] ${message}`, error);
    }

    /**
     * Cleanup
     */
    dispose() {
        this.clearHistory();
        this.isInitialized = false;
        this.log('🗑️ Cliente Gemini destruido');
    }
}

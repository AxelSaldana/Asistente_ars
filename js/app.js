/**
 * Asistente Virtual AR - SIMPLE Y DIRECTO
 * Modelo: models/avatar_prueba.glb
 */

// ===== CONFIGURACIÓN SIMPLE =====
const CONFIG = {
    MODEL: {
        PATH: 'models/avatar_prueba.glb', // ← RUTA DIRECTA
        SCALE: 1.0,
        ANIMATIONS: {
            IDLE: 'idle',
            TALKING: 'talking', 
            THINKING: 'thinking',
            LISTENING: 'listening'
        }
    },
    GEMINI: {
        API_KEY: 'AIzaSyCo0VMAPnglts8T0e1Ap8x7MbtdhgsFrq4',
        MODEL: 'gemini-2.0-flash-001',
        MAX_TOKENS: 2000,
        TEMPERATURE: 0.9
    },
    SPEECH: {
        LANGUAGE: 'es-ES',
        VOICE_RATE: 1.0,
        VOICE_PITCH: 1.0,
        VOICE_VOLUME: 1.0,
        RECOGNITION_TIMEOUT: 8000
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
            console.log('🤖 CONECTANDO GEMINI 2.0...');
            
            const testResult = await this.testConnection();
            if (testResult) {
                this.isInitialized = true;
                console.log('✅ GEMINI 2.0 CONECTADO!');
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
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.voices = [];
        this.selectedVoice = null;
        this.isInitialized = false;
    }

    async init() {
        try {
            if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                return false;
            }

            this.setupSpeechRecognition();
            await this.setupSpeechSynthesis();
            
            this.isInitialized = true;
            return true;
        } catch (error) {
            return false;
        }
    }

    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();

        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = CONFIG.SPEECH.LANGUAGE;
        this.recognition.maxAlternatives = 1;

        this.recognition.onstart = () => this.isListening = true;
        this.recognition.onend = () => this.isListening = false;
        this.recognition.onerror = () => this.isListening = false;
    }

    async setupSpeechSynthesis() {
        return new Promise((resolve) => {
            const loadVoices = () => {
                this.voices = this.synthesis.getVoices();
                
                if (this.voices.length > 0) {
                    const spanishVoices = this.voices.filter(voice => 
                        voice.lang.includes('es') || voice.lang.includes('ES')
                    );
                    
                    this.selectedVoice = spanishVoices.length > 0 ? spanishVoices[0] : this.voices[0];
                    resolve();
                } else {
                    setTimeout(loadVoices, 100);
                }
            };

            this.synthesis.onvoiceschanged = loadVoices;
            loadVoices();
        });
    }

    async listen() {
        if (!this.recognition || this.isListening) return null;

        return new Promise((resolve) => {
            this.stopSpeaking();

            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    try { this.recognition.stop(); } catch (e) {}
                    resolve(null);
                }
            }, CONFIG.SPEECH.RECOGNITION_TIMEOUT);

            this.recognition.onresult = (event) => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeout);
                
                if (event.results.length > 0) {
                    const transcript = event.results[0][0].transcript;
                    resolve(transcript.trim());
                } else {
                    resolve(null);
                }
            };

            this.recognition.onerror = () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve(null);
                }
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
                    resolve(null);
                }
            }
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
    }

    async init() {
        try {
            console.log('🎭 Inicializando Model 3D...');
            
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
                console.log('✅ TU MODELO CARGADO!');
            } catch (error) {
                console.warn('⚠️ No se pudo cargar tu modelo:', error);
                this.createTemporaryModel();
            }
            
            this.startRenderLoop();
            console.log('✅ Model 3D Manager listo');
        } catch (error) {
            console.error('❌ Error Model 3D:', error);
            this.createTemporaryModel();
            this.startRenderLoop();
        }
    }

    async loadModel() {
        return new Promise((resolve, reject) => {
            console.log('📦 CARGANDO:', CONFIG.MODEL.PATH);
            
            const loader = new THREE.GLTFLoader();
            
            // Configurar DRACO si está disponible
            if (THREE.DRACOLoader) {
                const dracoLoader = new THREE.DRACOLoader();
                dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
                loader.setDRACOLoader(dracoLoader);
                console.log('🗜️ DRACO configurado');
            }
            
            loader.load(
                CONFIG.MODEL.PATH,
                (gltf) => {
                    console.log('🎉 ¡AVATAR_PRUEBA.GLB CARGADO!');
                    
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
                    const percent = Math.round((progress.loaded / progress.total) * 100);
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
        console.log('🔧 Creando modelo temporal visible...');
        
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
        
        console.log('✅ CUBO ROJO TEMPORAL CREADO');
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
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = this.isARMode ? null : new THREE.Color(0x87CEEB);
        
        // Grid para referencia
        const gridHelper = new THREE.GridHelper(10, 10);
        gridHelper.position.y = 0;
        this.scene.add(gridHelper);
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
        } else {
            this.scene.background = new THREE.Color(0x87CEEB);
            this.renderer.setClearColor(0x87CEEB, 1);
        }
    }

    setVisible(visible) {
        this.isVisible = visible;
        if (this.canvas) {
            this.canvas.style.display = visible ? 'block' : 'none';
            this.canvas.style.visibility = visible ? 'visible' : 'hidden';
            console.log('👁️ Modelo visible:', visible);
        }
    }

    handleResize() {
        if (!this.camera || !this.renderer) return;

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
            if (this.model) {
                this.model.rotation.y += 0.005;
            }

            // Renderizar cuando visible
            if (this.isVisible && this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
        };

        animate();
        console.log('🎬 Renderizado iniciado');
    }

    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
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
            this.setupEventListeners();
            this.showPermissionModal();
        } catch (error) {
            console.error('❌ Error inicializando:', error);
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
            await this.speech.init();

            // 4. Modelo 3D
            this.updatePermissionStatus('🎭 Cargando models/avatar_prueba.glb...');
            this.model3dManager = new Model3DManager(this.ui.model3dCanvas);
            await this.model3dManager.init();

            // 5. Listo
            this.isInitialized = true;
            this.hidePermissionModal();
            this.hideLoadingScreen();
            this.enterNormalMode();

            console.log('🎉 ¡Sistema completo!');

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
        console.log('🎭 Mostrando modelo...');
        
        this.isInPreview = true;
        this.isInAR = false;

        if (this.ui.camera) this.ui.camera.style.display = 'none';
        if (this.model3dManager) {
            this.model3dManager.setVisible(true);
            this.model3dManager.setARMode(false);
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

        console.log('✅ Modelo visible');
    }

    enterARMode() {
        this.isInAR = true;
        this.isInPreview = false;

        if (this.ui.camera) this.ui.camera.style.display = 'block';
        if (this.model3dManager) {
            this.model3dManager.setVisible(true);
            this.model3dManager.setARMode(true);
        }

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

    exitARMode() {
        this.isInAR = false;
        this.enterNormalMode();

        if (this.ui.arChat) this.ui.arChat.style.display = 'none';
        if (this.ui.arResponse) this.ui.arResponse.innerHTML = '';
        if (this.ui.arInput) this.ui.arInput.value = '';

        if (this.model3dManager) this.model3dManager.setARMode(false);
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
        if (this.ui.modelBtn) this.ui.modelBtn.addEventListener('click', () => this.toggleModel());

        if (this.ui.sendBtn) this.ui.sendBtn.addEventListener('click', () => this.sendMessage());
        if (this.ui.closeBtn) this.ui.closeBtn.addEventListener('click', () => this.closeChat());
        if (this.ui.micBtn) this.ui.micBtn.addEventListener('click', () => this.startVoiceInteraction());

        if (this.ui.arSendBtn) this.ui.arSendBtn.addEventListener('click', () => this.sendARMessage());
        if (this.ui.arCloseBtn) this.ui.arCloseBtn.addEventListener('click', () => this.toggleAR());
        if (this.ui.arMicBtn) this.ui.arMicBtn.addEventListener('click', () => this.startVoiceInteraction(true));

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
            const errorMsg = `Error Gemini 2.0: ${error.message}`;

            if (isAR && this.ui.arResponse) {
                this.ui.arResponse.innerHTML = `<div style="color: #ff6b6b;">❌ ${errorMsg}</div>`;
            } else {
                this.addMessage('assistant', errorMsg);
            }

            this.updateChatStatus('❌ Error Gemini 2.0');
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
        if (this.isProcessing || !this.speech) return;

        try {
            console.log('🎤 Iniciando reconocimiento...');
            this.updateChatStatus('🎤 Habla ahora...');
            
            if ((this.isInPreview || this.isInAR) && this.model3dManager) {
                this.model3dManager.playListeningAnimation();
            }

            const transcript = await this.speech.listen();
            
            if (transcript && transcript.length > 1) {
                console.log('👂 Reconocido:', transcript);
                await this.processMessage(transcript, isAR);
            } else {
                this.updateChatStatus('🤷 No se detectó voz');
                
                if ((this.isInPreview || this.isInAR) && this.model3dManager) {
                    this.model3dManager.playIdleAnimation();
                }
            }

        } catch (error) {
            console.error('❌ Error voz:', error);
            this.updateChatStatus('❌ Error micrófono');
            
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
    console.log('🎉 Iniciando Asistente Virtual AR...');
    window.app = new VirtualAssistantApp();
});

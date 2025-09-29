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
    SPEECH: {
        LANGUAGE: 'es-ES',
        VOICE_RATE: 1.0,
        VOICE_PITCH: 1.0,
        VOICE_VOLUME: 1.0,
        RECOGNITION_TIMEOUT: 15000
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
        this.synthesis = (typeof window !== 'undefined' && 'speechSynthesis' in window) ? window.speechSynthesis : null;
        this.isListening = false;
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.voices = [];
        this.selectedVoice = null;
        this.isInitialized = false;
        this.unsupportedReason = '';
        this.lastError = '';
    }

    async init() {
        try {
            if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                this.unsupportedReason = 'Este navegador no soporta reconocimiento de voz. Usa Chrome/Edge en escritorio o HTTPS en móvil.';
                return false;
            }

            // Solicitar permiso de micrófono explícito en móvil (algunos navegadores lo requieren antes)
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
            } catch (e) {
                // Si falla, continuamos: SpeechRecognition podría aún pedir permiso al iniciar
                console.warn('🎤 Permiso de micrófono (getUserMedia) falló o fue denegado inicialmente:', e?.name || e);
            }

            this.setupSpeechRecognition();
            if (typeof this.setupSpeechSynthesis === 'function') {
                await this.setupSpeechSynthesis();
            } else {
                console.warn('setupSpeechSynthesis no disponible; continuo sin TTS');
            }

            this.isInitialized = true;
            return true;
        } catch (error) {
            this.unsupportedReason = 'No se pudo inicializar la voz: ' + (error?.message || 'desconocido');
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

        this.recognition.onstart = () => { this.isListening = true; };
        this.recognition.onend = () => { this.isListening = false; };
        this.recognition.onerror = (e) => {
            this.isListening = false;
            this.lastError = e && e.error ? e.error : 'unknown_error';
            console.warn('🎤 SpeechRecognition error:', this.lastError);
        };
    }

    async listen() {
        if (this.isListening) return null;

        return new Promise((resolve) => {
            // detener cualquier síntesis en curso
            this.stopSpeaking();

            // Crear una nueva instancia para cada intento (algunos navegadores fallan en reusar)
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) return resolve(null);
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
                try { rec.stop(); } catch (_) {}
                this.isListening = false;
                resolve(val);
            };

            const timeoutMs = Math.max(5000, (CONFIG.SPEECH.RECOGNITION_TIMEOUT || 8000), 12000);
            const timer = setTimeout(() => finish(null), timeoutMs);

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
                    }
                } catch (_) {}
                finish(text && text.length > 0 ? text : null);
            };

            rec.onerror = (e) => {
                clearTimeout(timer);
                console.warn('🎤 recognition.onerror:', e?.error || e);
                finish(null);
            };

            rec.onend = () => {
                clearTimeout(timer);
                finish(null);
            };

            try {
                rec.start();
            } catch (err) {
                console.warn('🎤 start error:', err?.message || err);
                clearTimeout(timer);
                finish(null);
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
        this.defaultScale = (CONFIG && CONFIG.MODEL && CONFIG.MODEL.SCALE) ? CONFIG.MODEL.SCALE : 1.0;
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
            // Activar controles interactivos
            this.enableControls();

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
        } else {
            this.scene.background = new THREE.Color(0x87CEEB);
            this.renderer.setClearColor(0x87CEEB, 1);
        }
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
            this._tapHandler = (e) => {
                e.preventDefault();
                handleTap(e.clientX, e.clientY);
            };
            this._touchEndHandler = (e) => {
                if (!e.changedTouches || e.changedTouches.length === 0) return;
                const t = e.changedTouches[0];
                e.preventDefault();
                handleTap(t.clientX, t.clientY);
            };
            this.canvas.addEventListener('click', this._tapHandler, { passive: false });
            this.canvas.addEventListener('touchend', this._touchEndHandler, { passive: false });
        } else {
            if (this._tapHandler) this.canvas.removeEventListener('click', this._tapHandler);
            if (this._touchEndHandler) this.canvas.removeEventListener('touchend', this._touchEndHandler);
            this._tapHandler = null;
            this._touchEndHandler = null;
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
        } catch (_) {}
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
            if (this.isVisible && this.renderer && this.scene && this.camera) {
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
                    this.model.position.x += dx;
                    this.model.position.y -= dy;
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
            const speechOk = await this.speech.init();
            if (!speechOk) {
                const reason = (this.speech && this.speech.unsupportedReason) ? this.speech.unsupportedReason : 'Voz no disponible';
                this.updatePermissionStatus(`❌ ${reason}`);
                throw new Error(reason);
            }

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

        console.log('✅ Modelo visible');
    }

    enterARMode() {
        this.isInAR = true;
        this.isInPreview = false;

        if (this.ui.camera) this.ui.camera.style.display = 'block';
        if (this.model3dManager) {
            this.model3dManager.setVisible(true);
            this.model3dManager.setARMode(true);
            // Habilitar tap-to-place en AR
            this.model3dManager.enableTapPlacement(true);
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

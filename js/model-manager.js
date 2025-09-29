/**
 * Model 3D Manager - Gestión de modelos 3D con Three.js
 */
export class Model3DManager {
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
    }

    /**
     * Inicializar Three.js
     */
    async init() {
        try {
            console.log('🎭 Inicializando Model 3D Manager...');

            this.setupRenderer();
            this.setupScene();
            this.setupCamera();
            this.setupLights();
            await this.loadModel();
            this.startRenderLoop();

            console.log('✅ Model 3D Manager inicializado');
        } catch (error) {
            console.error('❌ Error inicializando Model 3D Manager:', error);
            this.createFallbackModel();
        }
    }

    /**
     * Configurar renderer
     */
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

    /**
     * Configurar escena
     */
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = this.isARMode ? null : new THREE.Color(0x87CEEB);
    }

    /**
     * Configurar cámara
     */
    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );
        this.camera.position.set(0, 1.6, 3);
        this.camera.lookAt(0, 1, 0);
    }

    /**
     * Configurar luces
     */
    setupLights() {
        // Luz ambiental
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);

        // Luz direccional
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);

        // Luz puntual
        const pointLight = new THREE.PointLight(0xffffff, 0.5);
        pointLight.position.set(-10, 10, -10);
        this.scene.add(pointLight);
    }

    /**
     * Cargar modelo 3D
     */
    async loadModel() {
        return new Promise((resolve, reject) => {
            const loader = new THREE.GLTFLoader();
            
            loader.load(
                `${CONFIG.MODEL.PATH}${CONFIG.MODEL.FILE_NAME}`,
                (gltf) => {
                    console.log('📦 Modelo cargado exitosamente');
                    
                    this.model = gltf.scene;
                    this.model.scale.setScalar(CONFIG.MODEL.SCALE);
                    this.model.position.set(0, 0, 0);
                    
                    // Configurar sombras
                    this.model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    this.scene.add(this.model);

                    // Configurar animaciones
                    if (gltf.animations && gltf.animations.length > 0) {
                        this.setupAnimations(gltf.animations);
                    }

                    resolve();
                },
                (progress) => {
                    console.log('📥 Progreso carga modelo:', 
                        (progress.loaded / progress.total * 100) + '%');
                },
                (error) => {
                    console.error('❌ Error cargando modelo:', error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Configurar animaciones
     */
    setupAnimations(animations) {
        this.mixer = new THREE.AnimationMixer(this.model);
        
        animations.forEach((clip) => {
            const action = this.mixer.clipAction(clip);
            this.animations[clip.name.toLowerCase()] = action;
            console.log('🎬 Animación registrada:', clip.name);
        });

        // Iniciar animación idle
        this.playIdleAnimation();
    }

    /**
     * Crear modelo de fallback
     */
    createFallbackModel() {
        console.log('🔧 Creando modelo de fallback...');
        
        const geometry = new THREE.BoxGeometry(1, 2, 1);
        const material = new THREE.MeshPhongMaterial({ 
            color: 0x4a90e2,
            transparent: true,
            opacity: 0.8
        });
        
        this.model = new THREE.Mesh(geometry, material);
        this.model.position.set(0, 1, 0);
        this.model.castShadow = true;
        this.model.receiveShadow = true;
        
        this.scene.add(this.model);

        // Animación simple de rotación
        this.startFallbackAnimation();
    }

    /**
     * Animación de fallback
     */
    startFallbackAnimation() {
        const animate = () => {
            if (this.model) {
                this.model.rotation.y += 0.01;
            }
        };
        
        this.fallbackAnimation = animate;
    }

    /**
     * Reproducir animación idle
     */
    playIdleAnimation() {
        this.playAnimation(CONFIG.MODEL.ANIMATIONS.IDLE);
    }

    /**
     * Reproducir animación de hablar
     */
    playTalkingAnimation() {
        this.playAnimation(CONFIG.MODEL.ANIMATIONS.TALKING);
    }

    /**
     * Reproducir animación de pensar
     */
    playThinkingAnimation() {
        this.playAnimation(CONFIG.MODEL.ANIMATIONS.THINKING);
    }

    /**
     * Reproducir animación de escuchar
     */
    playListeningAnimation() {
        this.playAnimation(CONFIG.MODEL.ANIMATIONS.LISTENING);
    }

    /**
     * Reproducir animación específica
     */
    playAnimation(animationName) {
        if (!this.mixer || !animationName) {
            return;
        }

        const action = this.animations[animationName.toLowerCase()];
        if (!action) {
            console.warn('⚠️ Animación no encontrada:', animationName);
            return;
        }

        // Detener animación actual
        if (this.currentAnimation && this.currentAnimation !== action) {
            this.currentAnimation.fadeOut(0.3);
        }

        // Iniciar nueva animación
        action.reset().fadeIn(0.3).play();
        this.currentAnimation = action;

        console.log('🎬 Reproduciendo animación:', animationName);
    }

    /**
     * Configurar modo AR
     */
    setARMode(isAR) {
        this.isARMode = isAR;
        
        if (isAR) {
            // Modo AR: fondo transparente
            this.scene.background = null;
            this.renderer.setClearColor(0x000000, 0);
        } else {
            // Modo preview: fondo con color
            this.scene.background = new THREE.Color(0x87CEEB);
            this.renderer.setClearColor(0x87CEEB, 1);
        }
        
        console.log('🔄 Modo AR:', isAR ? 'Activado' : 'Desactivado');
    }

    /**
     * Manejar redimensionamiento
     */
    handleResize() {
        if (!this.camera || !this.renderer) return;

        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Loop de renderizado
     */
    startRenderLoop() {
        const animate = () => {
            requestAnimationFrame(animate);

            const deltaTime = this.clock.getDelta();

            // Actualizar mixer de animaciones
            if (this.mixer) {
                this.mixer.update(deltaTime);
            }

            // Animación de fallback
            if (this.fallbackAnimation) {
                this.fallbackAnimation();
            }

            // Renderizar
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
        };

        animate();
    }

    /**
     * Cleanup
     */
    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        if (this.mixer) {
            this.mixer.uncacheRoot(this.mixer.getRoot());
        }
        
        console.log('🗑️ Model 3D Manager destruido');
    }
}

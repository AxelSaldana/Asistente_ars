/**
 * Camera Manager - Gestión de cámara para AR
 * IGUAL QUE EL PROYECTO QUE FUNCIONA
 */
export class CameraManager {
    constructor() {
        this.videoElement = null;
        this.stream = null;
        this.isInitialized = false;
        
        this.constraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 }
            },
            audio: false
        };
    }

    /**
     * Inicializar cámara
     */
    async init() {
        try {
            console.log('📷 Inicializando cámara...');

            // Obtener elemento video
            this.videoElement = document.getElementById('camera');
            if (!this.videoElement) {
                throw new Error('Elemento de video no encontrado');
            }

            // Solicitar permisos y iniciar stream
            await this.requestCameraPermission();
            await this.startCamera();
            this.setupVideoEvents();

            this.isInitialized = true;
            console.log('✅ Cámara inicializada correctamente');
            return true;

        } catch (error) {
            console.error('❌ Error inicializando cámara:', error);
            this.handleCameraError(error);
            return false;
        }
    }

    /**
     * Solicitar permiso de cámara
     */
    async requestCameraPermission() {
        try {
            // Verificar si hay permisos
            const permissions = await navigator.permissions.query({ name: 'camera' });
            if (permissions.state === 'denied') {
                throw new Error('Permisos de cámara denegados');
            }
            return true;
        } catch (error) {
            console.warn('⚠️ No se pudo verificar permisos:', error);
            return true; // Continuar de todas formas
        }
    }

    /**
     * Iniciar stream de cámara
     */
    async startCamera() {
        try {
            console.log('🎥 Solicitando acceso a cámara...');
            
            this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
            this.videoElement.srcObject = this.stream;

            return new Promise((resolve, reject) => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play().then(() => {
                        console.log('✅ Stream de cámara iniciado');
                        resolve();
                    }).catch(reject);
                };

                this.videoElement.onerror = (error) => {
                    reject(new Error('Error reproduciendo video: ' + error));
                };

                // Timeout de seguridad
                setTimeout(() => {
                    reject(new Error('Timeout iniciando cámara'));
                }, 10000);
            });

        } catch (error) {
            throw new Error('Error accediendo a cámara: ' + error.message);
        }
    }

    /**
     * Configurar eventos del video
     */
    setupVideoEvents() {
        this.videoElement.addEventListener('loadeddata', () => {
            console.log('📹 Video data cargado');
        });

        this.videoElement.addEventListener('play', () => {
            console.log('▶️ Video reproduciendo');
        });

        this.videoElement.addEventListener('pause', () => {
            console.log('⏸️ Video pausado');
        });
    }

    /**
     * Manejar errores de cámara
     */
    handleCameraError(error) {
        let userMessage = 'Error desconocido con la cámara';

        if (error.name === 'NotAllowedError') {
            userMessage = 'Acceso a cámara denegado. Por favor, permite el acceso e intenta de nuevo.';
        } else if (error.name === 'NotFoundError') {
            userMessage = 'No se encontró ninguna cámara en tu dispositivo.';
        } else if (error.name === 'NotReadableError') {
            userMessage = 'La cámara está siendo utilizada por otra aplicación.';
        } else if (error.name === 'OverconstrainedError') {
            userMessage = 'La configuración de cámara solicitada no es compatible.';
        }

        console.error('❌ Error de cámara:', error.name, error.message);
        this.showCameraError(userMessage);
    }

    /**
     * Mostrar error de cámara al usuario
     */
    showCameraError(message) {
        const statusElement = document.querySelector('.modal-content p');
        if (statusElement) {
            statusElement.textContent = `❌ ${message}`;
        }
    }

    /**
     * Detener cámara
     */
    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
            });
            this.stream = null;
        }

        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }

        this.isInitialized = false;
        console.log('🛑 Cámara detenida');
    }

    /**
     * Reiniciar cámara
     */
    async restart() {
        this.stop();
        return await this.init();
    }

    /**
     * Obtener frame actual como imagen
     */
    captureFrame() {
        if (!this.videoElement || !this.isInitialized) {
            throw new Error('Cámara no inicializada');
        }

        const canvas = document.createElement('canvas');
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.videoElement, 0, 0);
        
        return canvas.toDataURL('image/jpeg');
    }

    /**
     * Cambiar cámara (frontal/trasera)
     */
    async switchCamera() {
        if (!this.isInitialized) return false;

        try {
            const currentFacingMode = this.constraints.video.facingMode.ideal;
            this.constraints.video.facingMode.ideal = 
                currentFacingMode === 'environment' ? 'user' : 'environment';

            await this.restart();
            return true;

        } catch (error) {
            console.error('❌ Error cambiando cámara:', error);
            return false;
        }
    }

    /**
     * Obtener capacidades de la cámara
     */
    getCapabilities() {
        if (!this.stream) return null;

        const videoTrack = this.stream.getVideoTracks()[0];
        return videoTrack ? videoTrack.getCapabilities() : null;
    }

    /**
     * Cleanup
     */
    destroy() {
        this.stop();
        console.log('🗑️ Camera Manager destruido');
    }
}

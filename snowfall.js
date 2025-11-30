/**
 * SnowFall.js
 * A drop-in library for realistic snow simulation with DOM interaction.
 * Zero dependencies. No external CSS required.
 * * Usage:
 * SnowFall.init({
 * flakeCount: 500,
 * collectSelectors: ['.nav', '#hero', '.card']
 * });
 */

(function (window) {
    'use strict';

    // Default Configuration
    const DEFAULTS = {
        flakeCount: 400,
        gravity: 0.7,           // Downward speed
        wind: 0.5,              // Horizontal speed
        sizeBase: 3,            // Base size of flakes
        stickiness: 0.9,        // Chance to stick (0-1)
        meltSpeed: 0.005,       // Speed at which piled snow disappears
        collectSelectors: [],   // Array of CSS selectors to collect snow, e.g. ['.nav', '#banner']
        mouseInteraction: true, // Enable mouse repulsion
        mouseRepulsionRadius: 150,
        zIndex: 99999
    };

    class SnowSystem {
        constructor() {
            this.config = {};
            this.flakes = [];
            this.obstacles = [];
            this.canvas = null;
            this.ctx = null;
            this.width = 0;
            this.height = 0;
            this.mouse = { x: -999, y: -999 };
            this.isRunning = false;
        }

        /**
         * Initialize the snow simulation
         * @param {Object} options - User configuration overrides
         */
        init(options = {}) {
            if (this.isRunning) return; // Prevent double init
            
            this.config = { ...DEFAULTS, ...options };
            
            this.createCanvas();
            this.bindEvents();
            this.resize();
            this.spawnFlakes();
            this.loop();
            
            this.isRunning = true;
        }

        createCanvas() {
            this.canvas = document.createElement('canvas');
            this.canvas.id = 'snow-fall-canvas';
            
            // Apply critical styles directly (No external CSS file needed)
            this.canvas.style.position = 'fixed';
            this.canvas.style.top = '0';
            this.canvas.style.left = '0';
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.style.pointerEvents = 'none'; // Click-through
            this.canvas.style.zIndex = this.config.zIndex;
            
            this.ctx = this.canvas.getContext('2d');
            document.body.appendChild(this.canvas);
        }

        bindEvents() {
            window.addEventListener('resize', () => this.resize());
            window.addEventListener('scroll', () => this.updateObstacles());
            
            if (this.config.mouseInteraction) {
                window.addEventListener('mousemove', (e) => {
                    this.mouse.x = e.clientX;
                    this.mouse.y = e.clientY;
                });
            }
        }

        resize() {
            this.width = this.canvas.width = window.innerWidth;
            this.height = this.canvas.height = window.innerHeight;
            this.updateObstacles();
        }

        updateObstacles() {
            if (!this.config.collectSelectors || this.config.collectSelectors.length === 0) {
                this.obstacles = [];
                return;
            }

            // Flatten all selectors into a single array of unique elements
            const elements = new Set();
            this.config.collectSelectors.forEach(selector => {
                try {
                    const found = document.querySelectorAll(selector);
                    found.forEach(el => elements.add(el));
                } catch (e) {
                    console.warn(`SnowFall: Invalid selector "${selector}"`);
                }
            });

            // Map to coordinates
            this.obstacles = Array.from(elements).map(el => {
                const rect = el.getBoundingClientRect();
                // Optimization: Ignore off-screen elements
                if (rect.bottom < 0 || rect.top > this.height) return null;
                return {
                    left: rect.left,
                    right: rect.right,
                    top: rect.top,
                    width: rect.width
                };
            }).filter(Boolean);
        }

        spawnFlakes() {
            this.flakes = [];
            for (let i = 0; i < this.config.flakeCount; i++) {
                this.flakes.push(new Snowflake(this, false));
            }
        }

        loop() {
            this.ctx.clearRect(0, 0, this.width, this.height);

            this.flakes.forEach(flake => {
                flake.update();
                flake.draw();
            });

            requestAnimationFrame(() => this.loop());
        }
    }

    class Snowflake {
        constructor(system, isNew = true) {
            this.sys = system;
            this.init(isNew);
        }

        init(isNew) {
            // Depth (Z): 0.1 (far) to 1.0 (near)
            this.z = Math.random() * 0.9 + 0.1; 
            this.size = this.sys.config.sizeBase * this.z;
            
            // Position
            this.x = Math.random() * this.sys.width;
            this.y = isNew ? -20 : Math.random() * this.sys.height;
            
            // Physics
            this.vy = (this.sys.config.gravity * this.z) + (Math.random() * 0.5);
            this.vx = (Math.random() - 0.5) * 0.5;
            
            // Visuals
            this.alpha = 1.0;
            this.meltAlpha = 1.0;
            this.landed = false;
            this.stackOffset = Math.random() * 4; // Visual irregularity
        }

        update() {
            // 1. Landed Logic
            if (this.landed) {
                this.meltAlpha -= this.sys.config.meltSpeed;
                if (this.meltAlpha <= 0) this.init(true);
                return;
            }

            // 2. Movement
            const conf = this.sys.config;
            
            // Wind + Drift
            let dx = this.vx + (conf.wind * this.z);
            dx += Math.sin((this.y * 0.01) + (Date.now() * 0.002)) * 0.5 * this.z;
            let dy = this.vy;

            // 3. Mouse Interaction
            if (conf.mouseInteraction) {
                const distX = this.x - this.sys.mouse.x;
                const distY = this.y - this.sys.mouse.y;
                const dist = Math.sqrt(distX * distX + distY * distY);

                if (dist < conf.mouseRepulsionRadius) {
                    const force = (conf.mouseRepulsionRadius - dist) / conf.mouseRepulsionRadius;
                    const angle = Math.atan2(distY, distX);
                    dx += Math.cos(angle) * force * 5 * this.z;
                    dy += Math.sin(angle) * force * 5 * this.z;
                }
            }

            this.x += dx;
            this.y += dy;

            // 4. Wrapping
            if (this.x > this.sys.width + 5) this.x = -5;
            if (this.x < -5) this.x = this.sys.width + 5;
            if (this.y > this.sys.height) this.init(true);

            // 5. Collision Detection
            // Only check if flake is reasonably close to the screen plane (z > 0.4)
            // and actually falling
            if (this.z > 0.4) {
                for (let obs of this.sys.obstacles) {
                    if (this.x > obs.left && this.x < obs.right) {
                        const landY = obs.top - (this.size * 0.5) + this.stackOffset;
                        // Hit detection window
                        if (this.y >= landY && this.y <= landY + 10) {
                            if (Math.random() < conf.stickiness) {
                                this.landed = true;
                                this.y = landY;
                            }
                        }
                    }
                }
            }
        }

        draw() {
            const ctx = this.sys.ctx;
            const opacity = this.landed ? this.meltAlpha : (this.z * 0.8);
            
            ctx.beginPath();
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Expose to Global Scope
    window.SnowFall = new SnowSystem();

})(window);

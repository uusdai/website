// =====================================================
// UUSD Hero Animation
// Rich falling currency symbols + network effect
// =====================================================

class HeroAnimation {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.symbols = [];
        this.particles = [];
        this.frameCount = 0;
        this.mouseX = 0;
        this.mouseY = 0;

        // Colors
        this.colors = {
            greenDark: '#1a3d1a',
            greenPrimary: '#2d5016',
            greenMedium: '#4a7c23',
            greenLight: '#8b9a6d',
            greenPale: '#a8b892',
            gold: '#c9a227',
            goldLight: '#d4b84a'
        };

        this.init();
        this.animate();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => {
            this.resize();
            this.createElements();
        });

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
        });

        this.createElements();
    }

    resize() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
    }

    createElements() {
        this.createSymbols();
        this.createParticles();
    }

    createSymbols() {
        this.symbols = [];
        // Responsive symbol count: fewer on mobile, moderate on desktop
        const isMobile = this.canvas.width < 768;
        const baseCount = isMobile ? 12 : Math.floor(this.canvas.width / 50);
        const symbolCount = Math.min(baseCount, 30); // Cap at 30 symbols max
        const chars = ['$', '$', '¢', '₿', '¥', '€', '£', 'U', '∞', '◈'];

        for (let i = 0; i < symbolCount; i++) {
            this.symbols.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                char: chars[Math.floor(Math.random() * chars.length)],
                size: 16 + Math.random() * 32,
                speed: 0.4 + Math.random() * 1.2,
                opacity: 0.06 + Math.random() * 0.15,
                sway: Math.random() * Math.PI * 2,
                swaySpeed: 0.008 + Math.random() * 0.015,
                swayAmount: 30 + Math.random() * 50,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.02
            });
        }
    }

    createParticles() {
        this.particles = [];
        // Responsive particle count: fewer on mobile
        const isMobile = this.canvas.width < 768;
        const particleCount = isMobile ? 30 : 50;

        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5 + 0.3,
                radius: 1.5 + Math.random() * 3,
                opacity: 0.15 + Math.random() * 0.25,
                color: Math.random() > 0.3 ? this.colors.greenMedium : this.colors.gold
            });
        }
    }

    drawEngravingLines() {
        this.ctx.strokeStyle = this.colors.greenPrimary;

        for (let y = 0; y < this.canvas.height; y += 4) {
            const wave = Math.sin(y * 0.01 + this.frameCount * 0.01) * 0.5;
            this.ctx.globalAlpha = 0.025 + wave * 0.01;
            this.ctx.lineWidth = 0.5;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawSymbols() {
        this.symbols.forEach(symbol => {
            symbol.y += symbol.speed;
            symbol.sway += symbol.swaySpeed;
            symbol.rotation += symbol.rotationSpeed;

            const swayX = Math.sin(symbol.sway) * symbol.swayAmount;

            if (symbol.y > this.canvas.height + 60) {
                symbol.y = -60;
                symbol.x = Math.random() * this.canvas.width;
            }

            this.ctx.save();
            this.ctx.translate(symbol.x + swayX, symbol.y);
            this.ctx.rotate(symbol.rotation);

            this.ctx.globalAlpha = symbol.opacity;
            this.ctx.font = `${symbol.size}px "Space Grotesk", sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            if (symbol.char === '$' || symbol.char === 'U') {
                this.ctx.fillStyle = this.colors.greenPrimary;
            } else if (symbol.char === '₿' || symbol.char === '∞') {
                this.ctx.fillStyle = this.colors.gold;
            } else {
                this.ctx.fillStyle = this.colors.greenMedium;
            }

            this.ctx.fillText(symbol.char, 0, 0);
            this.ctx.restore();
        });
    }

    drawParticles() {
        this.particles.forEach(particle => {
            const dx = this.mouseX - particle.x;
            const dy = this.mouseY - particle.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 150) {
                const force = (150 - dist) / 150;
                particle.vx -= dx * force * 0.001;
                particle.vy -= dy * force * 0.001;
            }

            particle.x += particle.vx;
            particle.y += particle.vy;

            particle.vx *= 0.99;
            particle.vy *= 0.99;
            particle.vy += 0.01;

            if (particle.x < 0) particle.x = this.canvas.width;
            if (particle.x > this.canvas.width) particle.x = 0;
            if (particle.y > this.canvas.height) {
                particle.y = 0;
                particle.x = Math.random() * this.canvas.width;
            }
            if (particle.y < 0) particle.y = this.canvas.height;

            this.ctx.globalAlpha = particle.opacity;
            this.ctx.fillStyle = particle.color;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    drawConnections() {
        const connectionDist = 100;

        this.ctx.strokeStyle = this.colors.greenLight;
        this.ctx.lineWidth = 0.5;

        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const dx = this.particles[i].x - this.particles[j].x;
                const dy = this.particles[i].y - this.particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < connectionDist) {
                    this.ctx.globalAlpha = (1 - dist / connectionDist) * 0.2;
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
                    this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
                    this.ctx.stroke();
                }
            }
        }
    }

    drawDataFlow() {
        // Responsive stream count: fewer on mobile
        const isMobile = this.canvas.width < 768;
        const streamCount = isMobile ? 4 : 6;

        for (let i = 0; i < streamCount; i++) {
            const x = i < streamCount / 2
                ? 30 + i * 25
                : this.canvas.width - 30 - (i - streamCount / 2) * 25;

            this.ctx.globalAlpha = 0.08;
            this.ctx.strokeStyle = this.colors.greenMedium;
            this.ctx.lineWidth = 1;

            this.ctx.beginPath();
            for (let y = 0; y < this.canvas.height; y += 3) {
                const offset = Math.sin(y * 0.02 + this.frameCount * 0.03 + i) * 5;
                if (y === 0) {
                    this.ctx.moveTo(x + offset, y);
                } else {
                    this.ctx.lineTo(x + offset, y);
                }
            }
            this.ctx.stroke();

            for (let y = (this.frameCount * 2 + i * 50) % 200; y < this.canvas.height; y += 200) {
                this.ctx.globalAlpha = 0.15;
                this.ctx.fillStyle = this.colors.gold;
                this.ctx.beginPath();
                this.ctx.arc(x, y, 3, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
    }

    drawCentralGlow() {
        const gradient = this.ctx.createRadialGradient(
            this.canvas.width / 2, this.canvas.height / 2, 0,
            this.canvas.width / 2, this.canvas.height / 2, this.canvas.width * 0.4
        );
        gradient.addColorStop(0, 'rgba(248, 246, 240, 0.4)');
        gradient.addColorStop(0.5, 'rgba(248, 246, 240, 0.1)');
        gradient.addColorStop(1, 'rgba(248, 246, 240, 0)');

        this.ctx.globalAlpha = 1;
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    animate() {
        this.frameCount++;

        this.ctx.fillStyle = '#f8f6f0';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawEngravingLines();
        this.drawDataFlow();
        this.drawConnections();
        this.drawParticles();
        this.drawSymbols();
        this.drawCentralGlow();

        this.ctx.globalAlpha = 1;

        requestAnimationFrame(() => this.animate());
    }
}

window.HeroAnimation = HeroAnimation;

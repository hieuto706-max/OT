// ==================== 8D DYNAMIC PARALLAX CARDS ====================
document.addEventListener('DOMContentLoaded', () => {
    const apply8DEffect = (selector, intensity = 10, innerSelector = null) => {
        const cards = document.querySelectorAll(selector);
        cards.forEach(card => {
            const target = innerSelector ? card.querySelector(innerSelector) : card;
            if (!target) return;
            
            // Add glare element if not present
            let glare = target.querySelector('.tilt-glare');
            if (!glare) {
                glare = document.createElement('div');
                glare.className = 'tilt-glare';
                target.appendChild(glare);
            }
            
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                
                const rotateX = ((centerY - y) / centerY) * intensity;
                const rotateY = ((x - centerX) / centerX) * intensity;
                
                // Calculate percents for glare position
                const px = x / rect.width;
                const py = y / rect.height;
                
                target.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(20px)`;
                target.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(13, 217, 139, 0.06)';
                
                glare.style.opacity = '1';
                glare.style.left = `${px * 100}%`;
                glare.style.top = `${py * 100}%`;
            });
            
            card.addEventListener('mouseleave', () => {
                target.style.transform = `rotateX(0deg) rotateY(0deg) translateZ(0)`;
                target.style.boxShadow = '';
                glare.style.opacity = '0';
                target.style.transition = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.6s ease';
            });
            
            card.addEventListener('mouseenter', () => {
                target.style.transition = 'transform 0.1s ease-out, box-shadow 0.1s ease-out';
            });
        });
    };
    
    // Áp dụng cho ảnh mockup review (xoay toàn bộ khung viền 3D)
    apply8DEffect('#app-review-3d', 14, '.device-mockup-wrapper');
    
    // Áp dụng cho các loại thẻ trên trang chủ
    apply8DEffect('.feat-card-large', 12);
    apply8DEffect('.download-card-large', 10);
    apply8DEffect('.login-page-card', 8);
    apply8DEffect('.terms-card', 6);
    apply8DEffect('.gallery-card', 10);

    // Toggle collapsible changelog timeline logs
    document.querySelectorAll('.changelog-item').forEach(item => {
        const header = item.querySelector('.changelog-header-btn');
        if (header) {
            header.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                document.querySelectorAll('.changelog-item').forEach(other => {
                    other.classList.remove('active');
                });
                if (!isActive) {
                    item.classList.add('active');
                }
            });
        }
    });

    // Make the first release item open by default
    const firstChangelog = document.querySelector('.changelog-item');
    if (firstChangelog) {
        firstChangelog.classList.add('active');
    }

    // Toggle gallery tabs (Employee vs Admin screenshots)
    document.querySelectorAll('.gallery-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const galleryType = this.getAttribute('data-gallery');
            if (!galleryType) return;
            
            // Toggle active state on buttons
            document.querySelectorAll('.gallery-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Toggle active state on content panels
            document.querySelectorAll('.gallery-content').forEach(p => p.classList.remove('active'));
            const targetPanel = document.getElementById('gallery-content-' + galleryType);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
});

// ==================== 3D HOLOGRAM DEVICE MODEL VIEWER ====================
class Device3DModelViewer {
    constructor() {
        this.canvas = document.getElementById('canvas-3d-model');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.mouse = { x: 0, y: 0 };
        this.time = 0;
        this.resize();
        this.initGeometry();
        this.bindEvents();
        this.animate();
    }
    
    resize() {
        if (!this.canvas) return;
        this.width = this.canvas.width = window.innerWidth;
        this.height = this.canvas.height = window.innerHeight;
    }
    
    initGeometry() {
        this.vertices = [];
        this.edges = [];
        
        // 1. MONITOR MODEL (Centered in 3D Space)
        const mw = 145; // Half width of monitor screen
        const mh = 90;  // Half height of monitor screen
        
        // Front screen vertices (index 0 - 3)
        this.vertices.push({ x: -mw, y: -mh, z: 0, color: 'monitor' });
        this.vertices.push({ x: mw, y: -mh, z: 0, color: 'monitor' });
        this.vertices.push({ x: mw, y: mh, z: 0, color: 'monitor' });
        this.vertices.push({ x: -mw, y: mh, z: 0, color: 'monitor' });
        
        // Back screen bezel (index 4 - 7)
        this.vertices.push({ x: -mw + 8, y: -mh + 6, z: 12, color: 'monitor_back' });
        this.vertices.push({ x: mw - 8, y: -mh + 6, z: 12, color: 'monitor_back' });
        this.vertices.push({ x: mw - 8, y: mh - 6, z: 12, color: 'monitor_back' });
        this.vertices.push({ x: -mw + 8, y: mh - 6, z: 12, color: 'monitor_back' });
        
        // Connect monitor outer bezel edges
        this.edges.push([0, 1], [1, 2], [2, 3], [3, 0]);
        this.edges.push([4, 5], [5, 6], [6, 7], [7, 4]);
        this.edges.push([0, 4], [1, 5], [2, 6], [3, 7]);
        
        // Inner screen scanlines grid wireframe (index 8 - 11)
        this.vertices.push({ x: -mw + 12, y: -mh + 12, z: 1, color: 'screen_lines' });
        this.vertices.push({ x: mw - 12, y: -mh + 12, z: 1, color: 'screen_lines' });
        this.vertices.push({ x: mw - 12, y: mh - 12, z: 1, color: 'screen_lines' });
        this.vertices.push({ x: -mw + 12, y: mh - 12, z: 1, color: 'screen_lines' });
        this.edges.push([8, 9], [9, 10], [10, 11], [11, 8]);
        
        // Stand neck lines (index 12 - 15)
        this.vertices.push({ x: -18, y: mh, z: 6, color: 'stand' });
        this.vertices.push({ x: 18, y: mh, z: 6, color: 'stand' });
        this.vertices.push({ x: -12, y: mh + 50, z: 20, color: 'stand' });
        this.vertices.push({ x: 12, y: mh + 50, z: 20, color: 'stand' });
        this.edges.push([12, 14], [13, 15], [14, 15]);
        
        // Base plate (index 16 - 19)
        this.vertices.push({ x: -50, y: mh + 50, z: 45, color: 'base' });
        this.vertices.push({ x: 50, y: mh + 50, z: 45, color: 'base' });
        this.vertices.push({ x: 40, y: mh + 50, z: -10, color: 'base' });
        this.vertices.push({ x: -40, y: mh + 50, z: -10, color: 'base' });
        this.edges.push([16, 17], [17, 18], [18, 19], [19, 16], [14, 16], [15, 17]);

        // 2. MOBILE PHONE MODEL (Positioned on the front right in Z)
        const px = 140;
        const py = 35;
        const pz = -65;
        const pw = 40;
        const ph = 80;
        const pd = 8;
        
        // Phone Front (index 20 - 23)
        this.vertices.push({ x: px - pw, y: py - ph, z: pz - pd/2, color: 'phone' });
        this.vertices.push({ x: px + pw, y: py - ph, z: pz - pd/2, color: 'phone' });
        this.vertices.push({ x: px + pw, y: py + ph, z: pz - pd/2, color: 'phone' });
        this.vertices.push({ x: px - pw, y: py + ph, z: pz - pd/2, color: 'phone' });
        
        // Phone Back (index 24 - 27)
        this.vertices.push({ x: px - pw, y: py - ph, z: pz + pd/2, color: 'phone_back' });
        this.vertices.push({ x: px + pw, y: py - ph, z: pz + pd/2, color: 'phone_back' });
        this.vertices.push({ x: px + pw, y: py + ph, z: pz + pd/2, color: 'phone_back' });
        this.vertices.push({ x: px - pw, y: py + ph, z: pz + pd/2, color: 'phone_back' });
        
        // Connect phone rings
        this.edges.push([20, 21], [21, 22], [22, 23], [23, 20]);
        this.edges.push([24, 25], [25, 26], [26, 27], [27, 24]);
        this.edges.push([20, 24], [21, 25], [22, 26], [23, 27]);
        
        // Phone screen bezel inner lines
        this.vertices.push({ x: px - pw + 5, y: py - ph + 8, z: pz - pd/2 + 1, color: 'phone_screen' });
        this.vertices.push({ x: px + pw - 5, y: py - ph + 8, z: pz - pd/2 + 1, color: 'phone_screen' });
        this.vertices.push({ x: px + pw - 5, y: py + ph - 8, z: pz - pd/2 + 1, color: 'phone_screen' });
        this.vertices.push({ x: px - pw + 5, y: py + ph - 8, z: pz - pd/2 + 1, color: 'phone_screen' });
        this.edges.push([28, 29], [29, 30], [30, 31], [31, 28]);
    }
    
    bindEvents() {
        window.addEventListener('resize', () => this.resize());
    }
    
    animate() {
        if (!this.canvas) return;
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.time += 0.006;
        
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        
        // Xoay tự động (không theo con chuột)
        const rotY = this.time * 0.22;
        const rotX = Math.sin(this.time * 0.1) * 0.15;
        const rotZ = Math.sin(this.time * 0.05) * 0.05;
        
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
        const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);
        
        const projected = [];
        
        // Chiếu tất cả các điểm 3D
        this.vertices.forEach(v => {
            let x1 = v.x * cosY - v.z * sinY;
            let z1 = v.x * sinY + v.z * cosY;
            
            let y2 = v.y * cosX - z1 * sinX;
            let z2 = v.y * sinX + z1 * cosX;
            
            let x3 = x1 * cosZ - y2 * sinZ;
            let y3 = x1 * sinZ + y2 * cosZ;
            
            const d = 500;
            const scale = 360 / Math.max(30, d + z2);
            projected.push({
                x: centerX + x3 * scale,
                y: centerY + y3 * scale,
                z: z2,
                color: v.color
            });
        });
        
        // Vẽ lưới neon
        this.ctx.save();
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = 'rgba(13, 217, 139, 0.45)';
        
        this.edges.forEach(edge => {
            const p1 = projected[edge[0]];
            const p2 = projected[edge[1]];
            
            this.ctx.beginPath();
            const avgZ = (p1.z + p2.z) / 2;
            const opacity = Math.min(Math.max(0.08, 0.42 - (avgZ / 350)), 0.65);
            
            if (p1.color.startsWith('phone')) {
                this.ctx.strokeStyle = `rgba(9, 227, 227, ${opacity})`;
            } else if (p1.color === 'screen_lines') {
                this.ctx.strokeStyle = `rgba(13, 217, 139, ${opacity * 0.35})`;
            } else {
                this.ctx.strokeStyle = `rgba(13, 217, 139, ${opacity})`;
            }
            
            this.ctx.lineWidth = p1.color === 'screen_lines' || p1.color === 'phone_screen' ? 0.6 : 1.2;
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
        });
        
        this.ctx.restore();
        requestAnimationFrame(() => this.animate());
    }
}


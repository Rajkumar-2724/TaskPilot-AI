import React, { useEffect, useRef } from 'react';

const AnimatedBackground3D = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const particleCount = 40;

    const auroraBlobs = [
      { x: canvas.width * 0.2, y: canvas.height * 0.3, radius: 300, color: 'rgba(56, 189, 248, 0.07)', vx: 0.3, vy: 0.2 },
      { x: canvas.width * 0.8, y: canvas.height * 0.6, radius: 350, color: 'rgba(99, 102, 241, 0.06)', vx: -0.25, vy: 0.15 },
      { x: canvas.width * 0.5, y: canvas.height * 0.8, radius: 280, color: 'rgba(167, 139, 250, 0.05)', vx: 0.2, vy: -0.3 },
    ];

    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.4;
        this.speedY = (Math.random() - 0.5) * 0.4;
        this.opacity = Math.random() * 0.5 + 0.1;
        const colors = ['rgba(56, 189, 248,', 'rgba(99, 102, 241,', 'rgba(167, 139, 250,'];
        this.colorBase = colors[Math.floor(Math.random() * 3)];
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x > canvas.width) this.x = 0;
        if (this.x < 0) this.x = canvas.width;
        if (this.y > canvas.height) this.y = 0;
        if (this.y < 0) this.y = canvas.height;
      }

      draw() {
        ctx.fillStyle = `${this.colorBase} ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    const drawConnections = () => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 120) {
            const alpha = (1 - distance / 120) * 0.12;
            ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
    };

    const drawAuroraBlobs = (time) => {
      auroraBlobs.forEach((blob) => {
        blob.x += blob.vx;
        blob.y += blob.vy;
        if (blob.x > canvas.width + blob.radius) blob.x = -blob.radius;
        if (blob.x < -blob.radius) blob.x = canvas.width + blob.radius;
        if (blob.y > canvas.height + blob.radius) blob.y = -blob.radius;
        if (blob.y < -blob.radius) blob.y = canvas.height + blob.radius;

        const pulse = Math.sin(time * 0.0005 + blob.x * 0.01) * 0.02;
        const gradient = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.radius);
        gradient.addColorStop(0, blob.color.replace(/[\d.]+\)$/, `${0.08 + pulse})`));
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(blob.x, blob.y, blob.radius, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const animate = (time) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawAuroraBlobs(time);

      particles.forEach((particle) => {
        particle.update();
        particle.draw();
      });

      drawConnections();

      requestAnimationFrame(animate);
    };

    const animationId = requestAnimationFrame(animate);

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      auroraBlobs[0].x = canvas.width * 0.2;
      auroraBlobs[0].y = canvas.height * 0.3;
      auroraBlobs[1].x = canvas.width * 0.8;
      auroraBlobs[1].y = canvas.height * 0.6;
      auroraBlobs[2].x = canvas.width * 0.5;
      auroraBlobs[2].y = canvas.height * 0.8;
    };

    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: -2,
          pointerEvents: 'none',
        }}
      />
      <div className="tp-aurora-glow tp-aurora-glow--cyan" style={{ width: 500, height: 500, top: '-10%', left: '10%' }} />
      <div className="tp-aurora-glow tp-aurora-glow--indigo" style={{ width: 600, height: 600, bottom: '-15%', right: '5%' }} />
      <div className="tp-aurora-glow tp-aurora-glow--violet" style={{ width: 400, height: 400, top: '40%', left: '50%' }} />
    </>
  );
};

export default AnimatedBackground3D;

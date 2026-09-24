import React from 'react';
import { motion } from 'framer-motion';

const StatCard3D = ({ icon, title, value, change, color = 'primary', trend = 'up' }) => {
  const colorMap = {
    primary: { bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.25)', gradient: 'linear-gradient(135deg, #6366F1, #818CF8)', glow: 'rgba(99, 102, 241, 0.15)' },
    cyan: { bg: 'rgba(56, 189, 248, 0.08)', border: 'rgba(56, 189, 248, 0.25)', gradient: 'linear-gradient(135deg, #38BDF8, #7DD3FC)', glow: 'rgba(56, 189, 248, 0.15)' },
    violet: { bg: 'rgba(167, 139, 250, 0.08)', border: 'rgba(167, 139, 250, 0.25)', gradient: 'linear-gradient(135deg, #A78BFA, #C4B5FD)', glow: 'rgba(167, 139, 250, 0.15)' },
    success: { bg: 'rgba(34, 197, 94, 0.08)', border: 'rgba(34, 197, 94, 0.25)', gradient: 'linear-gradient(135deg, #22C55E, #4ADE80)', glow: 'rgba(34, 197, 94, 0.15)' },
    warning: { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.25)', gradient: 'linear-gradient(135deg, #F59E0B, #FBBF24)', glow: 'rgba(245, 158, 11, 0.15)' },
    danger: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.25)', gradient: 'linear-gradient(135deg, #EF4444, #F87171)', glow: 'rgba(239, 68, 68, 0.15)' },
  };

  const selectedColor = colorMap[color] || colorMap.primary;

  return (
    <motion.div
      className="tp-card"
      style={{
        background: selectedColor.bg,
        border: `1px solid ${selectedColor.border}`,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
      whileHover={{
        scale: 1.03,
        boxShadow: `0 20px 40px ${selectedColor.glow}`,
      }}
      transition={{ duration: 0.3 }}
    >
      {/* Subtle gradient orb */}
      <motion.div
        style={{
          position: 'absolute',
          top: '-40%',
          right: '-40%',
          width: '160%',
          height: '160%',
          background: selectedColor.gradient,
          opacity: 0.04,
          borderRadius: '50%',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <motion.div
          style={{
            fontSize: '2rem',
            marginBottom: '0.75rem',
            display: 'inline-block',
            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))',
          }}
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          {icon}
        </motion.div>

        <p style={{
          color: '#94A3B8',
          fontSize: '0.8rem',
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          marginBottom: '0.4rem',
          fontWeight: 500,
        }}>
          {title}
        </p>

        <motion.h3
          style={{
            fontSize: '1.7rem',
            fontWeight: 700,
            background: selectedColor.gradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            margin: '0.4rem 0',
            fontFamily: '"Plus Jakarta Sans", sans-serif',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {value}
        </motion.h3>

        <motion.div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            marginTop: '0.4rem',
            fontSize: '0.8rem',
          }}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <span style={{ color: trend === 'up' ? '#22C55E' : '#EF4444' }}>
            {trend === 'up' ? '↑' : '↓'}
          </span>
          <span style={{ color: trend === 'up' ? '#22C55E' : '#EF4444', fontWeight: 500 }}>
            {change}%
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default StatCard3D;

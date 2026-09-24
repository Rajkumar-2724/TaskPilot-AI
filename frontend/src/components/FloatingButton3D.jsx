import React from 'react';
import { motion } from 'framer-motion';

const FloatingButton3D = ({ icon, label, onClick, color = 'primary' }) => {
  const colorMap = {
    primary: { main: '#38BDF8', glow: 'rgba(56, 189, 248, 0.4)' },
    indigo: { main: '#6366F1', glow: 'rgba(99, 102, 241, 0.4)' },
    violet: { main: '#A78BFA', glow: 'rgba(167, 139, 250, 0.4)' },
    success: { main: '#22C55E', glow: 'rgba(34, 197, 94, 0.4)' },
  };

  const selected = colorMap[color] || colorMap.primary;

  return (
    <motion.button
      onClick={onClick}
      style={{
        position: 'fixed',
        bottom: '2rem',
        right: '2rem',
        width: '56px',
        height: '56px',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        background: `linear-gradient(135deg, ${selected.main}20, ${selected.main}10)`,
        backdropFilter: 'blur(20px)',
        color: selected.main,
        fontSize: '1.4rem',
        cursor: 'pointer',
        boxShadow: `0 8px 24px ${selected.glow}, inset 0 1px 0 rgba(255,255,255,0.1)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      whileHover={{
        scale: 1.1,
        boxShadow: `0 16px 40px ${selected.glow}, inset 0 1px 0 rgba(255,255,255,0.15)`,
      }}
      whileTap={{ scale: 0.92 }}
      animate={{
        y: [0, -6, 0],
      }}
      transition={{
        y: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
      }}
      title={label}
    >
      {icon}
    </motion.button>
  );
};

export default FloatingButton3D;

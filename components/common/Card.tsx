
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
}

const Card: React.FC<CardProps> = ({ children, className = '', hoverEffect = false }) => {
  return (
    <div className={`concrete-card bg-[#0d0c0b] border border-white/5 rounded-2xl p-6 relative overflow-hidden ${hoverEffect ? 'hover:border-white/20 transition-colors duration-300' : ''} ${className}`}>
      {children}
    </div>
  );
};

export default Card;

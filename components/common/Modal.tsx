
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl'
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={`relative w-full ${sizes[size]} concrete-card bg-[#0a0908] border border-white/10 shadow-2xl overflow-hidden animate-zoom-in rounded-2xl`}>
        {title && (
          <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
             <h3 className="text-sm font-display font-bold text-white uppercase tracking-widest">{title}</h3>
             <button onClick={onClose} className="text-ghost hover:text-white transition-colors"><X size={18} /></button>
          </div>
        )}
        {!title && (
           <button onClick={onClose} className="absolute top-4 right-4 text-ghost hover:text-white z-10"><X size={20} /></button>
        )}
        <div className="p-6">
           {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;

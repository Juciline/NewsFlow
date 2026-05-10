import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
}

const ProfileModal = ({ isOpen, onClose, user }: ProfileModalProps) => {
  if (!user) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="relative w-full max-w-sm bg-background border border-border p-8 shadow-2xl text-center"
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <X size={20} />
            </button>
            <div className="w-24 h-24 bg-muted border-4 border-border mx-auto mb-6 rounded-none overflow-hidden">
              {user.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt={user.displayName} 
                  referrerPolicy="no-referrer" 
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=0D8ABC&color=fff`;
                  }}
                  className="w-full h-full object-cover" 
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-serif font-bold text-blue-500">
                  {user.displayName?.charAt(0) || user.email?.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <h3 className="text-xl font-serif font-bold mb-1">{user.displayName || 'Utilizador'}</h3>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-6">{user.email}</p>
            <div className="text-left bg-muted p-4 border border-border space-y-3">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                <span className="text-muted-foreground">ID do Utilizador</span>
                <span>{user.uid.slice(0, 8)}...</span>
              </div>
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                <span className="text-muted-foreground">Membro desde</span>
                <span>{user.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'N/A'}</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ProfileModal;

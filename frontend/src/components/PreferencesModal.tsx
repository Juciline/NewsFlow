import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  initialPreferences: string[];
}

const CATEGORY_MAP: Record<string, string> = {
  'Tudo': 'top',
  'Mundo': 'world',
  'Tecnologia': 'technology',
  'Ciência': 'science',
  'Negócios': 'business',
  'Saúde': 'health',
  'Cultura': 'entertainment',
  'Desporto': 'sports'
};

const CATEGORIES = ['Tudo', 'Mundo', 'Tecnologia', 'Ciência', 'Negócios', 'Saúde', 'Cultura', 'Desporto'];

const PreferencesModal = ({ isOpen, onClose, userId, initialPreferences }: PreferencesModalProps) => {
  const [prefs, setPrefs] = useState<string[]>(initialPreferences);

  useEffect(() => {
    setPrefs(initialPreferences);
  }, [initialPreferences]);

  const togglePreference = async (category: string) => {
    const newPrefs = prefs.includes(category)
      ? prefs.filter(p => p !== category)
      : [...prefs, category];
    
    setPrefs(newPrefs);

    try {
      const userRef = doc(db, 'users', userId);
      await setDoc(userRef, {
        preferences: {
          categories: newPrefs
        },
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('Error updating preferences:', error);
    }
  };

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
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-md bg-card border border-border p-8 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-serif font-bold">Personalizar Feed</h2>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">Selecione os tópicos que deseja acompanhar</p>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-8">
              {CATEGORIES.filter(c => c !== 'Tudo').map((cat) => {
                const isActive = prefs.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => togglePreference(cat)}
                    className={`flex items-center justify-between px-4 py-3 text-[10px] font-bold uppercase tracking-widest border transition-all duration-300 ${
                      isActive
                        ? 'bg-foreground text-background border-foreground'
                        : 'border-border hover:border-foreground text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {cat}
                    {isActive && <Check size={12} />}
                  </button>
                );
              })}
            </div>

            <button 
              onClick={onClose}
              className="w-full py-4 bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
            >
              Concluído
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PreferencesModal;

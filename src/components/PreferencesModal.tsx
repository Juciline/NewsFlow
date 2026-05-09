import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Bookmark } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  initialPreferences: string[];
}

const CATEGORIES = ['Tecnologia', 'Ciência', 'Negócios', 'Saúde', 'Cultura', 'Desporto'];

const PreferencesModal: React.FC<PreferencesModalProps> = ({ isOpen, onClose, userId, initialPreferences }) => {
  const [selected, setSelected] = useState<string[]>(initialPreferences);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSelected(initialPreferences);
  }, [initialPreferences]);

  const toggleCategory = (cat: string) => {
    setSelected(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleSave = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const userRef = doc(db, 'users', userId);
      await setDoc(userRef, {
        preferences: { categories: selected },
        updatedAt: new Date().toISOString()
      }, { merge: true });
      onClose();
    } catch (error) {
      console.error("Erro ao salvar preferências:", error);
    } finally {
      setLoading(false);
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
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-background border border-border p-6 md:p-8 shadow-2xl overflow-y-auto max-h-[95vh] custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-500 text-white mb-3">
                <Bookmark size={20} />
              </div>
              <h2 className="text-xl font-serif font-bold tracking-tight">Personalize seu Feed</h2>
              <p className="text-muted-foreground text-xs mt-1">
                Selecione as categorias que mais lhe interessam para uma experiência única.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {CATEGORIES.map(cat => {
                const isSelected = selected.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={cn(
                      "flex items-center justify-between p-3 border transition-all",
                      isSelected 
                        ? "border-blue-500 bg-blue-500/5 text-blue-500" 
                        : "border-border hover:border-muted-foreground/50 text-muted-foreground"
                    )}
                  >
                    <span className="text-xs font-bold uppercase tracking-widest">{cat}</span>
                    {isSelected && <Check size={14} />}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleSave}
              disabled={loading}
              className="w-full py-3 font-bold text-[10px] uppercase tracking-[0.2em] bg-foreground text-background hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? 'A Guardar...' : 'Confirmar Preferências'}
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PreferencesModal;

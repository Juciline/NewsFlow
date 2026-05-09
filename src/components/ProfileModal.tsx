import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Mail, Lock, Camera, Check, Loader2 } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { User as FirebaseUser, updateProfile, updateEmail, updatePassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: FirebaseUser | null;
}

const AVATARS = [
  'https://api.dicebear.com/7.x/pixel-art/svg?seed=Felix',
  'https://api.dicebear.com/7.x/pixel-art/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/pixel-art/svg?seed=Boots',
  'https://api.dicebear.com/7.x/pixel-art/svg?seed=Mittens',
  'https://api.dicebear.com/7.x/pixel-art/svg?seed=Toby',
  'https://api.dicebear.com/7.x/pixel-art/svg?seed=Socks',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
];

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, user }) => {
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setEmail(user.email || '');
      setPhotoURL(user.photoURL || '');
    }
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      if (!auth.currentUser) throw new Error('Utilizador não autenticado.');

      // 1. Atualizar Perfil (Nome e Foto)
      await updateProfile(auth.currentUser, {
        displayName,
        photoURL
      });

      // 2. Atualizar E-mail (se mudou)
      if (email !== auth.currentUser.email) {
        await updateEmail(auth.currentUser, email);
      }

      // 3. Atualizar Senha (se preenchida)
      if (newPassword) {
        if (newPassword.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.');
        await updatePassword(auth.currentUser, newPassword);
      }

      // 4. Sincronizar com Firestore
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await setDoc(userRef, {
        displayName,
        photoURL,
        email,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' });
      setTimeout(() => {
        onClose();
        setMessage({ type: '', text: '' });
      }, 2000);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/requires-recent-login') {
        setMessage({ type: 'error', text: 'Para alterar e-mail ou senha, você precisa ter feito login recentemente. Saia e entre novamente.' });
      } else {
        setMessage({ type: 'error', text: err.message });
      }
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

            <div className="mb-8">
              <h2 className="text-2xl font-serif font-bold tracking-tight mb-1">Configurações de Perfil</h2>
              <p className="text-muted-foreground text-xs uppercase tracking-widest font-bold">Gerencie sua identidade digital</p>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-8">
              {/* Avatar Selection */}
              <div className="space-y-4">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Camera size={12} /> Selecione seu Avatar
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                  {AVATARS.map((url) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setPhotoURL(url)}
                      className={cn(
                        "relative aspect-square border-2 transition-all p-1 group overflow-hidden",
                        photoURL === url ? "border-blue-500 scale-110" : "border-border hover:border-muted-foreground/50"
                      )}
                    >
                      <img src={url} alt="Avatar option" className="w-full h-full object-cover" />
                      {photoURL === url && (
                        <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                          <Check size={16} className="text-blue-500 bg-background rounded-full p-0.5" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nome de Exibição</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-muted border border-border pl-10 pr-4 py-2 text-sm focus:border-blue-500 outline-none transition-all placeholder:text-muted-foreground/30"
                      placeholder="Como deseja ser chamado"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-muted border border-border pl-10 pr-4 py-2 text-sm focus:border-blue-500 outline-none transition-all placeholder:text-muted-foreground/30"
                      placeholder="email@exemplo.com"
                    />
                  </div>
                </div>

                <div className="space-y-1 col-span-full">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nova Senha (Deixe em branco para manter)</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-muted border border-border pl-10 pr-4 py-2 text-sm focus:border-blue-500 outline-none transition-all placeholder:text-muted-foreground/30"
                      placeholder="••••••••"
                      minLength={6}
                    />
                  </div>
                </div>
              </div>

              {message.text && (
                <div className={cn(
                  "p-3 text-[10px] uppercase font-bold tracking-widest border",
                  message.type === 'success' ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
                )}>
                  {message.text}
                </div>
              )}

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 border border-border py-3 font-bold text-[10px] uppercase tracking-[0.2em] hover:bg-muted transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-[2] bg-foreground text-background py-3 font-bold text-[10px] uppercase tracking-[0.2em] hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10"
                >
                  {loading ? <Loader2 className="animate-spin" size={14} /> : 'Guardar Alterações'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ProfileModal;

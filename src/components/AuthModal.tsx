import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, Lock, User, LogIn, UserPlus } from 'lucide-react';
import { auth, googleProvider, db } from '@/lib/firebase';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let user;
      if (mode === 'login') {
        const res = await signInWithEmailAndPassword(auth, email, password);
        user = res.user;
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        user = userCredential.user;
      }

      // Garantir documento do utilizador no Firestore
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName || name,
        email: user.email,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      }, { merge: true });

      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      const user = res.user;

      // Garantir documento do utilizador no Firestore
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      }, { merge: true });

      onClose();
    } catch (err: any) {
      setError(err.message);
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
            className="relative w-full max-w-md bg-background border border-border p-6 md:p-8 shadow-2xl overflow-y-auto max-h-[95vh] custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-foreground text-background font-serif font-black text-xl mb-3">
                N
              </div>
              <h2 className="text-xl font-serif font-bold tracking-tight">
                {mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}
              </h2>
              <p className="text-muted-foreground text-xs mt-1">
                Acesse suas notícias personalizadas
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === 'register' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nome Completo</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-muted border border-border pl-10 pr-4 py-2 text-sm focus:border-blue-500 outline-none transition-all"
                      placeholder="Seu nome"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-muted border border-border pl-10 pr-4 py-2 text-sm focus:border-blue-500 outline-none transition-all"
                    placeholder="email@exemplo.com"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-muted border border-border pl-10 pr-4 py-2 text-sm focus:border-blue-500 outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && <p className="text-red-500 text-[10px] font-medium">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-foreground text-background py-2.5 font-bold text-[10px] uppercase tracking-[0.2em] hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50"
              >
                {loading ? 'Processando...' : mode === 'login' ? 'Entrar' : 'Cadastrar'}
              </button>
            </form>

            <div className="relative my-6 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <span className="relative px-3 bg-background text-[9px] font-bold text-muted-foreground tracking-widest uppercase">Ou</span>
            </div>

            <button
              onClick={handleGoogleSignIn}
              className="w-full border border-border py-2.5 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest hover:bg-muted transition-all"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4" alt="Google" />
              Continuar com Google
            </button>

            <div className="mt-6 text-center">
              <button
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-blue-500 transition-colors p-2"
              >
                {mode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Faça login'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AuthModal;

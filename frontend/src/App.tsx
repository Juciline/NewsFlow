/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import axios from 'axios';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Menu, 
  X,
  User, 
  Sparkles, 
  Settings,
  ChevronRight,
  Newspaper,
  Sun,
  Moon,
  LogOut,
  Loader2,
  Heart as HeartIcon,
  Download,
  Bell,
  Repeat2
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '@/lib/utils';
import { geminiService } from './services/geminiService';
import NewsCard from './components/NewsCard';
import NewsSkeleton from './components/NewsSkeleton';
import AuthModal from './components/AuthModal';
import PreferencesModal from './components/PreferencesModal';
import ProfileModal from './components/ProfileModal';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocFromServer, serverTimestamp } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
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

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [news, setNews] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('Tudo');
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeArticle, setActiveArticle] = useState<any>(null);
  const [readingContent, setReadingContent] = useState<any>(null);
  const [loadingReader, setLoadingReader] = useState(false);
  const [briefingData, setBriefingData] = useState<any>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [userPreferences, setUserPreferences] = useState<string[]>([]);
  const [view, setView] = useState<'home' | 'favorites'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [lastNotifiedId, setLastNotifiedId] = useState<string | null>(null);
  const [systemMessage, setSystemMessage] = useState<{ text: string, type: 'error' | 'success' | 'info' } | null>(null);

  // Simulated "Push" for breaking news
  useEffect(() => {
    if (notificationsEnabled && news.length > 0 && news[0].id !== lastNotifiedId) {
      const topNews = news[0];
      // Avoid notification spam on first load if multiple items, but trigger for the top "breaking" one
      try {
        new Notification('ÚLTIMA HORA: NewsFlow Journal', {
          body: topNews.title,
          icon: topNews.imageUrl || topNews.image_url || '/favicon.ico'
        });
        setLastNotifiedId(topNews.id);
      } catch (err) {
        console.warn('Erro ao disparar notificação local:', err);
      }
    }
  }, [news, notificationsEnabled, lastNotifiedId]);

  // Firestore Connection Test
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  // Notifications logic
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      setSystemMessage({ text: "Este browser não suporta notificações de desktop.", type: 'error' });
      return;
    }

    try {
      // Se já estiver garantido, apenas confirmamos o estado
      if (Notification.permission === 'granted') {
        setNotificationsEnabled(true);
        try {
          new Notification('NewsFlow Journal', {
            body: 'Notificações confirmadas!',
            icon: '/favicon.ico'
          });
        } catch (e) { console.warn("Erro ao disparar notificação inicial:", e); }
        setSystemMessage({ text: "As notificações já estão ativas para este site.", type: 'success' });
        return;
      }

      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
      
      if (permission === 'granted') {
        new Notification('NewsFlow Journal', {
          body: 'Notificações ativadas com sucesso!',
          icon: '/favicon.ico'
        });
        setSystemMessage({ text: "Notificações ativadas!", type: 'success' });
      } else if (permission === 'denied') {
        setSystemMessage({ 
          text: "Notificações bloqueadas pelo browser. Para testar, clique no botão de 'Abrir em novo separador' no topo direito da barra de ferramentas.", 
          type: 'error' 
        });
      } else {
        setSystemMessage({ text: "Permissão de notificações ignorada.", type: 'info' });
      }
    } catch (err) {
      console.error('Erro ao pedir permissão de notificações:', err);
      setSystemMessage({ 
        text: "Restrição de Janela: O browser bloqueou o pedido dentro do editor. Por favor, use o botão 'Open Project' (seta para fora) para abrir num novo separador e ativar o sino.", 
        type: 'info' 
      });
    }
    
    // Auto-hide message after 8 seconds (longer for reading help)
    setTimeout(() => setSystemMessage(null), 8000);
  };

  const handleTopicComparison = async (article: any) => {
    if (!article) return;
    setIsComparing(true);
    setComparisonData(null);
    try {
      const response = await geminiService.analyzeNews(
        `COMPARE COVERAGE: ${article.title || 'Sem Título'}`,
        `Analise como diferentes fontes (conservadoras, progressistas, técnicas) abordariam este tópico: ${article.summary || ''}. Forneça uma síntese das perspectivas prováveis.`,
        article.link || article.url
      );
      setComparisonData({ ...response, articleTitle: article.title || 'Sem Título' });
    } catch (e) {
      console.error(e);
    } finally {
      setIsComparing(false);
    }
  };

  const exportFavoritesToPDF = () => {
    if (!favorites || favorites.length === 0) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    // Configurações Estéticas (Modo Journal)
    const primaryColor: [number, number, number] = [15, 23, 42]; // Slate 900
    const accentColor: [number, number, number] = [59, 130, 246]; // Blue 500
    
    // Cabeçalho Principal
    doc.setFont('times', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('NewsFlow Journal', 14, 25);
    
    // Linha decorativa
    doc.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.setLineWidth(1);
    doc.line(14, 28, 40, 28);
    
    // Metadados
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('ARQUIVO DE NOTÍCIAS FAVORITAS', 14, 35);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-PT')}`, pageWidth - 14, 35, { align: 'right' });

    const tableData = favorites.filter(f => f && (f.title || f.link || f.url)).map(f => [
      f.title || 'Sem Título',
      (f.source || f.source_id || 'N/A').toUpperCase(),
      new Date(f.pubDate || f.publishedAt).toLocaleDateString('pt-PT'),
      f.link || f.url || ''
    ]);

    autoTable(doc, {
      head: [['Título da Notícia', 'Fonte', 'Data', 'Ligação / URL']],
      body: tableData,
      startY: 45,
      margin: { left: 14, right: 14 },
      styles: { 
        fontSize: 9, 
        font: 'helvetica',
        cellPadding: 4,
        lineColor: [230, 230, 230],
        lineWidth: 0.1,
      },
      headStyles: { 
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left'
      },
      columnStyles: {
        0: { cellWidth: 80, fontStyle: 'bold' }, // Título (mais espaço e negrito)
        1: { cellWidth: 30, halign: 'center' }, // Fonte
        2: { cellWidth: 25, halign: 'center' }, // Data
        3: { cellWidth: 'auto', textColor: accentColor } // Link
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      },
      didDrawPage: (data) => {
        // Rodapé
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Página ${data.pageNumber}`, 
          pageWidth / 2, 
          doc.internal.pageSize.height - 10, 
          { align: 'center' }
        );
      }
    });

    doc.save(`newsflow-favoritos-${new Date().getTime()}.pdf`);
  };

  // Reader Logic
  const openReader = async (article: any) => {
    if (!article) return;
    setActiveArticle(article);
    setLoadingReader(true);
    setReadingContent(null);
    try {
      const url = article.link || article.url;
      if (!url) throw new Error("URL não disponível");
      
      const response = await axios.post('/api/article-reader', { url });
      setReadingContent(response.data);
    } catch (e) {
      console.error(e);
      setReadingContent({
        title: article.title || 'Sem Título',
        content: (article.summary || '') + "\n\n(Não foi possível carregar o texto completo automaticamente.)",
        author: article.author || article.source || article.source_id,
        date: article.pubDate || article.publishedAt
      });
    } finally {
      setLoadingReader(false);
    }
  };
  const [isSearching, setIsSearching] = useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const toggleCategoryDirectly = async (category: string) => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    const newPrefs = userPreferences.includes(category)
      ? userPreferences.filter(p => p !== category)
      : [...userPreferences, category];

    // Atualização otimista
    setUserPreferences(newPrefs);

    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        preferences: {
          categories: newPrefs
        },
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  // Auto-scroll category into view
  useEffect(() => {
    if (scrollContainerRef.current) {
      const activeBtn = scrollContainerRef.current.querySelector('[data-active="true"]');
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [selectedCategory]);

  const fetchBriefing = async () => {
    if (loadingBriefing) return;
    setLoadingBriefing(true);
    setIsBriefingOpen(true);
    try {
      const data = await geminiService.generateBriefing(news.slice(0, 10));
      setBriefingData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBriefing(false);
    }
  };
  const filteredNews = (view === 'home' ? news : favorites).filter(item => 
    item.title?.toLowerCase().includes(debouncedQuery.toLowerCase()) || 
    item.summary?.toLowerCase().includes(debouncedQuery.toLowerCase())
  );

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 600);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const heroArticle = filteredNews[0] || news[0];
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u && view === 'favorites') {
        setView('home');
      }
    });
    return () => unsubAuth();
  }, [view]);

  // Observer para dados do utilizador
  useEffect(() => {
    let unsubFavs: (() => void) | null = null;
    let unsubPrefs: (() => void) | null = null;

    if (user) {
      // Observer para favoritos
      const favsRef = collection(db, 'users', user.uid, 'favorites');
      unsubFavs = onSnapshot(favsRef, (snapshot) => {
        setFavorites(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => {
        if (auth.currentUser?.uid === user.uid) {
          handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/favorites`);
        }
      });

      // Observer para preferências
      const userRef = doc(db, 'users', user.uid);
      unsubPrefs = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserPreferences(data.preferences?.categories || []);
        }
      }, (error) => {
        if (auth.currentUser?.uid === user.uid) {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
        }
      });
    } else {
      setFavorites([]);
      setUserPreferences([]);
    }

    return () => {
      if (unsubFavs) unsubFavs();
      if (unsubPrefs) unsubPrefs();
    };
  }, [user]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const fetchNews = async (pageNum: string = "", query: string = debouncedQuery) => {
    if (view === 'favorites') return;
    setIsLoading(true);
    if (query) setIsSearching(true);
    setError(null);
    try {
      let apiCategory = CATEGORY_MAP[selectedCategory] || 'top';
      
      // Personalização: Se estiver em "Tudo" e o utilizador tiver preferências, usa-as
      if (selectedCategory === 'Tudo' && userPreferences.length > 0) {
        apiCategory = userPreferences
          .map(p => CATEGORY_MAP[p])
          .filter(Boolean)
          .join(',');
      }

      const response = await axios.get(`/api/news`, {
        params: {
          category: apiCategory,
          page: pageNum,
          q: query
        }
      });
      const data = response.data;
      
      if (data.error || data.status === "error") {
        console.error("API Error:", data.error);
        setError(data.error);
        setNews([]);
        return;
      }
      
      const articles = (data.articles || []).map((a: any) => {
        const originalId = a.id || a.article_id || a.link || a.url || Math.random().toString();
        const safeId = String(originalId).replace(/[^a-zA-Z0-9_\-]/g, '_').slice(-100);
        return {
          ...a,
          id: safeId,
          originalId: originalId,
          sentiment: 'Neutro',
          tags: [selectedCategory]
        };
      });
      setNextPage(data.nextPage);
      
      setNews(articles);
      
      const enriched = await Promise.all(articles.map(async (article: any, index: number) => {
        // Analisar apenas os primeiros 3 para não estourar a quota e poupar recursos no carregamento inicial
        if (index > 2) return article;
        try {
          const analysis = await geminiService.analyzeNews(article.title, article.summary, article.link || article.url);
          return { ...article, ...analysis };
        } catch (e) {
          return article;
        }
      }));
      setNews(enriched);
    } catch (error: any) {
      console.error("Erro ao buscar notícias:", error);
      setError(error.message || "Erro desconhecido ao carregar notícias.");
    } finally {
      setIsLoading(false);
      setIsSearching(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    fetchNews("", debouncedQuery);
  }, [selectedCategory, view, userPreferences, debouncedQuery]);

  const toggleFavorite = async (article: any) => {
    if (!user || !article) {
      if (!user) setIsAuthOpen(true);
      return;
    }
    
    const articleId = article.originalId || article.id || article.article_id || article.link || article.url;
    if (!articleId) return;

    // Usar o ID já higienizado se disponível, senão higienizar
    const safeId = article.id && !article.id.includes('/') ? article.id : String(articleId).replace(/[^a-zA-Z0-9_\-]/g, '_').slice(-100);

    const favRef = doc(db, 'users', user.uid, 'favorites', safeId);
    const isFav = favorites.some(f => f.id === safeId || f.articleId === articleId);
    
    try {
      if (isFav) {
        await deleteDoc(favRef);
      } else {
        await setDoc(favRef, {
          id: safeId,
          articleId: articleId,
          title: article.title || 'Sem Título',
          summary: article.summary || '',
          link: article.link || article.url || '',
          image_url: article.imageUrl || article.image_url || '',
          pubDate: article.publishedAt || article.pubDate || '',
          source_id: article.source || article.source_id || '',
          userId: user.uid,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, isFav ? OperationType.DELETE : OperationType.WRITE, `users/${user.uid}/favorites/${safeId}`);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-blue-500/30 font-sans overflow-x-hidden">
      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[20%] right-[-10%] w-[30%] h-[30%] bg-purple-600/10 rounded-full blur-[100px]" />
      </div>

      {/* Navbar */}
      <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-md h-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-foreground text-background font-serif font-black flex items-center justify-center text-xl shadow-lg">
                N
              </div>
              <span className="font-serif font-bold text-2xl tracking-tight text-foreground">
                NewsFlow <span className="text-blue-500 font-light italic">Journal</span>
              </span>
            </div>

            <div className="hidden lg:flex items-center gap-6 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              <button 
                onClick={() => { setView('home'); setSelectedCategory('Tudo'); }}
                className={cn("hover:text-foreground transition-colors", view === 'home' && selectedCategory === 'Tudo' && "text-foreground")}
              >
                Últimas Notícias
              </button>
              <button 
                onClick={() => { setView('home'); setSelectedCategory('Mundo'); }}
                className="hover:text-foreground transition-colors"
              >
                Mundo
              </button>
              <button 
                onClick={() => { setView('home'); setSelectedCategory('Tecnologia'); }}
                className={cn("hover:text-foreground transition-colors", selectedCategory === 'Tecnologia' && "text-foreground")}
              >
                Tecnologia
              </button>
              <button 
                onClick={fetchBriefing}
                className="hover:text-foreground transition-colors text-blue-400 flex items-center gap-1.5"
              >
                <Sparkles size={12} /> AI Analysis
              </button>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden text-muted-foreground hover:text-foreground"
            >
              <Menu size={20} />
            </button>
            <div className={cn(
              "hidden md:flex items-center gap-3 px-4 py-1.5 bg-muted border transition-all duration-300",
              isSearching || searchQuery !== debouncedQuery ? "border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.2)]" : "border-border"
            )}>
              {isSearching || (searchQuery !== debouncedQuery && searchQuery !== '') ? (
                <Loader2 size={14} className="text-blue-500 animate-spin" />
              ) : (
                <Search size={14} className="text-muted-foreground" />
              )}
              <input 
                type="text" 
                placeholder="PROCURAR ARTIGO..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-0 outline-0 text-[10px] font-bold tracking-widest w-40 md:w-32 lg:w-48 placeholder:text-muted-foreground/50 text-foreground transition-all focus:w-64"
              />
            </div>
            <div className="flex items-center gap-4">
               <span className="text-[10px] font-bold text-muted-foreground tracking-tight hidden lg:block">LONDON, {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} UTC</span>
               
               <button 
                  id="theme-toggle"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="w-10 h-10 border border-border flex items-center justify-center hover:bg-accent transition-colors"
                  aria-label="Toggle Theme"
               >
                  {theme === 'dark' ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-blue-600" />}
               </button>

               {user ? (
                 <div className="flex items-center gap-4">
                    <button 
                       onClick={requestNotificationPermission}
                       className={cn(
                         "w-10 h-10 border border-border flex items-center justify-center transition-colors",
                         notificationsEnabled ? "text-emerald-500 bg-emerald-500/5" : "text-muted-foreground hover:bg-accent"
                       )}
                       title={notificationsEnabled ? "Notificações Ativas" : "Ativar Notificações Push"}
                    >
                       <Bell size={18} fill={notificationsEnabled ? "currentColor" : "none"} />
                    </button>

                    {view === 'favorites' && (
                      <button 
                        onClick={exportFavoritesToPDF}
                        className="w-10 h-10 border border-border flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-colors"
                        title="Exportar para PDF"
                      >
                        <Download size={18} />
                      </button>
                    )}
                    <button 
                      onClick={() => setView(view === 'home' ? 'favorites' : 'home')}
                      className={cn(
                        "w-10 h-10 border border-border flex items-center justify-center transition-colors",
                        view === 'favorites' ? "bg-red-500 text-white border-red-500" : "hover:bg-accent text-muted-foreground"
                      )}
                      title="Meus Favoritos"
                    >
                      <HeartIcon size={18} fill={view === 'favorites' ? "currentColor" : "none"} />
                    </button>
                    <div className="flex items-center gap-3 pl-4 border-l border-border">
                      <div 
                        className="hidden sm:block text-right cursor-pointer group"
                        onClick={() => setIsProfileOpen(true)}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-widest text-foreground group-hover:text-blue-500 transition-colors">{user.displayName || 'Utilizador'}</div>
                        <button onClick={(e) => { e.stopPropagation(); signOut(auth); }} className="text-[9px] font-bold text-muted-foreground hover:text-red-500 transition-colors uppercase tracking-widest">Sair</button>
                      </div>
                      <div 
                        className="w-10 h-10 bg-muted border border-border flex items-center justify-center font-serif font-bold text-blue-500 cursor-pointer overflow-hidden group hover:border-blue-500 transition-all"
                        onClick={() => setIsProfileOpen(true)}
                      >
                        {user.photoURL ? (
                          <img 
                            src={user.photoURL} 
                            alt={user.displayName} 
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=0D8ABC&color=fff`;
                            }}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform" 
                          />
                        ) : (
                          user.displayName?.charAt(0) || user.email?.charAt(0).toUpperCase()
                        )}
                      </div>
                    </div>
                 </div>
               ) : (
                 <button 
                  onClick={() => setIsAuthOpen(true)}
                  className="h-10 px-6 border border-border flex items-center justify-center hover:bg-foreground hover:text-background transition-all text-[11px] font-bold uppercase tracking-widest"
                 >
                    Aceder
                 </button>
               )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-12">
        {/* Editorial Layout */}
        <div className="flex flex-col lg:flex-row gap-12 mb-20">
          {/* Main Story */}
          <div className="flex-1">
            <div className="border-b border-border pb-4 mb-8 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-blue-500 flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500" /> Manchete do Dia
              </span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Atualizado às 14:15</span>
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8 cursor-pointer"
              onClick={() => openReader(heroArticle)}
            >
              <div className="relative aspect-[16/8] overflow-hidden grayscale-[0.3] hover:grayscale-0 transition-all duration-1000">
                <img 
                  src={heroArticle?.imageUrl || heroArticle?.image_url || "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&q=80&w=1600"} 
                  alt="Feature Story"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-bold uppercase tracking-widest">
                  {heroArticle?.source || heroArticle?.source_id || 'Deep Space Intelligence'}
                </div>
              </div>

              <div className="max-w-4xl">
                <h1 className="text-4xl md:text-6xl font-serif font-bold leading-[1.05] tracking-tight mb-8 text-foreground">
                  {heroArticle?.title || 'The Future of Sovereign Artificial Intelligence'}
                </h1>
                
                <div className="flex gap-12 items-start">
                  <div className="flex-1 space-y-6">
                    <div className="space-y-4">
                      {(heroArticle?.summary || 'Nations are rapidly pivoting from cloud dependence to domestic compute infrastructure.').split('\n').filter((p: string) => p.trim() !== '').map((para: string, i: number) => (
                        <p 
                          key={i} 
                          className={cn(
                            "text-lg md:text-xl font-serif leading-relaxed text-foreground/80 line-clamp-4",
                            i === 0 && "first-letter:text-5xl first-letter:font-black first-letter:mr-3 first-letter:float-left first-letter:text-foreground"
                          )}
                        >
                          {para}
                        </p>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      <span>Por Redação NewsFlow</span>
                      <span className="w-1 h-1 rounded-full bg-border" />
                      <span>{heroArticle?.pubDate ? new Date(heroArticle.pubDate).toLocaleTimeString() : '7 Min de Leitura'}</span>
                    </div>
                  </div>

                  <div className="hidden md:block w-px h-32 bg-border self-center" />

                  <div className="hidden md:block w-48 space-y-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Análise Claude 3.5</div>
                    <p className="text-xs text-muted-foreground leading-relaxed font-serif">
                      Tendência geopolítica crítica para 2026. A soberania tecnológica torna-se o novo padrão ouro de segurança nacional.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Sidebar - Trending Intelligence */}
          <aside className="w-full lg:w-80 space-y-12">
             <section>
                <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-muted-foreground border-b border-border pb-4 mb-6">
                  Inteligência Global
                </h2>
                <div className="space-y-8">
                  {[
                    { id: '01', title: 'US Treasury on Stablecoin Risk', sentiment: 'Negative', color: 'rose' },
                    { id: '02', title: 'SpaceX Starship: Flight 7 Success', sentiment: 'Positive', color: 'emerald' },
                    { id: '03', title: 'Fusion Energy Milestone in UK Lab', sentiment: 'Neutral', color: 'blue' },
                  ].map(item => (
                    <div 
                      key={item.id} 
                      className="group border-b border-border pb-6 last:border-0 cursor-pointer"
                      onClick={() => setSearchQuery(item.title)}
                    >
                      <div className="flex gap-4 items-start mb-3">
                        <span className="font-serif italic text-xl text-muted-foreground/30 group-hover:text-blue-500 transition-colors">{item.id}</span>
                        <h4 className="font-serif font-bold text-base leading-tight group-hover:text-foreground transition-colors text-foreground">{item.title}</h4>
                      </div>
                      <div className="flex items-center gap-2 pl-8">
                        <div className={`w-1 h-1 rounded-full bg-${item.color}-500 shadow-[0_0_5px_currentColor]`} />
                        <span className={`text-[9px] font-bold uppercase tracking-widest text-${item.color}-500`}>{item.sentiment}</span>
                      </div>
                    </div>
                  ))}
                </div>
             </section>

             <section className="bg-muted p-6 border border-border">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-6">Suas Preferências</h3>
                <div className="space-y-4">
                   {userPreferences.length > 0 ? (
                     userPreferences.map(pref => (
                        <div key={pref} className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase text-foreground">
                            {pref}
                          </span>
                          <button 
                            onClick={() => toggleCategoryDirectly(pref)}
                            className="relative w-10 h-5 bg-blue-500 px-0.5 flex items-center"
                          >
                             <motion.div 
                               animate={{ x: 20 }}
                               className="w-4 h-4 bg-white shadow-sm" 
                             />
                          </button>
                        </div>
                     ))
                   ) : (
                     <p className="text-[10px] italic text-muted-foreground">Nenhum interesse selecionado.</p>
                   )}
                </div>
                <button 
                  onClick={() => user ? setIsPreferencesOpen(true) : setIsAuthOpen(true)}
                  className="w-full mt-8 py-3 bg-foreground text-background font-bold text-[10px] uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all"
                >
                  {user ? 'Ajustar Todos Interesses' : 'Entrar para Customizar'}
                </button>
             </section>
          </aside>
        </div>

        {/* Categories Bar */}
        <div className="relative border-y border-border mb-12 hidden md:block">
          {/* Faded Edges Indicators */}
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none md:hidden" />
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none md:hidden" />
          
          <div className="py-4 overflow-x-auto no-scrollbar scroll-smooth" ref={scrollContainerRef}>
            <div className="flex items-center justify-start md:justify-center gap-8 md:gap-12 min-w-max px-8 md:px-4">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  data-active={selectedCategory === cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "relative text-[10px] font-bold uppercase tracking-[0.2em] transition-all whitespace-nowrap",
                    selectedCategory === cat 
                      ? "text-blue-500" 
                      : "text-muted-foreground hover:text-foreground hover:scale-105"
                  )}
                >
                  {cat}
                  {selectedCategory === cat && (
                    <motion.div 
                      layoutId="cat-indicator"
                      className="absolute -bottom-1 left-0 right-0 h-0.5 bg-blue-500"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Secondary News Grid */}
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-sm font-serif font-bold italic text-muted-foreground">
            {view === 'home' ? 'Análises & Perspectivas' : 'Seus Artigos Favoritos'}
          </h2>
          <div className="h-px bg-border flex-1 mx-8" />
          {view === 'home' && (
            <div className="flex gap-4">
              <button 
                onClick={() => fetchNews("")} 
                className="p-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Voltar ao início"
              >
                <ChevronRight size={14} className="rotate-180" />
              </button>
              <button 
                onClick={() => nextPage && fetchNews(nextPage)} 
                disabled={!nextPage}
                className="p-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
        
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <React.Fragment key="skeletons">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <NewsSkeleton key={i} />
                ))}
              </React.Fragment>
            ) : error ? (
              <div key="error" className="col-span-full py-20 text-center border-2 border-dashed border-red-500/30 bg-red-500/5">
                <p className="font-serif italic text-red-500 mb-4">{error}</p>
                <button 
                  onClick={() => fetchNews()}
                  className="px-6 py-2 border border-red-500 text-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                >
                  Tentar Novamente
                </button>
              </div>
            ) : (
              <React.Fragment key="news">
                {filteredNews.length > 0 ? (
                  filteredNews.map((item) => (
                    <NewsCard
                      key={item.id}
                      id={item.id}
                      title={item.title}
                      summary={item.summary}
                      url={item.link || item.url}
                      imageUrl={item.imageUrl || item.image_url}
                      source={item.source || item.source_id}
                      publishedAt={item.publishedAt || item.pubDate}
                      sentiment={item.sentiment}
                      tags={item.tags || []}
                      isFavorited={favorites.some(f => f.id === item.id || f.articleId === item.originalId)}
                      onFavoriteToggle={(e) => {
                        e.stopPropagation();
                        toggleFavorite(item);
                      }}
                      onCompare={(e) => {
                        e.stopPropagation();
                        handleTopicComparison(item);
                      }}
                      onClick={() => openReader(item)}
                    />
                  ))
                ) : (
                  <div className="col-span-full py-20 text-center border-2 border-dashed border-border">
                    <p className="font-serif italic text-muted-foreground">Nenhum artigo encontrado nesta secção.</p>
                  </div>
                )}
              </React.Fragment>
            )}
          </AnimatePresence>
        </section>

        {/* Pagination Section - Simplified for nextPage */}
        {view === 'home' && nextPage && (
          <div className="mt-20 pt-8 border-t border-border flex justify-center">
            <button 
              onClick={() => fetchNews(nextPage)}
              className="px-12 py-4 bg-foreground text-background font-bold text-[11px] uppercase tracking-[0.3em] hover:bg-blue-600 hover:text-white transition-all shadow-xl"
            >
              Carregar Mais Notícias
            </button>
          </div>
        )}

        {user && !user.emailVerified && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 py-2 px-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 flex items-center justify-center gap-2">
              <Bell size={12} /> Email não verificado. Algumas funcionalidades (como favoritos) podem estar restritas.
            </p>
          </div>
        )}

        {systemMessage && (
          <div className={cn(
            "fixed bottom-4 right-4 z-50 p-4 rounded-lg shadow-2xl border animate-in fade-in slide-in-from-bottom-4 duration-300",
            systemMessage.type === 'error' ? "bg-red-500 text-white border-red-600" :
            systemMessage.type === 'success' ? "bg-emerald-500 text-white border-emerald-600" :
            "bg-slate-800 text-white border-slate-700"
          )}>
            <div className="flex items-center gap-3">
              <Bell size={18} />
              <p className="text-sm font-medium">{systemMessage.text}</p>
              <button onClick={() => setSystemMessage(null)} className="ml-2 hover:bg-white/20 p-1 rounded transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
        
        {/* Topic Comparison Modal */}
        <AnimatePresence>
          {isComparing && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-card border border-border p-8 max-w-2xl w-full shadow-2xl relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-4">
                  <Repeat2 size={12} /> Analisando Cobertura Cruzada
                </div>
                <h3 className="text-2xl font-serif font-bold mb-6">Aguarde enquanto comparamos as fontes...</h3>
                <div className="space-y-4">
                  <div className="h-4 bg-muted animate-pulse w-full" />
                  <div className="h-4 bg-muted animate-pulse w-[90%]" />
                  <div className="h-4 bg-muted animate-pulse w-[95%]" />
                </div>
              </motion.div>
            </div>
          )}

          {comparisonData && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md overflow-y-auto">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="bg-card border border-border p-8 max-w-3xl w-full shadow-2xl relative my-8"
              >
                <button 
                  onClick={() => setComparisonData(null)}
                  className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
                >
                  <X size={20} />
                </button>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-4">
                  <Repeat2 size={12} /> Diferentes Perspectivas
                </div>
                <h3 className="text-2xl font-serif font-bold mb-6 italic border-b border-border pb-4">
                  &quot;{comparisonData.articleTitle}&quot;
                </h3>
                
                <div className="space-y-8 font-serif leading-relaxed">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">Síntese de Cobertura</h4>
                    <p className="text-foreground/90">{comparisonData.summary || "Análise indisponível para este tópico no momento."}</p>
                  </div>
                  
                  {comparisonData.tags && (
                    <div className="flex flex-wrap gap-2">
                      {comparisonData.tags.map((tag: string) => (
                        <span key={tag} className="px-2 py-1 bg-muted border border-border text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="pt-6 border-t border-border">
                    <p className="text-[10px] text-muted-foreground italic">
                      * Esta análise é gerada por Inteligência Artificial ao comparar padrões de discurso comuns em diferentes tipos de veículos mediáticos.
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {user && (
          <PreferencesModal 
            isOpen={isPreferencesOpen} 
            onClose={() => setIsPreferencesOpen(false)} 
            userId={user.uid}
            initialPreferences={userPreferences}
          />
        )}
        {user && (
          <ProfileModal
            isOpen={isProfileOpen}
            onClose={() => setIsProfileOpen(false)}
            user={user}
          />
        )}

        {/* Mobile Sidebar Menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <div className="fixed inset-0 z-[100] lg:hidden">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute top-0 left-0 bottom-0 w-[280px] bg-card border-r border-border shadow-2xl flex flex-col"
              >
                <div className="p-6 border-b border-border flex items-center justify-between">
                  <span className="font-serif font-black text-xl tracking-tight">N</span>
                  <button onClick={() => setIsMobileMenuOpen(false)} className="text-muted-foreground hover:text-foreground">
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Categorias</h3>
                    <div className="grid grid-cols-1 gap-2">
                      {CATEGORIES.map(cat => (
                        <button
                          key={cat}
                          onClick={() => {
                            setSelectedCategory(cat);
                            setView('home');
                            setIsMobileMenuOpen(false);
                          }}
                          className={cn(
                            "flex items-center justify-between p-3 text-xs font-bold uppercase tracking-widest transition-colors",
                            selectedCategory === cat && view === 'home'
                              ? "bg-blue-500/10 text-blue-500 border-l-2 border-blue-500" 
                              : "text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {cat}
                          {selectedCategory === cat && view === 'home' && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Conta & Extras</h3>
                    <div className="space-y-2">
                      <button 
                        onClick={() => { fetchBriefing(); setIsMobileMenuOpen(false); }}
                        className="w-full flex items-center gap-3 p-3 text-xs font-bold uppercase tracking-widest text-blue-400 hover:bg-muted transition-colors"
                      >
                        <Sparkles size={16} /> AI Analysis
                      </button>
                      {user ? (
                        <>
                          <button 
                            onClick={() => { setView('favorites'); setIsMobileMenuOpen(false); }}
                            className={cn(
                              "w-full flex items-center gap-3 p-3 text-xs font-bold uppercase tracking-widest transition-colors",
                              view === 'favorites' ? "text-red-500 bg-red-500/5" : "text-muted-foreground hover:bg-muted"
                            )}
                          >
                            <HeartIcon size={16} fill={view === 'favorites' ? "currentColor" : "none"} /> Favoritos
                          </button>
                          <button 
                            onClick={() => { setIsProfileOpen(true); setIsMobileMenuOpen(false); }}
                            className="w-full flex items-center gap-3 p-3 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted transition-colors"
                          >
                            <User size={16} /> Meu Perfil
                          </button>
                          <button 
                            onClick={() => { setIsPreferencesOpen(true); setIsMobileMenuOpen(false); }}
                            className="w-full flex items-center gap-3 p-3 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted transition-colors"
                          >
                            <Settings size={16} /> Preferências
                          </button>
                          <button 
                            onClick={() => { signOut(auth); setIsMobileMenuOpen(false); }}
                            className="w-full flex items-center gap-3 p-3 text-xs font-bold uppercase tracking-widest text-red-500 hover:bg-red-500/5 transition-colors"
                          >
                            <LogOut size={16} /> Sair
                          </button>
                        </>
                      ) : (
                        <button 
                          onClick={() => { setIsAuthOpen(true); setIsMobileMenuOpen(false); }}
                          className="w-full flex items-center gap-3 p-3 text-xs font-bold uppercase tracking-widest text-foreground bg-foreground text-background hover:bg-blue-500 hover:text-white transition-all"
                        >
                          <User size={16} /> Entrar / Registar
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-border mt-auto">
                   <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
                    © 2026 NEWSFLOW INTERACTIVE
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Article Reader Modal */}
        <AnimatePresence>
          {activeArticle && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActiveArticle(null)}
                className="absolute inset-0 bg-background/95 backdrop-blur-xl"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 30 }}
                className="relative w-full max-w-4xl bg-card border-x border-border h-full sm:h-[95vh] overflow-hidden flex flex-col sm:shadow-2xl sm:rounded-xl"
              >
                {/* Reader Header */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-foreground text-background flex items-center justify-center font-serif font-black">N</div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hidden sm:inline">Modo Leitura NewsFlow</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <a 
                      href={activeArticle.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold uppercase tracking-widest text-blue-500 hover:underline"
                    >
                      Fonte Original
                    </a>
                    <button 
                      onClick={() => setActiveArticle(null)}
                      className="p-1 hover:bg-muted rounded-full transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-10 md:px-16 md:py-20 custom-scrollbar">
                  {loadingReader ? (
                    <div className="max-w-2xl mx-auto space-y-8 animate-pulse">
                      <div className="h-12 bg-muted rounded w-3/4" />
                      <div className="space-y-4">
                        <div className="h-4 bg-muted rounded w-full" />
                        <div className="h-4 bg-muted rounded w-full" />
                        <div className="h-4 bg-muted rounded w-2/3" />
                      </div>
                      <div className="h-64 bg-muted rounded w-full" />
                    </div>
                  ) : readingContent ? (
                    <article className="max-w-2xl mx-auto">
                      <header className="mb-12">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 text-[10px] font-bold uppercase tracking-widest">
                            {activeArticle.category || activeArticle.tags?.[0] || 'Notícia'}
                          </span>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                            {new Date(activeArticle.publishedAt || activeArticle.pubDate).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                        </div>
                        <h1 className="text-3xl md:text-5xl font-serif font-bold leading-tight mb-6">
                          {readingContent.title || activeArticle.title}
                        </h1>
                        {readingContent.author && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <User size={14} />
                            <span>Por {readingContent.author}</span>
                          </div>
                        )}
                      </header>

                      <div className="prose prose-invert prose-lg max-w-none">
                        {(readingContent.content || '').split('\n').filter((p: string) => p.trim() !== '').map((para: string, i: number) => (
                          <p 
                            key={i} 
                            className={cn(
                              "text-lg md:text-xl leading-relaxed text-foreground/90 font-serif mb-6",
                              i === 0 && "first-letter:text-5xl first-letter:font-black first-letter:mr-3 first-letter:float-left"
                            )}
                          >
                            {para}
                          </p>
                        ))}
                      </div>

                      <footer className="mt-16 pt-8 border-t border-border flex flex-col items-center gap-6">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Fim da Transmissão</div>
                        <button 
                          onClick={() => setActiveArticle(null)}
                          className="px-8 py-3 bg-foreground text-background font-bold text-[11px] uppercase tracking-[0.2em] hover:bg-blue-600 hover:text-white transition-all shadow-xl"
                        >
                          Voltar ao Feed Principal
                        </button>
                      </footer>
                    </article>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <p className="font-serif italic text-muted-foreground">Erro ao carregar conteúdo estruturado.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Briefing Modal */}
        <AnimatePresence>
          {isBriefingOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsBriefingOpen(false)}
                className="absolute inset-0 bg-background/80 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-2xl bg-card border border-border shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[95vh] rounded-lg custom-scrollbar"
              >
                <button 
                  onClick={() => setIsBriefingOpen(false)}
                  className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
                >
                  <X size={20} />
                </button>

                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Sparkles className="text-blue-500" size={24} />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-2xl">Outlook Estratégico</h3>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest">Powered by NewsFlow AI</p>
                  </div>
                </div>

                {loadingBriefing ? (
                  <div className="space-y-4 py-8">
                    <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
                    <div className="h-4 bg-muted rounded w-full animate-pulse" />
                    <div className="h-4 bg-muted rounded w-5/6 animate-pulse" />
                  </div>
                ) : briefingData ? (
                  <div className="space-y-6">
                    <div>
                      <p className="text-lg leading-relaxed font-serif text-foreground/90 italic">
                        &quot;{briefingData.outlook}&quot;
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-border">
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Destaques Chave</h4>
                        <ul className="space-y-2">
                          {briefingData.highlights?.map((h: string, i: number) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <span className="text-blue-500 font-bold">•</span>
                              {h}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="p-4 bg-muted/50 border border-border rounded-lg">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-2">Recomendação</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {briefingData.recommendation}
                        </p>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => setIsBriefingOpen(false)}
                      className="w-full py-4 border border-blue-500/30 text-blue-400 font-bold uppercase tracking-widest text-[10px] hover:bg-blue-500/5 transition-colors mt-4"
                    >
                      Entendido, Voltar ao Feed
                    </button>
                  </div>
                ) : null}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Action Bar (Mobile) */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 md:hidden">
          <div className="flex items-center gap-4 px-6 py-3 bg-background/80 backdrop-blur-xl border border-border rounded-full shadow-2xl">
            <button 
              onClick={() => { setView('home'); setSelectedCategory('Tudo'); }}
              className={cn("transition-colors", view === 'home' ? "text-blue-400" : "text-muted-foreground")}
              title="Home"
            >
              <Newspaper size={20} />
            </button>
            <div className="w-px h-4 bg-border" />
            <button 
              onClick={() => user ? setView('favorites') : setIsAuthOpen(true)}
              className={cn("transition-colors", view === 'favorites' ? "text-red-500" : "text-muted-foreground")}
              title="Favoritos"
            >
              <HeartIcon size={20} fill={view === 'favorites' ? "currentColor" : "none"} />
            </button>
            <div className="w-px h-4 bg-border" />
            <button 
              onClick={fetchBriefing}
              className={cn("transition-colors", isBriefingOpen ? "text-blue-400" : "text-muted-foreground")}
              title="Análise IA"
            >
              <Sparkles size={20} />
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-16 bg-muted">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-blue-500 text-[10px] font-black tracking-[0.5em] uppercase mb-6">
            Powered by Gemini 3 Flash & NewsFlow Engine
          </p>
          <div className="flex justify-center gap-12 mb-10">
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-[10px] font-bold uppercase tracking-widest">Privacidade</a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-[10px] font-bold uppercase tracking-widest">Termos</a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors text-[10px] font-bold uppercase tracking-widest">API Infrastructure</a>
          </div>
          <p className="text-muted-foreground/50 text-[9px] font-black uppercase tracking-[0.2em]">
            © 2026 NEWSFLOW 2.0. ALL SYSTEMS OPERATIONAL.
          </p>
        </div>
      </footer>
    </div>
  );
}


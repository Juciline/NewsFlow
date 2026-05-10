import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import axios from "axios";
import { createServer as createViteServer } from "vite";
import { SimpleCache } from "./utils/cache.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middlewares
  app.use(cors());
  app.use(express.json());

  // Cache em memória usando a utility
  const newsCache = new SimpleCache<any>(15 * 60 * 1000); // 15 minutos
  const analysisCache = new SimpleCache<any>(24 * 60 * 60 * 1000); // 24 horas
  
  // API Rota de Health Check
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: "NewsFlow 2.0 API",
      cacheSize: {
        news: newsCache.size,
        analysis: analysisCache.size
      }
    });
  });

  // Rota para buscar notícias (integraçao com CurrentsAPI)
  app.get("/api/news", async (req, res) => {
    const { category = "top", page = "", q = "" } = req.query;
    const currentsKey = process.env.CURRENTS_API_KEY;

    // Chave única para o cache
    const cacheKey = `${category}-${page}-${q}`;
    const cachedData = newsCache.get(cacheKey);

    if (cachedData) {
      console.log(`[Cache] Usando dados em cache para: ${cacheKey}`);
      return res.json(cachedData);
    }

    // Se não houver a API Key, usa mock
    if (!currentsKey || currentsKey.trim() === "") {
      console.warn("CURRENTS_API_KEY não definida. Usando dados mockados.");
      return res.json({
        articles: [
          {
            id: "1",
            title: "Avanços na Fusão Nuclear em 2026",
            summary: "Cientistas alcançaram um marco histórico na produção de energia limpa através da fusão nuclear.",
            source: "Scientific Alpha",
            publishedAt: new Date().toISOString(),
            imageUrl: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=1200",
            sentiment: "Positivo",
            tags: ["Ciência", "Energia"]
          },
          {
            id: "2",
            title: "Exploração de Marte: Colônia Alpha Estabelecida",
            summary: "A primeira base humana em Marte reporta sucesso nos sistemas de suporte de vida.",
            source: "Mars Chronicles",
            publishedAt: new Date().toISOString(),
            imageUrl: "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&q=80&w=1200",
            sentiment: "Positivo",
            tags: ["Espaço", "Futuro"]
          }
        ],
        totalResults: 2,
        nextPage: null
      });
    }

    try {
      // CurrentsAPI Integration
      if (currentsKey && currentsKey !== "") {
        try {
          const categoryMap: any = {
            'top': 'general',
            'business': 'business',
            'entertainment': 'entertainment',
            'health': 'lifestyle',
            'science': 'science',
            'sports': 'sports',
            'technology': 'technology',
            'world': 'world'
          };

          // CurrentsAPI prefere uma única categoria ou formato específico
          // Se for lista, pegamos a primeira
          const firstCategory = category.toString().split(',')[0].toLowerCase();
          const currentsCategory = categoryMap[firstCategory] || 'general';
          
          const params: any = {
            apiKey: currentsKey,
            language: "pt",
            category: currentsCategory,
          };

          if (q && q.toString().trim() !== "") params.keywords = q;

          const response = await axios.get("https://api.currentsapi.services/v1/search", { params, timeout: 8000 });

          if (response.data.status === "ok") {
            const articles = (response.data.news || []).map((article: any) => ({
              id: article.id,
              title: article.title,
              summary: article.description || "Sem descrição disponível.",
              source: article.author || "CurrentsAPI",
              publishedAt: article.published,
              imageUrl: article.image !== "None" ? article.image : "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=1200",
              link: article.url,
              sentiment: "Neutro",
              tags: [category.toString()]
            }));

            const responseData = {
              articles,
              totalResults: articles.length,
              nextPage: null,
              provider: "currentsapi.services"
            };

            newsCache.set(cacheKey, responseData);
            return res.json(responseData);
          }
        } catch (e: any) {
          console.warn("CurrentsAPI falhou:", e.message);
        }
      }

      // Se chegar aqui e nada funcionou
      res.status(500).json({ 
        error: "Falha ao carregar notícias de todas as fontes.",
        status: "error"
      });

    } catch (error: any) {
      console.error("Erro geral na API News:", error.message);
      res.status(500).json({ 
        error: "Erro interno ao processar notícias.",
        status: "error"
      });
    }
  });

  // Novo endpoint para o Reader Mode (Modo Leitura)
  app.post("/api/article-reader", async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: "URL é necessária." });
    }

    try {
      const { load } = await import("cheerio");
      const response = await axios.get(url, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const $ = load(response.data);
      
      // Limpeza básica
      $('script, style, nav, footer, header, iframe, ads, .ads, #ads').remove();
      
      const title = $('h1').first().text().trim();
      
      // Estratégia simples de extração de conteúdo
      // Procura por containers comuns de artigos
      let content = '';
      const contentSelectors = ['article', '.article-body', '.post-content', '.content', '#content', '.entry-content', '.story-body'];
      
      for (const selector of contentSelectors) {
        const el = $(selector);
        if (el.length > 0) {
          content = el.find('p').map((i, p) => $(p).text().trim()).get().join('\n\n');
          if (content.length > 200) break;
        }
      }

      // Fallback: todos os parágrafos se não achou container específico
      if (content.length < 200) {
        content = $('p').map((i, p) => $(p).text().trim()).get().join('\n\n');
      }

      res.json({
        title: title || "Sem Título",
        content: content || "Não foi possível extrair o conteúdo deste artigo.",
        author: $('meta[name="author"]').attr('content') || "Desconhecido",
        date: $('meta[property="article:published_time"]').attr('content') || null
      });

    } catch (error: any) {
      console.error("Erro no Reader Mode:", error.message);
      res.status(500).json({ error: "Falha ao processar o artigo para leitura." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      configFile: path.resolve(process.cwd(), "frontend/vite.config.ts"),
      root: path.resolve(process.cwd(), "frontend"),
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 NewsFlow 2.0 Service\n`);
    console.log(`Frontend: http://localhost:${PORT}`);
    console.log(`Health:   http://localhost:${PORT}/api/health`);
    console.log(`\nEnvironment: ${process.env.NODE_ENV || 'development'}\n`);
  });
}

startServer().catch((err) => {
  console.error("Erro ao iniciar o servidor:", err);
  process.exit(1);
});

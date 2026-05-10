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

  // Logging middleware (fundamental para debug em "produção")
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Validação de Configuração Inicial
  console.log("--- CONFIGURAÇÃO DE AMBIENTE ---");
  const config = {
    GEMINI_KEY: process.env.GEMINI_API_KEY ? "DEFINIDA (OK)" : "NÃO DEFINIDA (ERRO)",
    CURRENTS_KEY: process.env.CURRENTS_API_KEY ? "DEFINIDA (OK)" : "NÃO DEFINIDA (MOCK MODE)",
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: PORT
  };
  console.table(config);
  if (!process.env.GEMINI_API_KEY) {
    console.warn("AVISO: GEMINI_API_KEY não encontrada. A IA funcionará apenas em modo Mock/Resumo Simples.");
  }
  console.log("--------------------------------\n");

  // Cache em memória usando a utility
  const newsCache = new SimpleCache<any>(15 * 60 * 1000); // 15 minutos
  const analysisCache = new SimpleCache<any>(24 * 60 * 60 * 1000); // 24 horas
  
  // 1. API Rota de Health Check
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

  // 2. AI Endpoints (Mover para cá para garantir que são registrados antes do catch-all)
  let lastQuotaErrorTime = 0;
  const QUOTA_COOLDOWN = 30000;

  app.post("/api/analyze", async (req, res) => {
    const { title, content, link } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!title || !content) {
      return res.status(400).json({ error: "Título e conteúdo são necessários." });
    }

    const cacheKey = `analysis:${link || title}`;
    const cached = analysisCache.get(cacheKey);
    if (cached) return res.json(cached);

    const now = Date.now();
    if (now - lastQuotaErrorTime < QUOTA_COOLDOWN) {
      return res.json({
        title,
        summary: content.slice(0, 160).split('.').slice(0, 2).join('.') + "...",
        sentiment: "Neutro",
        tags: ["Atualidades"]
      });
    }

    if (!apiKey || apiKey.includes("YOUR_") || apiKey.length < 10) {
      return res.json({
        title,
        summary: content.slice(0, 150) + "...",
        sentiment: "Neutro",
        tags: ["Geral"]
      });
    }

    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      
      if (!apiKey || apiKey === "") {
        throw new Error("API_KEY_MISSING");
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `Analise a seguinte notícia:
             Título Original: ${title}
             Conteúdo Original: ${content}

             Forneça o seguinte em formato JSON, garantindo que TODO o texto de saída esteja em PORTUGUÊS:
             1. O título traduzido para Português (se necessário).
             2. Um resumo neutro e traduzido de exatamente 2 frases.
             3. Análise de sentimento (Positivo, Negativo ou Neutro).
             4. Três tags de categorias relevantes em Português.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let responseText = response.text();
      
      // Limpar possíveis Markdown code blocks
      responseText = responseText.replace(/```json\n?|```/g, "").trim();
      
      if (!responseText) throw new Error("Resposta vazia da IA");
      const parsed = JSON.parse(responseText);
      analysisCache.set(cacheKey, parsed);
      res.json(parsed);
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      const isAuthError = errorMsg.includes('API key not valid') || 
                         errorMsg.includes('API_KEY_INVALID') || 
                         errorMsg.includes('API_KEY_MISSING');
      
      if (isAuthError) {
        console.error("\n❌ DIAGNÓSTICO: Falha de Autenticação no Gemini.");
        console.error("Ação Necessária: Obtenha uma chave em https://aistudio.google.com/app/apikey e adicione em 'Settings -> Environment Variables' com o nome GEMINI_API_KEY.\n");
      } else {
        console.error("Gemini analysis error:", errorMsg);
      }

      if (errorMsg.includes('429') || error.status === 429) {
        lastQuotaErrorTime = Date.now();
      }
      res.json({
        title,
        summary: content.slice(0, 160).split('.').slice(0, 2).join('.') + (isAuthError ? " (Erro de Configuração API Key)..." : " (Análise Indisponível)..."),
        sentiment: "Neutro",
        tags: ["Atualidades"]
      });
    }
  });

  app.post("/api/briefing", async (req, res) => {
    const { articles } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!articles || !Array.isArray(articles)) {
      return res.status(400).json({ error: "Artigos inválidos." });
    }

    const headlines = articles.slice(0, 5).map(a => a.title).join("\n- ");
    const cacheKey = `briefing:${headlines}`;
    const cached = analysisCache.get(cacheKey);
    if (cached) return res.json(cached);

    const now = Date.now();
    if (now - lastQuotaErrorTime < QUOTA_COOLDOWN) {
      return res.json({
        outlook: "O serviço de IA está em pausa para evitar sobrecarga (Quota 429). Tente novamente em 30 segundos.",
        highlights: ["Continue explorando o feed", "Análise automática pausada"],
        recommendation: "Recarregue o briefing em instantes."
      });
    }

    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey || '');
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `Com base nestas manchetes:\n- ${headlines}\n\nCrie um "Panorama Inteligente" em Português:
        1. Outlook: Um parágrafo equilibrado e analítico sobre o estado atual destas notícias.
        2. Highlights: Três pontos cruciais destacados.
        3. Recomendação: O que leitor deve observar a seguir.
        Retorne SEMPRE em formato JSON válido com estas chaves: "outlook", "highlights" (array), "recommendation".`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let responseText = response.text();
      
       // Limpar possíveis Markdown code blocks
      responseText = responseText.replace(/```json\n?|```/g, "").trim();

      if (!responseText) throw new Error("Resposta vazia da IA");
      const parsed = JSON.parse(responseText);
      analysisCache.set(cacheKey, parsed);
      res.json(parsed);
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      const isAuthError = errorMsg.includes('API key not valid') || 
                         errorMsg.includes('API_KEY_INVALID') || 
                         errorMsg.includes('API_KEY_MISSING');
      
      if (isAuthError) {
        console.error("\n❌ DIAGNÓSTICO: Falha de Autenticação no Gemini (Briefing).");
        console.error("Verifique se GEMINI_API_KEY está configurada adequadamente nas Settings.\n");
      } else {
        console.error("Gemini briefing error:", errorMsg);
      }

      if (errorMsg.includes('429') || error.status === 429) {
        lastQuotaErrorTime = Date.now();
      }
      res.json({
        outlook: isAuthError 
          ? "Erro Crítico: Chave de API Google Gemini Inválida. Verifique as configurações do projeto." 
          : "Não foi possível gerar a análise inteligente no momento.",
        highlights: ["Siga as notícias locais", "Feed principal disponível"],
        recommendation: "Continue acompanhando as notícias em tempo real."
      });
    }
  });

  // 3. Rota para buscar notícias (integraçao com CurrentsAPI)
  app.get("/api/news", async (req, res) => {
    console.log(`[API NEWS] Request: category=${req.query.category}, q=${req.query.q}`);
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
      if (currentsKey && currentsKey.trim() !== "") {
        console.log(`[News] Tentando buscar notícias reais com a chave fornecida...`);
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

          const catStr = (category || "top").toString();
          const firstCategory = catStr.split(',')[0].toLowerCase();
          const currentsCategory = categoryMap[firstCategory] || 'general';
          
          const params: any = {
            apiKey: currentsKey,
            language: "pt",
            category: currentsCategory,
          };

          if (q && q.toString().trim() !== "") params.keywords = q;

          const response = await axios.get("https://api.currentsapi.services/v1/search", { 
            params, 
            timeout: 8000,
            validateStatus: (status) => status < 500 // Não lança erro se for 401/403
          });

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
              tags: [catStr]
            }));

            const responseData = {
              articles,
              totalResults: articles.length,
              nextPage: null,
              provider: "currentsapi.services"
            };

            newsCache.set(cacheKey, responseData);
            return res.json(responseData);
          } else {
            console.warn(`[News] API retornou erro: ${response.data.message || 'Erro desconhecido'}`);
          }
        } catch (e: any) {
          console.warn(`[News] Erro na requisição à CurrentsAPI: ${e.message}`);
          if (e.response && e.response.status === 401) {
            console.error("ERRO CRÍTICO: CURRENTS_API_KEY Inválida nas Settings!");
          }
        }
      }

      // Fallback para Mock se a API falhar ou não houver chave
      console.log(`[News] Usando dados mockados (Fallback ou Sem Chave).`);
      const mockData = {
        articles: [
          {
            id: "mock1",
            title: "Avanços na Fusão Nuclear em 2026",
            summary: "Cientistas alcançaram um marco histórico na produção de energia limpa através da fusão nuclear.",
            source: "Scientific Alpha",
            publishedAt: new Date().toISOString(),
            imageUrl: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=1200",
            sentiment: "Positivo",
            tags: ["Ciência", "Energia"]
          },
          {
            id: "mock2",
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
        nextPage: null,
        provider: "mock-data"
      };
      
      return res.json(mockData);

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

  // 4. Fallback para rotas /api não encontradas (evita retornar o index.html para chamadas de API)
  app.use("/api/*", (req, res) => {
    console.warn(`[API 404] Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: `Rota de API não encontrada: ${req.originalUrl}` });
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

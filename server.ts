import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import axios from "axios";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middlewares
  app.use(cors());
  app.use(express.json());

  // Cache em memória
  const newsCache = new Map<string, { data: any, timestamp: number }>();
  const analysisCache = new Map<string, { data: any, timestamp: number }>();
  const pendingAnalyses = new Map<string, Promise<any>>();
  
  const CACHE_TTL = 15 * 60 * 1000; // 15 minutos para notícias
  const ANALYSIS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas para análises

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

  // Novo endpoint de análise com cache e coalescência de requisições
  app.post("/api/analyze", async (req, res) => {
    const { title, content, link } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!title || !content) {
      return res.status(400).json({ error: "Título e conteúdo são necessários." });
    }

    // Chave do cache baseada no link ou título
    const analysisKey = link || title;
    
    // 1. Verificar Cache
    const cached = analysisCache.get(analysisKey);
    if (cached && (Date.now() - cached.timestamp < ANALYSIS_CACHE_TTL)) {
      return res.json(cached.data);
    }

    // 2. Coalescência de Requisições (evitar múltiplas chamadas simultâneas para o mesmo item)
    if (pendingAnalyses.has(analysisKey)) {
      try {
        const result = await pendingAnalyses.get(analysisKey);
        return res.json(result);
      } catch (e) {
        // Se falhar a pendente, tentamos de novo abaixo ou enviamos erro
      }
    }

    if (!apiKey) {
      return res.json({
        title,
        summary: content.slice(0, 150) + "...",
        sentiment: "Neutro",
        tags: ["Geral"]
      });
    }

    // 3. Executar Análise
    const analysisPromise = (async () => {
      try {
        const { GoogleGenAI, Type } = await import("@google/genai");
        
        // Se a chave for placeholder ou vazia, não tenta
        if (!apiKey || apiKey.includes("YOUR_") || apiKey.length < 10) {
          throw new Error("API Key inválida ou não configurada.");
        }

        const ai = new GoogleGenAI({ apiKey });
        
        const prompt = `Analise a seguinte notícia:
        Título Original: ${title}
        Conteúdo Original: ${content}

        Forneça o seguinte em formato JSON, garantindo que TODO o texto de saída esteja em PORTUGUÊS:
        1. O título traduzido para Português (se necessário).
        2. Um resumo neutro e traduzido de exatamente 2 frases.
        3. Análise de sentimento (Positivo, Negativo ou Neutro).
        4. Três tags de categorias relevantes em Português.`;

        const response = await ai.models.generateContent({
          model: "gemini-1.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                sentiment: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["title", "summary", "sentiment", "tags"],
            },
          },
        });

        const result = JSON.parse(response.text);
        analysisCache.set(analysisKey, { data: result, timestamp: Date.now() });
        return result;
      } catch (error: any) {
        // Log simplificado se for apenas chave inválida para não poluir o terminal
        if (error.message?.includes("key not valid") || error.message?.includes("não configurada")) {
          console.warn(`[Gemini Skip] ${analysisKey}: API Key ausente ou inválida.`);
        } else {
          console.error(`[Gemini Error] ${analysisKey}:`, error.message);
        }
        throw error;
      } finally {
        pendingAnalyses.delete(analysisKey);
      }
    })();

    pendingAnalyses.set(analysisKey, analysisPromise);

    try {
      const result = await analysisPromise;
      res.json(result);
    } catch (error: any) {
      // Fallback amigável em caso de erro (incluindo 429)
      const fallback = {
        title,
        summary: content.slice(0, 150) + "...",
        sentiment: "Neutro",
        tags: ["Atualidades"]
      };
      res.json(fallback);
    }
  });

  // Rota para buscar notícias (integraçao com CurrentsAPI)
  app.get("/api/news", async (req, res) => {
    const { category = "top", page = "", q = "" } = req.query;
    const currentsKey = process.env.CURRENTS_API_KEY;

    // Chave única para o cache
    const cacheKey = `${category}-${page}-${q}`;
    const cachedData = newsCache.get(cacheKey);

    if (cachedData && (Date.now() - cachedData.timestamp < CACHE_TTL)) {
      console.log(`[Cache] Usando dados em cache para: ${cacheKey}`);
      return res.json(cachedData.data);
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

            newsCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Novo endpoint para Briefing Diário
  app.post("/api/briefing", async (req, res) => {
    const { articles } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return res.status(400).json({ error: "Artigos são necessários para o briefing." });
    }

    if (!apiKey) {
      return res.json({
        outlook: "O NewsFlow está operando em modo offline. O mundo continua em movimento com notícias em diversas categorias.",
        highlights: "Fique atento às atualizações em Tecnologia e Geopolítica.",
        recommendation: "Explore as abas individuais para ver detalhes."
      });
    }

    try {
      const { GoogleGenAI } = await import("@google/genai");
      
      // Validação agressiva da chave
      if (!apiKey || apiKey.includes("YOUR_") || apiKey.length < 10) {
        throw new Error("API Key inválida ou não configurada.");
      }

      const ai = new GoogleGenAI({ apiKey });
      const headlines = articles.slice(0, 5).map(a => a.title).join("\n- ");
      const prompt = `Com base nestas manchetes:\n- ${headlines}\n\nCrie um "Panorama Inteligente" em Português:
      1. Outlook: Um parágrafo equilibrado e analítico sobre o estado atual destas notícias.
      2. Highlights: Três pontos cruciais destacados.
      3. Recomendação: O que leitor deve observar a seguir.
      Retorne em JSON: { "outlook": string, "highlights": string[], "recommendation": string }`;

      const result = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt
      });
      const text = result.text;
      // Remover possíveis blocks de markdown do JSON
      const cleanJson = text.replace(/```json|```/g, "").trim();
      res.json(JSON.parse(cleanJson));
    } catch (e: any) {
      if (!e.message?.includes("não configurada")) {
        console.error("Erro no briefing:", e.message);
      }
      res.json({
        outlook: "Não foi possível gerar a análise inteligente no momento.",
        highlights: ["Quota de IA excedida ou erro de rede", "Tente novamente em breve"],
        recommendation: "Continue acompanhando as notícias em tempo real."
      });
    }
  });

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

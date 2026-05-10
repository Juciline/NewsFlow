import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || '' });

// Cache simples para evitar chamadas duplicadas
const analysisCache = new Map<string, any>();
let lastQuotaErrorTime = 0;
const QUOTA_COOLDOWN = 30000; // 30 segundos de pausa após um 429

export const geminiService = {
  analyzeNews: async (title: string, content: string, link?: string) => {
    const cacheKey = link || title;
    
    // 1. Verificar Cache
    if (analysisCache.has(cacheKey)) {
      return analysisCache.get(cacheKey);
    }

    // 2. Verificar se estamos em "cooldown" de quota
    const now = Date.now();
    if (now - lastQuotaErrorTime < QUOTA_COOLDOWN) {
      console.warn('Gemini in quota cooldown. Using fallback.');
      return {
        title,
        summary: content.slice(0, 160).split('.').slice(0, 2).join('.') + "...",
        sentiment: "Neutro",
        tags: ["Atualidades"]
      };
    }

    if (!apiKey || apiKey.includes("YOUR_") || apiKey.length < 10) {
      return {
        title,
        summary: content.slice(0, 150) + "...",
        sentiment: "Neutro",
        tags: ["Geral"]
      };
    }

    try {
      const prompt = `Analise a seguinte notícia:
             Título Original: ${title}
             Conteúdo Original: ${content}

             Forneça o seguinte em formato JSON, garantindo que TODO o texto de saída esteja em PORTUGUÊS:
             1. O título traduzido para Português (se necessário).
             2. Um resumo neutro e traduzido de exatamente 2 frases.
             3. Análise de sentimento (Positivo, Negativo ou Neutro).
             4. Três tags de categorias relevantes em Português.`;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
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

      const responseText = result.text;
      if (!responseText) throw new Error("Resposta vazia da IA");
      const parsed = JSON.parse(responseText);
      analysisCache.set(cacheKey, parsed);
      return parsed;
    } catch (error: any) {
      console.error('Gemini analysis error:', error);
      
      const isQuotaError = error.message?.includes('429') || error.status === 429 || JSON.stringify(error).includes('429');
      if (isQuotaError) {
        lastQuotaErrorTime = Date.now();
        console.warn('Gemini Quota Exceeded (429). Starting cooldown.');
      }

      return {
        title,
        summary: content.slice(0, 160).split('.').slice(0, 2).join('.') + "...",
        sentiment: "Neutro",
        tags: ["Atualidades"]
      };
    }
  },

  generateBriefing: async (articles: any[]) => {
    // 1. Verificar Cache
    const headlines = articles.slice(0, 5).map(a => a.title).join("\n- ");
    const cacheKey = `briefing:${headlines}`;
    
    if (analysisCache.has(cacheKey)) {
      return analysisCache.get(cacheKey);
    }

    // 2. Cooldown
    const now = Date.now();
    if (now - lastQuotaErrorTime < QUOTA_COOLDOWN) {
      return {
        outlook: "O serviço de IA está em pausa para evitar sobrecarga (Quota 429). Tente novamente em 30 segundos.",
        highlights: ["Continue explorando o feed", "Análise automática pausada"],
        recommendation: "Recarregue o briefing em instantes."
      };
    }

    if (!apiKey || apiKey.includes("YOUR_") || apiKey.length < 10) {
      return {
        outlook: "O NewsFlow está operando em modo offline. O mundo continua em movimento com notícias em diversas categorias.",
        highlights: ["Fique atento às atualizações globais", "Explore as notícias locais", "Acompanhe as tendências de tecnologia"],
        recommendation: "Explore as abas individuais para ver detalhes."
      };
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Com base nestas manchetes:\n- ${headlines}\n\nCrie um "Panorama Inteligente" em Português:
        1. Outlook: Um parágrafo equilibrado e analítico sobre o estado atual destas notícias.
        2. Highlights: Três pontos cruciais destacados.
        3. Recomendação: O que leitor deve observar a seguir.
        Retorne em JSON: { "outlook": string, "highlights": string[], "recommendation": string }`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              outlook: { type: Type.STRING },
              highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendation: { type: Type.STRING },
            },
            required: ["outlook", "highlights", "recommendation"],
          },
        },
      });

      const responseText = response.text;
      if (!responseText) throw new Error("Resposta vazia da IA");
      const result = JSON.parse(responseText);
      analysisCache.set(cacheKey, result);
      return result;
    } catch (error: any) {
      console.error('Gemini briefing error:', error);
      
      const isQuotaError = error.message?.includes('429') || error.status === 429 || JSON.stringify(error).includes('429');
      if (isQuotaError) {
        lastQuotaErrorTime = Date.now();
      }
      
      return {
        outlook: isQuotaError 
          ? "O serviço de inteligência atingiu o limite temporário de uso (Quota 429). Você ainda pode ler as notícias normalmente abaixo."
          : "Não foi possível gerar a análise inteligente no momento.",
        highlights: [
          "Acompanhe as notícias nas categorias selecionadas",
          "Acesse cada artigo para ver detalhes completos",
          isQuotaError ? "O resumo de IA voltará em breve" : "Tente novamente em alguns instantes"
        ],
        recommendation: "Continue acompanhando as notícias em tempo real através do feed principal."
      };
    }
  }
};

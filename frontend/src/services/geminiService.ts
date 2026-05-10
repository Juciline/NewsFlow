import axios from 'axios';

export const geminiService = {
  analyzeNews: async (title: string, content: string, link?: string) => {
    try {
      const response = await axios.post('/api/analyze', { title, content, link });
      return response.data;
    } catch (error) {
      console.error('Gemini analysis error:', error);
      return {
        title,
        summary: content.slice(0, 160).split('.').slice(0, 2).join('.') + "...",
        sentiment: "Neutro",
        tags: ["Atualidades"]
      };
    }
  },

  generateBriefing: async (articles: any[]) => {
    try {
      const response = await axios.post('/api/briefing', { articles });
      return response.data;
    } catch (error) {
      console.error('Gemini briefing error:', error);
      return {
        outlook: "Não foi possível gerar a análise inteligente no momento.",
        highlights: ["Siga as notícias locais", "Feed principal disponível"],
        recommendation: "Continue acompanhando as notícias em tempo real."
      };
    }
  }
};

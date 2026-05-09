import axios from "axios";

export class GeminiService {
  /**
   * Analisa uma notícia usando o proxy do backend para aproveitar o cache global
   * e evitar erros de quota entre múltiplos usuários.
   */
  async analyzeNews(title: string, content: string, link?: string) {
    try {
      const response = await axios.post("/api/analyze", {
        title,
        content,
        link
      }, {
        timeout: 20000 // A análise pode demorar
      });
      
      return response.data;
    } catch (error: any) {
      console.warn("[GeminiService] Falha na análise via backend, usando fallback local.", error.message);
      return this.getFallbackAnalysis(title, content);
    }
  }

  private getFallbackAnalysis(title: string, content: string) {
    return {
      title: title || "Título Indisponível",
      summary: content ? content.slice(0, 150) + "..." : "Resumo indisponível.",
      sentiment: "Neutro",
      tags: ["Notícias", "Geral"]
    };
  }
}

export const geminiService = new GeminiService();

import axios from 'axios';

export const geminiService = {
  analyzeNews: async (title: string, content: string, link?: string) => {
    try {
      const response = await axios.post('/api/analyze', { title, content, link });
      return response.data;
    } catch (error) {
      console.error('Gemini analysis error:', error);
      throw error;
    }
  }
};

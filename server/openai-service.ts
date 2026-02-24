import OpenAI from "openai";
import { ProcessedMessage } from './patient-history-directus';

// Using gpt-4o-mini as a reliable and cost-effective model
if (!process.env.OPENAI_API_KEY) {
  console.warn('[OpenAI Service] OPENAI_API_KEY not found in environment variables');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface AIResponse {
  answer: string;
  sources: {
    messageId: string;
    text: string;
    timestamp: number;
    fromMe: boolean;
  }[];
  confidence: number;
}

export class OpenAIService {
  
  async askAboutPatient(
    messages: ProcessedMessage[],
    question: string,
    patientName?: string
  ): Promise<AIResponse> {
    try {
      // Sort messages by timestamp (oldest first for context)
      const sortedMessages = messages.sort((a, b) => a.timestamp - b.timestamp);
      
      // Create conversation context (anonymized for privacy)
      const conversationContext = sortedMessages
        .map((msg, index) => {
          const sender = msg.fromMe ? 'IA/Nutricionista' : 'Paciente';
          const date = new Date(msg.timestamp).toLocaleString('pt-BR');
          return `[${date}] ${sender}: ${msg.text}`;
        })
        .join('\n');

      const systemPrompt = `Você é um assistente especializado em nutrição que ajuda nutricionistas a analisar conversas com pacientes. 

INSTRUÇÕES IMPORTANTES:
1. Analise as mensagens da conversa fornecida
2. Responda à pergunta baseado EXCLUSIVAMENTE no conteúdo das mensagens
3. Se não houver informações suficientes, diga claramente "Não encontrei informações suficientes na conversa"
4. Sempre cite as mensagens específicas que embasam sua resposta
5. Use linguagem profissional mas acessível
6. Foque em insights nutricionais e comportamentais relevantes

FORMATO DA RESPOSTA:
- Responda em português brasileiro
- Seja conciso mas completo
- Destaque padrões importantes
- Inclua recomendações quando apropriado`;

      const userPrompt = `CONVERSA:
${conversationContext}

PERGUNTA: ${question}

Por favor, analise a conversa e responda à pergunta fornecendo insights úteis para o nutricionista.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Reliable and cost-effective model
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3, // Lower temperature for more consistent responses
        max_tokens: 800
      });

      const answer = response.choices[0].message.content || "Desculpe, não consegui processar sua pergunta.";
      
      // Find relevant messages based on keywords in the question and answer
      const relevantSources = this.findRelevantSources(messages, question, answer);
      
      return {
        answer,
        sources: relevantSources,
        confidence: 0.8 // Basic confidence score
      };
    } catch (error) {
      console.error('[OpenAI Service] Error processing question:', error);
      throw new Error(`Erro ao processar pergunta: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  private findRelevantSources(
    messages: ProcessedMessage[],
    question: string,
    answer: string
  ): AIResponse['sources'] {
    // Simple keyword-based relevance (can be improved with embeddings later)
    const keywords = [...question.toLowerCase().split(' '), ...answer.toLowerCase().split(' ')]
      .filter(word => word.length > 3)
      .filter(word => !['para', 'como', 'qual', 'onde', 'quando', 'porque', 'sobre', 'essa', 'isso', 'esta', 'este'].includes(word));
    
    const relevantMessages = messages
      .map(msg => ({
        ...msg,
        relevanceScore: keywords.reduce((score, keyword) => {
          return msg.text.toLowerCase().includes(keyword) ? score + 1 : score;
        }, 0)
      }))
      .filter(msg => msg.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5); // Top 5 most relevant messages

    return relevantMessages.map(msg => ({
      messageId: msg.id,
      text: msg.text.length > 150 ? msg.text.substring(0, 150) + '...' : msg.text,
      timestamp: msg.timestamp,
      fromMe: msg.fromMe
    }));
  }

  async generateQuickInsights(messages: ProcessedMessage[]): Promise<{
    summary: string;
    keyTopics: string[];
    patientMood: 'positive' | 'neutral' | 'negative' | 'mixed';
    recommendations: string[];
  }> {
    try {
      const recentMessages = messages
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 50); // Last 50 messages

      const conversationText = recentMessages
        .map((msg, index) => {
          const sender = msg.fromMe ? 'IA' : 'Paciente';
          return `${sender}: ${msg.text}`;
        })
        .join('\n');

      const prompt = `Analise esta conversa entre um nutricionista/IA e um paciente e forneça insights no formato JSON:

CONVERSA:
${conversationText}

Responda em JSON com:
{
  "summary": "resumo conciso da conversa em 2-3 frases",
  "keyTopics": ["tópico1", "tópico2", "tópico3"],
  "patientMood": "positive|neutral|negative|mixed",
  "recommendations": ["recomendação1", "recomendação2"]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Reliable and cost-effective model
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        summary: result.summary || 'Não foi possível gerar resumo',
        keyTopics: result.keyTopics || [],
        patientMood: result.patientMood || 'neutral',
        recommendations: result.recommendations || []
      };
    } catch (error) {
      console.error('[OpenAI Service] Error generating insights:', error);
      return {
        summary: 'Erro ao gerar resumo da conversa',
        keyTopics: [],
        patientMood: 'neutral',
        recommendations: []
      };
    }
  }

  async generateMealPlan(patientData: {
    name: string;
    age?: number;
    gender?: string;
    weight?: string;
    height?: string;
    bmi?: string;
    goals?: string;
    anamnese?: string;
    supplements?: string;
    messages: ProcessedMessage[];
    currentMeals?: {
      breakfast?: string;
      morningSnack?: string;
      lunch?: string;
      afternoonSnack?: string;
      dinner?: string;
      eveningSnack?: string;
    };
  }): Promise<{
    breakfast: string[];
    morningSnack: string[];
    lunch: string[];
    afternoonSnack: string[];
    dinner: string[];
    eveningSnack: string[];
    generalNotes: string;
  }> {
    try {
      // Build patient context from messages and data
      const conversationContext = patientData.messages
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-50) // Last 50 messages for context
        .map(msg => {
          const sender = msg.fromMe ? 'Nutricionista/IA' : 'Paciente';
          return `${sender}: ${msg.text}`;
        })
        .join('\n');

      const patientInfo = `
INFORMAÇÕES DO PACIENTE:
- Nome: ${patientData.name}
${patientData.age ? `- Idade: ${patientData.age} anos` : ''}
${patientData.gender ? `- Sexo: ${patientData.gender}` : ''}
${patientData.weight ? `- Peso: ${patientData.weight} kg` : ''}
${patientData.height ? `- Altura: ${patientData.height} cm` : ''}
${patientData.bmi ? `- IMC: ${patientData.bmi}` : ''}
${patientData.goals ? `- Objetivos: ${patientData.goals}` : ''}
${patientData.anamnese ? `\nANAMNESE:\n${patientData.anamnese}` : ''}
${patientData.supplements ? `\nSUPLEMENTOS/MEDICAMENTOS:\n${patientData.supplements}` : ''}

${conversationContext ? `CONTEXTO DAS CONVERSAS:\n${conversationContext}` : ''}
      `.trim();

      const currentMealsInfo = patientData.currentMeals ? `
REFEIÇÕES ATUAIS DO PACIENTE:
${patientData.currentMeals.breakfast ? `- Café da manhã: ${patientData.currentMeals.breakfast}` : ''}
${patientData.currentMeals.morningSnack ? `- Lanche da manhã: ${patientData.currentMeals.morningSnack}` : ''}
${patientData.currentMeals.lunch ? `- Almoço: ${patientData.currentMeals.lunch}` : ''}
${patientData.currentMeals.afternoonSnack ? `- Lanche da tarde: ${patientData.currentMeals.afternoonSnack}` : ''}
${patientData.currentMeals.dinner ? `- Jantar: ${patientData.currentMeals.dinner}` : ''}
${patientData.currentMeals.eveningSnack ? `- Ceia: ${patientData.currentMeals.eveningSnack}` : ''}
      `.trim() : '';

      const systemPrompt = `Você é um nutricionista experiente especializado em criar planos alimentares personalizados.

INSTRUÇÕES:
1. Analise todas as informações do paciente (anamnese, conversas, objetivos, gostos, desgostos, restrições)
2. Crie um plano alimentar de 24 horas REALISTA e PERSONALIZADO com 3 opções variadas para cada refeição
3. Considere: preferências alimentares, restrições, alergias, rotina, objetivos nutricionais
4. Cada opção deve ser diferente das outras (variar proteínas, carboidratos, preparações)
5. Forneça porções aproximadas e horários sugeridos
6. Seja específico nas preparações e alimentos
7. As opções devem ser práticas e acessíveis

FORMATO DE RESPOSTA (JSON) — cada refeição deve ser um array com EXATAMENTE 3 strings:
{
  "breakfast": ["Opção 1: descrição detalhada com porções", "Opção 2: descrição detalhada com porções", "Opção 3: descrição detalhada com porções"],
  "morningSnack": ["Opção 1: ...", "Opção 2: ...", "Opção 3: ..."],
  "lunch": ["Opção 1: ...", "Opção 2: ...", "Opção 3: ..."],
  "afternoonSnack": ["Opção 1: ...", "Opção 2: ...", "Opção 3: ..."],
  "dinner": ["Opção 1: ...", "Opção 2: ...", "Opção 3: ..."],
  "eveningSnack": ["Opção 1: ...", "Opção 2: ...", "Opção 3: ..."],
  "generalNotes": "Observações gerais, dicas de hidratação e suplementação"
}`;

      const userPrompt = `${patientInfo}

${currentMealsInfo}

Por favor, crie uma sugestão de plano alimentar personalizado com 3 opções por refeição para este paciente, considerando todas as informações fornecidas, especialmente seus objetivos, gostos e desgostos mencionados nas conversas.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2500
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      const toArray = (val: any, fallback: string): string[] => {
        if (Array.isArray(val) && val.length >= 3) return val.slice(0, 3);
        if (typeof val === 'string' && val.length > 0) return [val, fallback, fallback];
        return [fallback, fallback, fallback];
      };
      
      return {
        breakfast: toArray(result.breakfast, 'Não foi possível gerar sugestão'),
        morningSnack: toArray(result.morningSnack, 'Não necessário'),
        lunch: toArray(result.lunch, 'Não foi possível gerar sugestão'),
        afternoonSnack: toArray(result.afternoonSnack, 'Não necessário'),
        dinner: toArray(result.dinner, 'Não foi possível gerar sugestão'),
        eveningSnack: toArray(result.eveningSnack, 'Não necessário'),
        generalNotes: result.generalNotes || ''
      };
    } catch (error) {
      console.error('[OpenAI Service] Error generating meal plan:', error);
      throw new Error(`Erro ao gerar plano alimentar: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }
}

export const openaiService = new OpenAIService();
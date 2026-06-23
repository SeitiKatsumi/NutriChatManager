import OpenAI from "openai";
import { ProcessedMessage } from './patient-history-directus';
import { getAIConfig } from './ai-config-store';

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

      const config = await getAIConfig('ask_patient');

      const userPrompt = `CONVERSA:
${conversationContext}

PERGUNTA: ${question}

Por favor, analise a conversa e responda à pergunta fornecendo insights úteis para o nutricionista.`;

      const response = await openai.chat.completions.create({
        model: config.model,
        messages: [
          { role: "system", content: config.system_prompt },
          { role: "user", content: userPrompt }
        ],
        temperature: config.temperature,
        max_tokens: config.max_tokens
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

      const config = await getAIConfig('insights');

      const prompt = `${config.system_prompt}

CONVERSA:
${conversationText}`;

      const response = await openai.chat.completions.create({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: config.temperature,
        max_tokens: config.max_tokens
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

      const config = await getAIConfig('mealplan');

      const userPrompt = `${patientInfo}

${currentMealsInfo}

Por favor, crie uma sugestão de plano alimentar personalizado com 3 opções por refeição para este paciente, considerando todas as informações fornecidas, especialmente seus objetivos, gostos e desgostos mencionados nas conversas.`;

      const response = await openai.chat.completions.create({
        model: config.model,
        messages: [
          { role: "system", content: config.system_prompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: config.temperature,
        max_tokens: config.max_tokens
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      const toArray = (val: string | string[] | undefined, fallback: string): string[] => {
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

  async runAnamnesisAgent(
    conversationHistory: { role: 'user' | 'assistant'; content: string }[],
    patientMessage: string,
    agentName?: string,
    customGreeting?: string
  ): Promise<{ response: string; isComplete: boolean }> {
    try {
      const config = await getAIConfig('anamnesis');
      const systemPrompt = config.system_prompt.replace(/\{agentName\}/g, agentName || 'Nutri Chatbot');

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt }
      ];

      if (conversationHistory.length === 0 && !patientMessage) {
        const greeting = customGreeting || `Oi! Eu sou o ${agentName || 'Nutri Chatbot'} 🤖, seu assistente de pré-consulta! Tô aqui pra entender melhor sua rotina, seus objetivos e hábitos, antes da consulta com o nutricionista. Pode falar com liberdade — aqui é sem julgamentos, combinado?\n\nPra começar… o que te motivou a buscar um acompanhamento nutricional?`;
        return { response: greeting, isComplete: false };
      }

      messages.push(...conversationHistory);
      if (patientMessage) {
        messages.push({ role: 'user', content: patientMessage });
      }

      const completion = await openai.chat.completions.create({
        model: config.model,
        messages,
        temperature: config.temperature,
        max_tokens: config.max_tokens
      });

      const responseText = completion.choices[0].message.content || '';
      const isComplete = responseText.includes('[ANAMNESE_COMPLETA]');
      const cleanResponse = responseText.replace('[ANAMNESE_COMPLETA]', '').trim();

      return { response: cleanResponse, isComplete };
    } catch (error) {
      console.error('[OpenAI Service] Error in anamnesis agent:', error);
      throw new Error(`Erro no agente de anamnese: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  async extractPatientData(conversationHistory: { role: 'user' | 'assistant'; content: string }[]): Promise<{
    Nome_Completo?: string;
    Data_de_nascimento?: string;
    Sexo?: string;
    Peso?: number;
    Altura?: number;
    Anamise_inicial?: string;
    Restricoes_alimentares?: string;
    Suplementos_e_medicamentos?: string;
    Metas_e_objetivos?: string;
    Cafe_da_manha?: string;
    Lanche_da_manha?: string;
    Almoco?: string;
    Lanche_da_tarde?: string;
    Janta?: string;
    Ceia?: string;
  }> {
    try {
      const conversationText = conversationHistory
        .map(msg => `${msg.role === 'assistant' ? 'Assistente' : 'Paciente'}: ${msg.content}`)
        .join('\n');

      const config = await getAIConfig('extraction');

      const completion = await openai.chat.completions.create({
        model: config.model,
        messages: [
          { role: 'system', content: config.system_prompt },
          { role: 'user', content: conversationText }
        ],
        response_format: { type: 'json_object' },
        temperature: config.temperature,
        max_tokens: config.max_tokens
      });

      const result = JSON.parse(completion.choices[0].message.content || '{}');
      console.log('[OpenAI Service] Extracted patient data:', result);
      return result;
    } catch (error) {
      console.error('[OpenAI Service] Error extracting patient data:', error);
      throw new Error(`Erro ao extrair dados do paciente: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  async runFollowUpAgent(
    patientData: { fullName?: string; weight?: string | null; height?: string | null; gender?: string | null; goals?: string | null; dietaryRestrictions?: string | null; suplementos_medicamentos?: string | null; medicalHistory?: string | null; anamnese_inicial?: string | null; cafe_da_manha?: string | null; almoco?: string | null; janta?: string | null },
    conversationHistory: { role: 'user' | 'assistant'; content: string }[],
    patientMessage: string,
    agentName?: string
  ): Promise<string> {
    try {
      const patientContext = `
DADOS DO PACIENTE:
- Nome: ${patientData.fullName || 'Não informado'}
- Peso: ${patientData.weight || 'Não informado'} kg
- Altura: ${patientData.height || 'Não informado'} cm
- Sexo: ${patientData.gender || 'Não informado'}
- Objetivos: ${patientData.goals || 'Não informado'}
- Restrições alimentares: ${patientData.dietaryRestrictions || 'Nenhuma'}
- Suplementos/Medicamentos: ${patientData.suplementos_medicamentos || 'Nenhum'}
- Anamnese: ${patientData.medicalHistory || patientData.anamnese_inicial || 'Não realizada'}
- Café da manhã: ${patientData.cafe_da_manha || 'Não informado'}
- Almoço: ${patientData.almoco || 'Não informado'}
- Jantar: ${patientData.janta || 'Não informado'}
`.trim();

      const config = await getAIConfig('followup');
      const systemPrompt = config.system_prompt
        .replace(/\{patientContext\}/g, patientContext)
        .replace(/\{agentName\}/g, agentName || 'Nutri chatbot');

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-28),
        { role: 'user', content: patientMessage }
      ];

      const completion = await openai.chat.completions.create({
        model: config.model,
        messages,
        temperature: config.temperature,
        max_tokens: config.max_tokens
      });

      return completion.choices[0].message.content || 'Desculpe, não consegui processar sua mensagem.';
    } catch (error) {
      console.error('[OpenAI Service] Error in follow-up agent:', error);
      throw new Error(`Erro no agente de acompanhamento: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  async analyzeFood(imageBuffer: Buffer): Promise<string> {
    try {
      const config = await getAIConfig('food_analysis');
      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64Image}`;

      const completion = await openai.chat.completions.create({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: config.system_prompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: [
                  'Analise esta imagem de refeicao.',
                  'Responda em portugues brasileiro e inclua obrigatoriamente:',
                  '1. Alimentos identificados',
                  '2. Estimativa calorica total em kcal, usando faixa se necessario',
                  '3. Macros estimados em gramas: proteinas, carboidratos e gorduras',
                  '4. Observacoes nutricionais praticas',
                  'Nao omita calorias nem macros quando houver comida visivel.',
                ].join('\n'),
              },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
            ]
          }
        ],
        max_tokens: config.max_tokens,
        temperature: config.temperature
      });

      return completion.choices[0].message.content || 'Não foi possível analisar a imagem.';
    } catch (error) {
      console.error('[OpenAI Service] Error analyzing food image:', error);
      throw new Error(`Erro ao analisar imagem: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }
}

export const openaiService = new OpenAIService();

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
      const systemPrompt = `Você é o ${agentName || 'Nutri Chatbot'}, um assistente virtual especializado em avaliações nutricionais iniciais.

IMPORTANTE: Nunca envie listas ou tópicos.

Sua missão é conversar de forma acolhedora, descontraída e eficiente com o paciente, coletando todas as informações necessárias para o nutricionista. Use uma linguagem leve, madura e com um toque de humor inteligente (sem ser bobo). Seja empático e natural, como uma boa conversa.

**FAÇA SEMPRE UMA PERGUNTA POR VEZ. Aguarde a resposta antes de continuar. Nunca agrupe perguntas.**

Regras de comportamento (siga rigorosamente):

- Nunca pule etapas.
- Faça uma pergunta por vez.
- Aguarde sempre a resposta antes de continuar.
- Se o paciente mencionar informações espontaneamente, não repita a pergunta depois.
- Sempre reforce que os dados são confidenciais e irão diretamente para análise do nutricionista.
- No final, organize as informações em um resumo dividido por categorias.
- Se o paciente perguntar sobre valores, formas de pagamento ou solicitar falar com um humano, envie o link direto da clínica: https://wa.me/5527999742520

Etapa 1 – Conversa aberta (contextualização livre):

Comece com perguntas abertas para o paciente se expressar espontaneamente:

1. Pra começar… o que te motivou a buscar um acompanhamento nutricional?
2. Como tá sua rotina no geral? Alimentação, sono, treinos, saúde… pode ir contando do seu jeito mesmo.
3. Você tem alguma meta em mente? Tipo emagrecer, ganhar massa, ter mais energia, controlar alguma condição?

Use as respostas para puxar assuntos naturais.

Etapa 2 – Coleta das informações que faltarem (complementar):

Só pergunte o que não tiver sido mencionado espontaneamente.

Informações Pessoais:
- Qual é o seu nome completo?
- Qual sua data de nascimento?
- Qual seu sexo? (Masculino / Feminino / Outro)
- Altura (em cm)?
- Peso (em kg)?

Histórico de Saúde:
- Possui alguma condição de saúde atual ou pré-existente?
- Faz uso de alguma medicação? Se sim, qual?
- Tem alguma alergia ou restrição alimentar?

Hábitos Alimentares:
- Quantas refeições você costuma fazer por dia?
- Costuma beliscar entre as refeições?
- Quais são os alimentos que mais fazem parte do seu dia a dia?
- Como é sua hidratação? Sabe quantos Litros de água costuma beber?

Preferências e Restrições:
- Você segue alguma dieta específica?
- Tem algum alimento que você evita ou não gosta?
- Tem algo que ama comer e gostaria de manter na sua dieta?

Atividade Física:
- Você pratica atividade física?
- Qual tipo e com que frequência?

Objetivos Nutricionais:
- Qual é seu principal objetivo com a consulta?
- Tem algum prazo ou evento específico para alcançar esse objetivo?

Estilo de Vida:
- Seu sono é bom? Quantas horas costuma dormir por noite?
- Costuma consumir bebidas alcoólicas? Com que frequência?
- Como você avalia seu nível de estresse no dia a dia?

Recordatório Alimentar de 24h:

Agora quero entender como foi sua alimentação em um dia comum. Vou te perguntar uma refeição de cada vez:

- Café da manhã
- Lanche da manhã
- Almoço
- Lanche da tarde
- Jantar
- Ceia

Finalização:

Quando TODAS as informações acima tiverem sido coletadas (nome, data de nascimento, sexo, altura, peso, histórico de saúde, hábitos alimentares, preferências, atividade física, objetivos, estilo de vida E o recordatório alimentar completo), responda com a mensagem de finalização e inclua a tag [ANAMNESE_COMPLETA] no final da sua resposta. Esta tag indica que todos os dados foram coletados.

Mensagem de finalização:
"Perfeito! Obrigado por compartilhar tudo com tanta sinceridade. Agora o nutricionista vai analisar essas informações para montar algo que combine com você. Qualquer coisa, tô por aqui!

Se quiser falar com a equipe da clínica, é só mandar uma mensagem por aqui: https://wa.me/5527999742520"`;

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
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 500
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

      const systemPrompt = `Você é um extrator de dados especializado. Analise a conversa de anamnese nutricional abaixo e extraia TODOS os dados do paciente em formato JSON.

Extraia os seguintes campos (use null se não encontrado):
- Nome_Completo: nome completo do paciente
- Data_de_nascimento: data de nascimento no formato YYYY-MM-DD
- Sexo: "Masculino", "Feminino" ou "Outro"
- Peso: peso em kg (número)
- Altura: altura em cm (número)
- Anamise_inicial: resumo completo da anamnese incluindo histórico de saúde, condições, medicações, hábitos, estilo de vida, rotina de exercícios, qualidade do sono, nível de estresse e consumo de álcool
- Restricoes_alimentares: alergias, intolerâncias e restrições alimentares
- Suplementos_e_medicamentos: suplementos e medicamentos em uso
- Metas_e_objetivos: objetivos nutricionais do paciente
- Cafe_da_manha: o que o paciente costuma comer no café da manhã
- Lanche_da_manha: lanche da manhã
- Almoco: almoço
- Lanche_da_tarde: lanche da tarde
- Janta: jantar
- Ceia: ceia

Responda APENAS com o JSON, sem explicações.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: conversationText }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 1500
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

      const systemPrompt = `${patientContext}

Você é o ${agentName || 'Nutri chatbot'}, uma IA nutricionista com personalidade marcante: conversa com inteligência, tem um humor afiado (sem ser bobo), e sabe exatamente quando ser direto, divertido ou acolhedor. Seu estilo é espontâneo, carismático e com um toque sarcástico na medida certa — afinal, nem todo bate-papo precisa parecer consulta, certo?

Não mande mensagens muito longas. Envie apenas em parágrafos.

Caso o cliente peça um plano alimentar ou dieta, você deve dizer que ele deve procurar o nutricionista responsável.

Você pode conversar sobre qualquer assunto com o usuário — desde séries e rotina até crises existenciais. Mas quando o tema for alimentação, dieta, suplementos ou qualquer tópico nutricional, aja como um verdadeiro especialista.

Quando o assunto envolver nutrição:
1. Use os dados do paciente acima para personalizar suas respostas.
2. Dê conselhos práticos e objetivos, personalizados com base nesses dados.
3. Mantenha o tom leve, bem-humorado e direto, mas demonstre domínio técnico quando necessário.
4. Se algo exigir prescrição ou diagnóstico clínico, oriente o paciente a procurar um profissional de saúde.

Fora isso? Seja você mesmo: ágil nas respostas, envolvente nas conversas, e sem enrolação.`;

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-28),
        { role: 'user', content: patientMessage }
      ];

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 500
      });

      return completion.choices[0].message.content || 'Desculpe, não consegui processar sua mensagem.';
    } catch (error) {
      console.error('[OpenAI Service] Error in follow-up agent:', error);
      throw new Error(`Erro no agente de acompanhamento: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  async analyzeFood(imageBuffer: Buffer): Promise<string> {
    try {
      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64Image}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Você é um especialista em nutrição. Analise a imagem de comida enviada e forneça:

1. Identificação dos alimentos visíveis
2. Estimativa calórica total da refeição
3. Breakdown dos macronutrientes (proteínas, carboidratos, gorduras)
4. Observações nutricionais relevantes

Responda sempre em português brasileiro de forma clara e objetiva. Use um tom amigável.
Se a imagem não contiver comida, diga isso educadamente.`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analise esta imagem de refeição e me dê as informações nutricionais estimadas.' },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
            ]
          }
        ],
        max_tokens: 800,
        temperature: 0.3
      });

      return completion.choices[0].message.content || 'Não foi possível analisar a imagem.';
    } catch (error) {
      console.error('[OpenAI Service] Error analyzing food image:', error);
      throw new Error(`Erro ao analisar imagem: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }
}

export const openaiService = new OpenAIService();
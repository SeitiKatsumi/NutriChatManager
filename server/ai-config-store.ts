import { db } from './db';
import { aiConfigTable } from '@shared/schema';
import { eq } from 'drizzle-orm';

export type AgentType = 'anamnesis' | 'followup' | 'extraction' | 'mealplan' | 'insights' | 'food_analysis' | 'ask_patient';

export interface AIConfigData {
  agent_type: AgentType;
  system_prompt: string;
  model: string;
  max_tokens: number;
  temperature: number;
  updated_at: Date;
}

const DEFAULT_CONFIGS: Record<AgentType, { system_prompt: string; model: string; max_tokens: number; temperature: number }> = {
  anamnesis: {
    system_prompt: `Você é o {agentName}, um assistente virtual especializado em avaliações nutricionais iniciais.

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

Se quiser falar com a equipe da clínica, é só mandar uma mensagem por aqui: https://wa.me/5527999742520"`,
    model: 'gpt-4o-mini',
    max_tokens: 500,
    temperature: 0.7,
  },
  followup: {
    system_prompt: `{patientContext}

Você é o {agentName}, uma IA nutricionista com personalidade marcante: conversa com inteligência, tem um humor afiado (sem ser bobo), e sabe exatamente quando ser direto, divertido ou acolhedor. Seu estilo é espontâneo, carismático e com um toque sarcástico na medida certa — afinal, nem todo bate-papo precisa parecer consulta, certo?

Não mande mensagens muito longas. Envie apenas em parágrafos.

Caso o cliente peça um plano alimentar ou dieta, você deve dizer que ele deve procurar o nutricionista responsável.

Você pode conversar sobre qualquer assunto com o usuário — desde séries e rotina até crises existenciais. Mas quando o tema for alimentação, dieta, suplementos ou qualquer tópico nutricional, aja como um verdadeiro especialista.

Quando o assunto envolver nutrição:
1. Use os dados do paciente acima para personalizar suas respostas.
2. Dê conselhos práticos e objetivos, personalizados com base nesses dados.
3. Mantenha o tom leve, bem-humorado e direto, mas demonstre domínio técnico quando necessário.
4. Se algo exigir prescrição ou diagnóstico clínico, oriente o paciente a procurar um profissional de saúde.

Fora isso? Seja você mesmo: ágil nas respostas, envolvente nas conversas, e sem enrolação.`,
    model: 'gpt-4o-mini',
    max_tokens: 500,
    temperature: 0.7,
  },
  extraction: {
    system_prompt: `Você é um extrator de dados especializado. Analise a conversa de anamnese nutricional abaixo e extraia TODOS os dados do paciente em formato JSON.

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

Responda APENAS com o JSON, sem explicações.`,
    model: 'gpt-4o-mini',
    max_tokens: 1500,
    temperature: 0.1,
  },
  mealplan: {
    system_prompt: `Você é um nutricionista experiente especializado em criar planos alimentares personalizados.

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
}`,
    model: 'gpt-4o-mini',
    max_tokens: 2500,
    temperature: 0.7,
  },
  insights: {
    system_prompt: `Analise esta conversa entre um nutricionista/IA e um paciente e forneça insights no formato JSON:

Responda em JSON com:
{
  "summary": "resumo conciso da conversa em 2-3 frases",
  "keyTopics": ["tópico1", "tópico2", "tópico3"],
  "patientMood": "positive|neutral|negative|mixed",
  "recommendations": ["recomendação1", "recomendação2"]
}`,
    model: 'gpt-4o-mini',
    max_tokens: 800,
    temperature: 0.3,
  },
  food_analysis: {
    system_prompt: `Você é um especialista em nutrição. Analise a imagem de comida enviada e forneça:

1. Identificação dos alimentos visíveis
2. Estimativa calórica total da refeição
3. Breakdown dos macronutrientes (proteínas, carboidratos, gorduras)
4. Observações nutricionais relevantes

Responda sempre em português brasileiro de forma clara e objetiva. Use um tom amigável.
Se a imagem não contiver comida, diga isso educadamente.`,
    model: 'gpt-4o-mini',
    max_tokens: 800,
    temperature: 0.3,
  },
  ask_patient: {
    system_prompt: `Você é um assistente especializado em nutrição que ajuda nutricionistas a analisar conversas com pacientes. 

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
- Inclua recomendações quando apropriado`,
    model: 'gpt-4o-mini',
    max_tokens: 800,
    temperature: 0.3,
  },
};

const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  anamnesis: 'Agente de Anamnese',
  followup: 'Agente de Acompanhamento',
  extraction: 'Extração de Dados',
  mealplan: 'Gerador de Plano Alimentar',
  insights: 'Insights Rápidos',
  food_analysis: 'Análise de Alimentos',
  ask_patient: 'Perguntas sobre Paciente',
};

let configCache: Map<AgentType, AIConfigData> | null = null;
let lastCacheRefresh = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function seedDefaults(): Promise<void> {
  try {
    const existing = await db.select().from(aiConfigTable);
    const existingTypes = new Set(existing.map(e => e.agent_type));

    for (const [agentType, defaults] of Object.entries(DEFAULT_CONFIGS)) {
      if (!existingTypes.has(agentType)) {
        await db.insert(aiConfigTable).values({
          agent_type: agentType,
          system_prompt: defaults.system_prompt,
          model: defaults.model,
          max_tokens: defaults.max_tokens,
          temperature: defaults.temperature,
        });
        console.log(`[AIConfigStore] Seeded default config for ${agentType}`);
      }
    }
  } catch (error) {
    console.error('[AIConfigStore] Error seeding defaults:', error);
  }
}

export async function initAIConfigStore(): Promise<void> {
  await seedDefaults();
  await refreshCache();
  console.log('[AIConfigStore] Initialized with DB-backed storage');
}

async function refreshCache(): Promise<void> {
  const now = Date.now();
  if (configCache && now - lastCacheRefresh < CACHE_TTL) return;

  try {
    const rows = await db.select().from(aiConfigTable);
    configCache = new Map();
    for (const row of rows) {
      configCache.set(row.agent_type as AgentType, {
        agent_type: row.agent_type as AgentType,
        system_prompt: row.system_prompt,
        model: row.model,
        max_tokens: row.max_tokens,
        temperature: row.temperature,
        updated_at: row.updated_at,
      });
    }
    lastCacheRefresh = now;
  } catch (error) {
    console.error('[AIConfigStore] Error refreshing cache from DB:', error);
    if (!configCache) {
      configCache = new Map();
      for (const [key, val] of Object.entries(DEFAULT_CONFIGS)) {
        configCache.set(key as AgentType, { ...val, agent_type: key as AgentType, updated_at: new Date() });
      }
    }
  }
}

export async function getAIConfig(agentType: AgentType): Promise<AIConfigData> {
  await refreshCache();
  if (configCache) {
    const cached = configCache.get(agentType);
    if (cached) return cached;
  }
  const defaults = DEFAULT_CONFIGS[agentType];
  return { ...defaults, agent_type: agentType, updated_at: new Date() };
}

export async function getAllAIConfigs(): Promise<AIConfigData[]> {
  await refreshCache();
  if (!configCache) return [];
  return Array.from(configCache.values());
}

export async function updateAIConfig(agentType: AgentType, updates: Partial<Pick<AIConfigData, 'system_prompt' | 'model' | 'max_tokens' | 'temperature'>>): Promise<AIConfigData> {
  const now = new Date();
  await db.update(aiConfigTable)
    .set({ ...updates, updated_at: now })
    .where(eq(aiConfigTable.agent_type, agentType));

  configCache = null;
  lastCacheRefresh = 0;
  await refreshCache();

  return getAIConfig(agentType);
}

export async function resetAIConfig(agentType: AgentType): Promise<AIConfigData> {
  const defaults = DEFAULT_CONFIGS[agentType];
  if (!defaults) throw new Error(`Unknown agent type: ${agentType}`);

  const now = new Date();
  await db.update(aiConfigTable)
    .set({
      system_prompt: defaults.system_prompt,
      model: defaults.model,
      max_tokens: defaults.max_tokens,
      temperature: defaults.temperature,
      updated_at: now,
    })
    .where(eq(aiConfigTable.agent_type, agentType));

  configCache = null;
  lastCacheRefresh = 0;
  await refreshCache();

  return getAIConfig(agentType);
}

export function getDefaultConfig(agentType: AgentType): typeof DEFAULT_CONFIGS[AgentType] | undefined {
  return DEFAULT_CONFIGS[agentType];
}

export function getAgentTypeLabel(agentType: AgentType): string {
  return AGENT_TYPE_LABELS[agentType] || agentType;
}

export const VALID_AGENT_TYPES: AgentType[] = ['anamnesis', 'followup', 'extraction', 'mealplan', 'insights', 'food_analysis', 'ask_patient'];

export const AVAILABLE_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4.5-preview',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
  'o1',
  'o1-mini',
  'o1-pro',
  'o3',
  'o3-mini',
  'o3-pro',
  'o4-mini',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5.2',
];

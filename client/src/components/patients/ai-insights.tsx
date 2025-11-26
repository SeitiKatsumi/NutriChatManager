import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Brain, 
  MessageCircle, 
  Send, 
  Lightbulb, 
  TrendingUp, 
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  UtensilsCrossed
} from "lucide-react";
import { Patient } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AIInsightsProps {
  patient: Patient;
}

interface AIResponse {
  answer: string;
  sources: {
    messageId: string;
    text: string;
    timestamp: number;
    fromMe: boolean;
  }[];
  confidence: number;
}

interface QuickInsights {
  summary: string;
  keyTopics: string[];
  patientMood: 'positive' | 'neutral' | 'negative' | 'mixed';
  recommendations: string[];
  cached?: boolean;
  cacheAge?: number; // in minutes
}

interface MealPlan {
  breakfast: string;
  morningSnack: string;
  lunch: string;
  afternoonSnack: string;
  dinner: string;
  eveningSnack: string;
  generalNotes: string;
}

export default function AIInsights({ patient }: AIInsightsProps) {
  const [question, setQuestion] = useState("");
  const [showSources, setShowSources] = useState<string | null>(null);
  const [showMealPlan, setShowMealPlan] = useState(false);
  const { toast } = useToast();

  // Consultas rápidas pré-definidas
  const quickQuestions = [
    "Resumo das últimas conversas do paciente",
    "Principais preocupações mencionadas pelo paciente",
    "Como está o progresso nutricional do paciente?",
    "O paciente demonstra aderência ao plano alimentar?",
    "Que assuntos mais aparecem nas conversas?"
  ];

  // Buscar insights rápidos do paciente
  const { data: insights, isLoading: loadingInsights, error: insightsError, refetch: refetchInsights, isFetching: isRefetching } = useQuery<QuickInsights>({
    queryKey: ['/api/ai/insights', patient.id],
    enabled: !!patient.id,
    retry: 1,
    staleTime: 30 * 60 * 1000 // 30 minutes - increased for better caching
  });

  // Handler para forçar refresh da análise (bypass cache)
  const handleForceRefresh = async () => {
    try {
      const response = await fetch(`/api/ai/insights/${patient.id}?forceRefresh=true`, {
        credentials: 'include'
      });
      if (response.ok) {
        const newInsights = await response.json();
        queryClient.setQueryData(['/api/ai/insights', patient.id], newInsights);
        toast({
          title: "Análise atualizada",
          description: "Nova análise de IA gerada com sucesso!",
        });
      } else {
        throw new Error('Falha ao atualizar análise');
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar a análise",
        variant: "destructive"
      });
    }
  };

  // Mutation para fazer perguntas à IA
  const askMutation = useMutation({
    mutationFn: async ({ question }: { question: string }): Promise<AIResponse> => {
      const response = await apiRequest('POST', '/api/ai/ask', {
        patientId: Number(patient.id),
        question
      });
      return await response.json();
    },
    onSuccess: () => {
      // Invalidate insights cache to refresh with latest interaction data
      queryClient.invalidateQueries({ queryKey: ['/api/ai/insights', patient.id] });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao processar pergunta",
        variant: "destructive"
      });
    }
  });

  // Mutation para gerar sugestão de recordatório alimentar
  const mealPlanMutation = useMutation({
    mutationFn: async (): Promise<MealPlan> => {
      const response = await apiRequest('POST', `/api/ai/meal-plan/${patient.id}`, {});
      return await response.json();
    },
    onSuccess: () => {
      setShowMealPlan(true);
      toast({
        title: "Sucesso",
        description: "Sugestão de recordatório alimentar gerada com sucesso!",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao gerar sugestão de recordatório",
        variant: "destructive"
      });
    }
  });

  const handleAskQuestion = (questionText: string) => {
    if (!questionText.trim()) return;
    
    askMutation.mutate({ question: questionText });
    setQuestion("");
  };

  const handleQuickQuestion = (quickQuestion: string) => {
    setQuestion(quickQuestion);
    handleAskQuestion(quickQuestion);
  };

  const getMoodColor = (mood: string) => {
    const colors = {
      positive: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      neutral: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
      negative: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
      mixed: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
    };
    return colors[mood as keyof typeof colors] || colors.neutral;
  };

  const getMoodLabel = (mood: string) => {
    const labels = {
      positive: "Positivo",
      neutral: "Neutro", 
      negative: "Preocupado",
      mixed: "Variado"
    };
    return labels[mood as keyof typeof labels] || "Neutro";
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // State para controlar loading do refresh manual
  const [isRefreshingManually, setIsRefreshingManually] = useState(false);

  const handleForceRefreshWithLoading = async () => {
    setIsRefreshingManually(true);
    await handleForceRefresh();
    setIsRefreshingManually(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="w-5 h-5 text-blue-600" />
            Insights de IA
          </CardTitle>
          {insights && !loadingInsights && (
            <div className="flex items-center gap-2">
              {insights.cached && (
                <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950" data-testid="cache-indicator">
                  <Clock className="w-3 h-3 mr-1" />
                  Cache ({insights.cacheAge || 0} min)
                </Badge>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleForceRefreshWithLoading}
                disabled={isRefreshingManually}
                data-testid="refresh-analysis-button"
                title="Gerar nova análise com IA"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshingManually ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Análise inteligente das conversas do paciente via WhatsApp
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Insights Rápidos */}
        {loadingInsights ? (
          <div className="flex items-center justify-center py-8" data-testid="insights-loading">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm text-muted-foreground">Analisando conversas...</span>
          </div>
        ) : insightsError ? (
          <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800">
            <CardContent className="py-8 text-center">
              <AlertTriangle className="w-8 h-8 mx-auto mb-4 text-red-600" />
              <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">Erro ao carregar insights</p>
              <p className="text-xs text-red-600 dark:text-red-400" data-testid="insights-error-message">
                {insightsError instanceof Error ? insightsError.message : "Erro desconhecido"}
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4" 
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/ai/insights', patient.id] })}
                data-testid="insights-retry-button"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        ) : insights && (insights as QuickInsights).summary ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Resumo */}
            <Card className="bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  Resumo Recente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed" data-testid="insights-summary">{(insights as QuickInsights).summary}</p>
              </CardContent>
            </Card>

            {/* Humor do Paciente */}
            <Card className="bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Humor Geral
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge className={getMoodColor((insights as QuickInsights).patientMood)} data-testid="patient-mood-badge">
                  {getMoodLabel((insights as QuickInsights).patientMood)}
                </Badge>
              </CardContent>
            </Card>

            {/* Tópicos Principais */}
            {(insights as QuickInsights).keyTopics && (insights as QuickInsights).keyTopics.length > 0 && (
              <Card className="bg-muted/30 md:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" />
                    Tópicos Principais
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2" data-testid="key-topics-list">
                    {(insights as QuickInsights).keyTopics.map((topic: string, index: number) => (
                      <Badge key={index} variant="outline" className="text-xs" data-testid={`topic-${index}`}>
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recomendações */}
            {(insights as QuickInsights).recommendations && (insights as QuickInsights).recommendations.length > 0 && (
              <Card className="bg-muted/30 md:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Recomendações
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2" data-testid="recommendations-list">
                    {(insights as QuickInsights).recommendations.map((rec: string, index: number) => (
                      <li key={index} className="flex items-start gap-2" data-testid={`recommendation-${index}`}>
                        <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0" />
                        <span className="text-sm">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8" data-testid="no-insights-message">
            <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Nenhuma conversa encontrada para análise</p>
          </div>
        )}

        <Separator />

        {/* Gerador de Recordatório Alimentar */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4" />
              Sugestão de Recordatório Alimentar
            </h3>
            <Button
              onClick={() => mealPlanMutation.mutate()}
              disabled={mealPlanMutation.isPending}
              size="sm"
              data-testid="generate-meal-plan-button"
            >
              {mealPlanMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <UtensilsCrossed className="w-4 h-4 mr-2" />
                  Gerar Sugestão
                </>
              )}
            </Button>
          </div>

          {/* Exibir Plano Alimentar Gerado */}
          {mealPlanMutation.data && showMealPlan && (
            <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" data-testid="meal-plan-result">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-semibold tracking-tight text-base flex items-center gap-2 text-[#000000]">
                    <UtensilsCrossed className="w-4 h-4 text-green-600" />
                    Recordatório 24 Horas - Sugestão Personalizada
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowMealPlan(false)}
                    data-testid="close-meal-plan"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Café da Manhã */}
                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2 text-gray-700 dark:text-gray-600">
                    <span className="w-2 h-2 bg-green-600 rounded-full" />
                    Café da Manhã
                  </h4>
                  <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300" data-testid="meal-breakfast">
                    {mealPlanMutation.data.breakfast}
                  </p>
                </div>

                {/* Lanche da Manhã */}
                {mealPlanMutation.data.morningSnack && mealPlanMutation.data.morningSnack !== 'Não necessário' && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2 text-gray-700 dark:text-gray-600">
                      <span className="w-2 h-2 bg-green-600 rounded-full" />
                      Lanche da Manhã
                    </h4>
                    <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300" data-testid="meal-morning-snack">
                      {mealPlanMutation.data.morningSnack}
                    </p>
                  </div>
                )}

                {/* Almoço */}
                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2 text-gray-700 dark:text-gray-600">
                    <span className="w-2 h-2 bg-green-600 rounded-full" />
                    Almoço
                  </h4>
                  <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300" data-testid="meal-lunch">
                    {mealPlanMutation.data.lunch}
                  </p>
                </div>

                {/* Lanche da Tarde */}
                {mealPlanMutation.data.afternoonSnack && mealPlanMutation.data.afternoonSnack !== 'Não necessário' && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2 text-gray-700 dark:text-gray-600">
                      <span className="w-2 h-2 bg-green-600 rounded-full" />
                      Lanche da Tarde
                    </h4>
                    <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300" data-testid="meal-afternoon-snack">
                      {mealPlanMutation.data.afternoonSnack}
                    </p>
                  </div>
                )}

                {/* Jantar */}
                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2 text-gray-700 dark:text-gray-600">
                    <span className="w-2 h-2 bg-green-600 rounded-full" />
                    Jantar
                  </h4>
                  <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300" data-testid="meal-dinner">
                    {mealPlanMutation.data.dinner}
                  </p>
                </div>

                {/* Ceia */}
                {mealPlanMutation.data.eveningSnack && mealPlanMutation.data.eveningSnack !== 'Não necessário' && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2 text-gray-700 dark:text-gray-600">
                      <span className="w-2 h-2 bg-green-600 rounded-full" />
                      Ceia
                    </h4>
                    <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300" data-testid="meal-evening-snack">
                      {mealPlanMutation.data.eveningSnack}
                    </p>
                  </div>
                )}

                {/* Observações Gerais */}
                {mealPlanMutation.data.generalNotes && (
                  <div className="pt-3 border-t border-green-200 dark:border-green-800">
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2 text-gray-700 dark:text-gray-600">
                      <Lightbulb className="w-4 h-4 text-green-600" />
                      Observações e Recomendações
                    </h4>
                    <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300" data-testid="meal-general-notes">
                      {mealPlanMutation.data.generalNotes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Estado de Loading */}
          {mealPlanMutation.isPending && (
            <Card className="bg-muted/30" data-testid="meal-plan-loading">
              <CardContent className="py-8">
                <div className="flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 animate-spin mr-3" />
                  <span className="text-sm">Analisando informações do paciente e gerando sugestão personalizada...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Erro */}
          {mealPlanMutation.error && (
            <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" data-testid="meal-plan-error">
              <CardContent className="py-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {mealPlanMutation.error instanceof Error ? mealPlanMutation.error.message : "Erro ao gerar sugestão"}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Separator />

        {/* Perguntas Rápidas */}
        <div>
          <h3 className="font-medium mb-3 text-gray-800 dark:text-gray-200">Perguntas Rápidas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {quickQuestions.map((quickQ, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="justify-start h-auto py-2 px-3 text-xs"
                onClick={() => handleQuickQuestion(quickQ)}
                disabled={askMutation.isPending}
                data-testid={`quick-question-${index}`}
              >
                {quickQ}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Campo de Pergunta */}
        <div>
          <h3 className="font-medium mb-3 text-gray-800 dark:text-gray-200">Faça uma Pergunta Específica</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Ex: Como o paciente reagiu às últimas orientações?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion(question)}
              disabled={askMutation.isPending}
              data-testid="ai-question-input"
            />
            <Button
              onClick={() => handleAskQuestion(question)}
              disabled={askMutation.isPending || !question.trim()}
              data-testid="ai-question-submit"
            >
              {askMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Resposta da IA */}
        {askMutation.data && (
          <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" data-testid="ai-response-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-blue-900 dark:text-blue-100">
                <Brain className="w-4 h-4 text-blue-600" />
                Resposta da IA
                <Badge variant="outline" className="text-xs ml-auto" data-testid="confidence-badge">
                  Confiança: {Math.round(askMutation.data.confidence * 100)}%
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-wrap leading-relaxed" data-testid="ai-response-text">
                  {askMutation.data.answer}
                </div>
              </div>

              {/* Fontes */}
              {askMutation.data.sources.length > 0 && (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSources(showSources === askMutation.data?.answer ? null : askMutation.data?.answer || null)}
                    className="text-xs"
                    data-testid="toggle-sources"
                  >
                    {showSources === askMutation.data?.answer ? (
                      <>
                        <ChevronUp className="w-3 h-3 mr-1" />
                        Ocultar fontes
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3 mr-1" />
                        Ver {askMutation.data.sources.length} fonte(s)
                      </>
                    )}
                  </Button>

                  {showSources === askMutation.data?.answer && (
                    <div className="mt-3 space-y-2" data-testid="ai-sources">
                      {askMutation.data.sources.map((source, index) => (
                        <div key={index} className="bg-white dark:bg-gray-900 p-3 rounded border text-xs" data-testid={`ai-source-${index}`}>
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant={source.fromMe ? "default" : "secondary"} data-testid={`source-sender-${index}`}>
                              {source.fromMe ? "Nutricionista/IA" : "Paciente"}
                            </Badge>
                            <span className="text-muted-foreground" data-testid={`source-timestamp-${index}`}>
                              {formatTimestamp(source.timestamp)}
                            </span>
                          </div>
                          <p className="leading-relaxed" data-testid={`source-text-${index}`}>{source.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Estado de Loading */}
        {askMutation.isPending && (
          <Card className="bg-muted/30" data-testid="ai-loading-card">
            <CardContent className="py-8">
              <div className="flex items-center justify-center">
                <RefreshCw className="w-5 h-5 animate-spin mr-3" />
                <span className="text-sm" data-testid="ai-loading-text">Analisando conversas e processando resposta...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Erro */}
        {askMutation.error && (
          <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" data-testid="ai-error-card">
            <CardContent className="py-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <p className="text-sm text-red-700 dark:text-red-300" data-testid="ai-error-message">
                  {askMutation.error instanceof Error ? askMutation.error.message : "Erro ao processar pergunta"}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
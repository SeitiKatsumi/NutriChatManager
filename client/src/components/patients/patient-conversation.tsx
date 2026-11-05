import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Loader2, MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatMessage {
  id: number;
  message_body: string | null;
  from_me: boolean | null;
  date_created: string | null;
  media?: { url: string; contentType: string }[];
}

export default function PatientConversation({ patientId, patientName }: { patientId: string; patientName: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const { data, isLoading, isFetching, isError, refetch } = useQuery<{ messages: ChatMessage[] }>({
    // ponytail: fetch the complete history for this small clinic; paginate if histories become large.
    queryKey: [`/api/messages/patient/${encodeURIComponent(patientId)}?limit=-1`],
    staleTime: 0,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });
  const messages = data?.messages;

  useEffect(() => {
    if (followLatest.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <section className="overflow-hidden rounded-lg border bg-card" aria-label={`Conversa de ${patientName}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4 shrink-0" />Conversa com a IA</h3>
          <p className="mt-1 text-xs text-muted-foreground">Histórico registrado · atualização a cada 10 segundos</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Atualizar
        </Button>
      </div>
      {isError && (
        <p role="alert" className="border-b p-4 text-sm text-destructive">
          Não foi possível atualizar a conversa. Tente novamente em Atualizar.
        </p>
      )}
      <div
        ref={scrollRef}
        className="h-[50vh] min-h-[240px] overflow-y-auto overscroll-contain bg-background/40 p-3 sm:p-5"
        tabIndex={0}
        role="region"
        aria-label="Histórico de mensagens"
        aria-busy={isLoading}
        onScroll={(event) => {
          const element = event.currentTarget;
          followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
        data-testid="patient-conversation-history"
      >
        {isLoading ? (
          <p role="status" className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Carregando conversa...
          </p>
        ) : messages?.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <MessageSquare aria-hidden="true" className="h-8 w-8" />
            <p className="text-sm">Nenhuma mensagem registrada para este paciente.</p>
          </div>
        ) : (
          <ol className="space-y-4" aria-label="Mensagens em ordem cronológica">
            {[...(messages || [])].reverse().map((message) => {
              const isAI = message.from_me === true;
              const date = message.date_created ? new Date(message.date_created) : null;
              const hasDate = date && !Number.isNaN(date.getTime());
              return (
                <li key={message.id} className={`flex ${isAI ? "justify-end" : "justify-start"}`} data-testid={`chat-message-${message.id}`}>
                  <div className={`min-w-0 max-w-[90%] rounded-2xl border px-4 py-3 sm:max-w-[80%] ${isAI ? "rounded-tr-sm border-primary/25 bg-primary/10" : "rounded-tl-sm bg-muted/60"}`}>
                    <p className={`mb-1 flex items-center gap-1.5 text-xs font-semibold ${isAI ? "text-primary" : "text-foreground"}`}>
                      {isAI && <Bot aria-hidden="true" className="h-3.5 w-3.5" />}
                      {isAI ? "IA · NutriChatbot" : patientName}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{message.message_body || "[Mensagem sem texto]"}</p>
                    {message.media?.map((media, index) => (
                      <div key={index} className="mt-3 max-w-full">
                        {/^image\/(jpeg|png|gif|webp)(;|$)/.test(media.contentType) ? (
                          <a href={media.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir imagem em tamanho completo">
                            <img src={media.url} alt="Imagem enviada na conversa" loading="lazy" className="max-h-72 max-w-full rounded-lg object-contain" />
                          </a>
                        ) : media.contentType.startsWith('audio/') ? (
                          <audio controls preload="none" src={media.url} className="w-64 max-w-full" aria-label="Ouvir áudio enviado">Áudio indisponível.</audio>
                        ) : media.contentType.startsWith('video/') ? (
                          <video controls preload="none" src={media.url} className="max-h-72 max-w-full rounded-lg" aria-label="Assistir vídeo enviado" />
                        ) : null}
                        <a href={media.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs text-primary underline">Abrir / baixar anexo</a>
                      </div>
                    ))}
                    <time dateTime={hasDate ? date.toISOString() : undefined} className="mt-2 block text-right text-[11px] text-muted-foreground">
                      {hasDate ? date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "Horário não registrado"}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">Visualização do histórico. Horários de Brasília.</p>
    </section>
  );
}

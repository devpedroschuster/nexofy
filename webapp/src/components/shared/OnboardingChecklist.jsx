// webapp/src/components/shared/OnboardingChecklist.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, PartyPopper, X, ChevronRight } from 'lucide-react';
import Surface from '../ui/Surface';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { modalidadeService } from '../../services/modalidadeService';
import { professoresService } from '../../services/professoresService';
import { planosService } from '../../services/planosService';
import { dashboardService } from '../../services/dashboardService';
import { calcularProgressoChecklist, calcularEstadoChecklist } from '../../lib/onboardingChecklist';

const chaveDismissed      = (estudioId) => `nexofy:onboarding:${estudioId}:dismissed`;
const chaveCompleted      = (estudioId) => `nexofy:onboarding:${estudioId}:completed`;
const chaveSeenIncomplete = (estudioId) => `nexofy:onboarding:${estudioId}:seen-incomplete`;

// localStorage pode lançar em modo privado/cookies bloqueados — degrada
// graciosamente (o checklist só volta a aparecer no próximo carregamento).
function lerFlag(chave) {
  try {
    return localStorage.getItem(chave) === 'true';
  } catch {
    return false;
  }
}
function gravarFlag(chave) {
  try {
    localStorage.setItem(chave, 'true');
  } catch {
    // ignorado de propósito — ver comentário acima.
  }
}

function Confetti() {
  // Inicializador "preguiçoso" do useState (chamado só uma vez, no mount) —
  // gera as posições aleatórias das peças. Usamos useState em vez de
  // useMemo aqui de propósito: a regra react-hooks/purity trata qualquer
  // chamada a Math.random dentro de um useMemo como impura (o factory de
  // useMemo é reavaliado como parte do render), mas o inicializador de
  // useState é reconhecido como o padrão correto pra "computar uma vez só,
  // no mount" — ver https://react.dev/reference/react/useState#avoiding-recreating-the-initial-state.
  const [pecas] = useState(
    () => Array.from({ length: 18 }, (_, i) => ({
      id: i,
      esquerda: Math.round(Math.random() * 100),
      atraso: Math.round(Math.random() * 300),
      cor: ['bg-primary', 'bg-success', 'bg-warning', 'bg-info'][i % 4],
    }))
  );

  return (
    <div
      className="absolute inset-x-0 top-0 h-24 overflow-hidden pointer-events-none motion-reduce:hidden"
      aria-hidden="true"
    >
      {pecas.map(p => (
        <span
          key={p.id}
          className={`absolute top-0 w-1.5 h-1.5 rounded-sm ${p.cor} animate-confetti-fall`}
          style={{ left: `${p.esquerda}%`, animationDelay: `${p.atraso}ms` }}
        />
      ))}
    </div>
  );
}

export default function OnboardingChecklist({ estudioId }) {
  const [dismissed, setDismissed] = useState(() => lerFlag(chaveDismissed(estudioId)));
  const [completedAck, setCompletedAck] = useState(() => lerFlag(chaveCompleted(estudioId)));
  const [seenIncomplete, setSeenIncomplete] = useState(() => lerFlag(chaveSeenIncomplete(estudioId)));

  const { data: contagens } = useQuery({
    queryKey: ['onboarding-checklist', estudioId],
    queryFn: async () => {
      const [modalidade, professor, plano, aluno] = await Promise.all([
        modalidadeService.contar(estudioId),
        professoresService.contar(estudioId),
        planosService.contar(estudioId),
        dashboardService.obterTotalAlunos(estudioId),
      ]);
      return { modalidade, professor, plano, aluno };
    },
    // completedAck === true é estado terminal (calcularEstadoChecklist já
    // retorna 'oculto' incondicionalmente nesse caso) — não há motivo pra
    // continuar disparando as 4 queries de contagem em todo carregamento do
    // dashboard de um estúdio que já reconheceu o checklist concluído.
    enabled: !!estudioId && !completedAck,
    // staleTime baixo de propósito: é assim que o checklist reage a "criei
    // uma modalidade e voltei pro dashboard" (navegação SPA, sem reload)
    // dentro da mesma sessão — refetchOnMount (default do React Query)
    // recarrega as contagens sempre que o componente remonta. São 4 queries
    // `count: exact, head: true`, bem leves; live-feedback correto importa
    // mais aqui do que economizar essas requisições.
    staleTime: 0,
  });

  const progresso = useMemo(() => calcularProgressoChecklist(contagens || {}), [contagens]);

  const { estado, marcarConcluido } = useMemo(
    () => calcularEstadoChecklist({
      completo: progresso.completo,
      dismissed,
      seenIncomplete,
      completedAck,
    }),
    [progresso.completo, dismissed, seenIncomplete, completedAck]
  );

  // Ajusta o estado durante o render — padrão oficial do React pra reagir a
  // um valor já calculado nesse mesmo render (ver "Adjusting state when a
  // prop changes" em https://react.dev/learn/you-might-not-need-an-effect).
  // Evitamos de propósito colocar isso num useEffect: a regra
  // react-hooks/set-state-in-effect rejeita setState síncrono direto no
  // corpo de um efeito, porque o valor (marcarConcluido/estado) já está
  // disponível de forma síncrona neste render — não é uma reação a um
  // sistema externo assíncrono, então não precisa de efeito. Cada `set`
  // aqui converge em uma única re-renderização extra (a guarda fica falsa
  // assim que o estado é atualizado), sem loop.
  //
  // A guarda é `contagens` (dado real carregado), não `isLoading`:
  // isLoading fica false tanto quando a query teve sucesso quanto quando ela
  // falhou (retries esgotados) ou está offline/pausada sem cache — nos dois
  // últimos casos `contagens` continua undefined. Se a guarda fosse só
  // `!isLoading`, uma falha transitória de rede no dashboard de um estúdio
  // já totalmente configurado calcularia progresso sobre `{}` (0 de 3),
  // gravaria "seen-incomplete = true" permanentemente no localStorage, e na
  // próxima vez que a query desse certo o combo `completo && seenIncomplete`
  // dispararia a comemoração com confete pra um estúdio configurado há
  // meses — exatamente o efeito colateral que `seenIncomplete` existe pra
  // evitar. `contagens` truthy distingue "carreguei dados de verdade" de
  // "ainda carregando OU falhou OU está offline", nos três casos undefined.
  // A checagem extra `&& estudioId` é necessária porque o useQuery é
  // desabilitado (`enabled: !!estudioId && !completedAck`) quando estudioId
  // é falsy — sem essa guarda, este bloco poderia gravar um flag numa chave
  // de localStorage inválida (chave com "undefined").
  if (contagens && estudioId) {
    if (marcarConcluido && !completedAck) {
      setCompletedAck(true);
    } else if (!marcarConcluido && (estado === 'expandido' || estado === 'colapsado') && !seenIncomplete) {
      setSeenIncomplete(true);
    }
  }

  // Persiste os flags de acknowledgment no localStorage sempre que o React
  // já os considerar `true` — sincroniza o estado (ajustado acima, durante
  // o render) com o sistema externo. Este efeito só grava, nunca chama
  // setState — por isso não cai na regra react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!estudioId) return;
    if (completedAck) gravarFlag(chaveCompleted(estudioId));
    if (seenIncomplete) gravarFlag(chaveSeenIncomplete(estudioId));
  }, [completedAck, seenIncomplete, estudioId]);

  // `!contagens` cobre tanto "ainda carregando" quanto "erro/offline sem
  // cache" — nos dois casos não há dado real pra mostrar, e renderizar o
  // checklist calculado sobre `{}` fabricaria um "0 de 3" enganoso pra um
  // estúdio que pode já estar com tudo configurado. `estado === 'oculto'`
  // continua checado antes, já que completedAck oculta o card mesmo sem
  // `contagens` (a query fica desabilitada nesse estado terminal).
  if (!estudioId || estado === 'oculto' || !contagens) return null;

  if (estado === 'comemorando') {
    return (
      <Surface
        variant="elevated"
        padding="lg"
        className="relative overflow-hidden border-success/40"
        role="status"
        aria-live="polite"
      >
        <Confetti />
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-success-soft flex items-center justify-center shrink-0">
              <PartyPopper size={22} className="text-success" />
            </div>
            <div>
              <p className="font-black text-foreground">Configuração completa!</p>
              <p className="text-sm text-muted-foreground">Seu estúdio tá pronto pra voar. 🚀</p>
            </div>
          </div>
          <Button
            variant="success"
            size="sm"
            onClick={() => setCompletedAck(true)}
          >
            Show, obrigado!
          </Button>
        </div>
      </Surface>
    );
  }

  if (estado === 'colapsado') {
    return (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground
          bg-muted hover:bg-accent transition-colors rounded-full px-3 py-1.5"
      >
        Configuração inicial: {progresso.concluidasObrigatorias}/{progresso.totalObrigatorias}
        <span className="text-primary">Continuar →</span>
      </button>
    );
  }

  return (
    <Surface variant="card" padding="lg" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-foreground">Vamos deixar seu estúdio pronto! 🚀</p>
          <p className="text-sm text-muted-foreground">
            {progresso.concluidasObrigatorias} de {progresso.totalObrigatorias} concluídos
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            gravarFlag(chaveDismissed(estudioId));
            setDismissed(true);
          }}
          aria-label="Dispensar checklist"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div
        className="h-2 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={progresso.percentual}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progresso.percentual}%` }}
        />
      </div>

      <ul className="space-y-2">
        {progresso.etapas.map(etapa => (
          <li key={etapa.id} className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              {etapa.concluida
                ? <CheckCircle2 size={18} className="text-success shrink-0" />
                : <Circle size={18} className="text-muted-foreground shrink-0" />}
              <span className={etapa.concluida ? 'text-muted-foreground line-through' : 'text-foreground font-medium'}>
                {etapa.label}
              </span>
              {etapa.opcional && <Badge tone="neutral" variant="soft">opcional</Badge>}
            </div>
            {!etapa.concluida && (
              <Link to={etapa.ctaPath}>
                <Button variant="outline" size="sm" rightIcon={<ChevronRight size={14} />}>
                  {etapa.ctaLabel}
                </Button>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Surface>
  );
}

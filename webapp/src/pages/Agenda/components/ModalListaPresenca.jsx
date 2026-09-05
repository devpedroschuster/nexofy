import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { ModalConfirmacao } from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import { deriveEstadoChamada } from '../hooks/useListaPresenca';

const ROTULO_TIPO = {
  fixo: { label: 'Fixo', tone: 'text-purple bg-purple-soft' },
  avulso: { label: 'Avulso', tone: 'text-info bg-info-soft' },
  experimental: { label: 'Lead', tone: 'text-warning bg-warning/20' },
};

// Modo Kiosk: tela cheia (sem o <Modal> genérico) pra caber alvos de toque
// grandes e caber na tela de um celular/tablet entre uma aula e outra. Cada
// aluno tem só um toggle Presente/Falta — "Justificar falta" só aparece
// depois que "Falta" já foi tocado, pra não obrigar 2 decisões no caminho
// comum. Sem botão de salvar: cada toque já grava (mesmo padrão de
// auto-save do resto do hook).
export default function ModalListaPresenca({
  aberto, fechar,
  aulaParaLista, dataLista, setDataLista, listaPresenca, loadingLista, erroLista,
  handleMarcarPresente, handleRegistrarFalta, handleDesfazerFalta,
  alunoParaRemover, solicitarRemocao, confirmarRemocao, cancelarRemocao,
  processandoAcaoId,
  isAdmin,
}) {
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e) => e.key === 'Escape' && fechar();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [aberto, fechar]);

  if (!aberto || !aulaParaLista || typeof document === 'undefined') return null;

  const confirmados = listaPresenca.filter(
    (a) => deriveEstadoChamada(a) !== 'pendente'
  ).length;
  const total = listaPresenca.length;
  const progresso = total > 0 ? Math.round((confirmados / total) * 100) : 0;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Cabeçalho */}
      <div className="shrink-0 border-b border-border px-5 pt-5 pb-3.5 flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <button
            onClick={fechar}
            aria-label="Fechar chamada"
            className="w-9.5 h-9.5 rounded-xl bg-muted flex items-center justify-center shrink-0 text-foreground"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black text-foreground truncate">{aulaParaLista.atividade}</h1>
            <Input
              type="date"
              value={dataLista}
              onChange={(e) => setDataLista(e.target.value)}
              className="mt-1 h-7 text-xs bg-transparent border-none px-0 font-semibold text-muted-foreground"
            />
          </div>
          {total > 0 && (
            <div className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-black whitespace-nowrap shrink-0">
              {confirmados}/{total}
            </div>
          )}
        </div>
        {total > 0 && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-success rounded-full transition-all duration-300"
              style={{ width: `${progresso}%` }}
            />
          </div>
        )}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loadingLista ? (
          <div className="p-6 text-center text-sm text-muted-foreground font-medium">Carregando...</div>
        ) : erroLista ? (
          <div className="p-5 text-sm text-destructive bg-destructive-soft m-4 rounded-xl">{erroLista}</div>
        ) : listaPresenca.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground font-medium">
            Ninguém matriculado ou agendado ainda.
          </div>
        ) : (
          listaPresenca.map((aluno, idx) => {
            const itemKey = aluno.id_relacao ?? aluno.aluno_id ?? aluno.lead_id ?? `fallback-${aluno.tipo}-${idx}`;
            const estado = deriveEstadoChamada(aluno);
            const estaProcessando = processandoAcaoId === itemKey;
            const tipoInfo = ROTULO_TIPO[aluno.tipo] ?? ROTULO_TIPO.avulso;
            const podeRemover = isAdmin && aluno.tipo !== 'fixo';
            const podeJustificar = estado === 'falta' && aluno.status === 'falta_nao_avisada';

            return (
              <div key={itemKey} className="px-5 py-4 border-b border-border/70 flex flex-col gap-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-10.5 h-10.5 rounded-2xl bg-primary-soft text-primary flex items-center justify-center font-black text-sm uppercase shrink-0">
                    {aluno.nome?.[0] ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[15px] text-foreground truncate">{aluno.nome}</p>
                    <span className={`inline-block text-[9.5px] font-black uppercase tracking-wide px-1.75 py-0.5 rounded-md ${tipoInfo.tone}`}>
                      {tipoInfo.label}
                    </span>
                  </div>
                  {podeRemover && (
                    <button
                      onClick={() => solicitarRemocao(aluno.id_relacao)}
                      aria-label="Remover da lista"
                      className="w-9.5 h-9.5 rounded-xl flex items-center justify-center text-muted-foreground shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    disabled={estaProcessando}
                    onClick={() => handleMarcarPresente(aluno)}
                    className={`flex-1 h-11.5 rounded-2xl border-1.5 font-black text-[13.5px] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${
                      estado === 'presente'
                        ? 'bg-success text-success-foreground border-transparent'
                        : 'bg-card border-border text-muted-foreground'
                    }`}
                  >
                    {estado === 'presente' && <CheckCircle2 size={16} />}
                    Presente
                  </button>
                  <button
                    disabled={estaProcessando}
                    onClick={() => handleRegistrarFalta(aluno, 'nao_avisada')}
                    className={`flex-1 h-11.5 rounded-2xl border-1.5 font-black text-[13.5px] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${
                      estado === 'falta'
                        ? 'bg-destructive text-destructive-foreground border-transparent'
                        : 'bg-card border-border text-muted-foreground'
                    }`}
                  >
                    {estado === 'falta' && <XCircle size={16} />}
                    Falta
                  </button>
                </div>

                {estado === 'falta' && (
                  <div className="pl-0.5">
                    {podeJustificar ? (
                      <button
                        disabled={estaProcessando}
                        onClick={() => handleRegistrarFalta(aluno, 'justificada')}
                        className="text-xs font-bold text-muted-foreground disabled:opacity-50"
                      >
                        Justificar falta →
                      </button>
                    ) : (
                      <button
                        disabled={estaProcessando}
                        onClick={() => handleDesfazerFalta(aluno)}
                        className="text-xs font-bold text-muted-foreground disabled:opacity-50"
                      >
                        Desfazer falta
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="shrink-0 text-center py-4 text-[11.5px] font-semibold text-muted-foreground">
        Alterações salvas automaticamente
      </p>

      <ModalConfirmacao
        isOpen={!!alunoParaRemover}
        onClose={cancelarRemocao}
        onConfirm={confirmarRemocao}
        titulo="Remover Aluno"
        mensagem="Tem certeza que deseja remover este aluno desta lista de presença?"
        tipo="danger"
      />
    </div>,
    document.body
  );
}

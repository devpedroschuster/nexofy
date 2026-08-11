// components/tabela/ConfiguracaoColunas.jsx
//
// Tela de configuração de colunas para uma tabela configurável (Alunos
// ou Financeiro). Reaproveitado pelas duas rotas de configuração — não
// duplicar componente por tabela (ver seção 5.3 do plano do item 3).
//
// Drag-and-drop implementado com a HTML5 Drag and Drop API nativa (sem
// lib externa) — decisão deliberada: o risco listado no plano era
// "confirmar lib de DnD antes de instalar uma nova"; como não havia
// nenhuma já em uso identificada, optei por não adicionar dependência
// nova só para isso. Se o projeto já tiver @hello-pangea/dnd ou
// equivalente em uso em outro módulo, dá pra trocar a implementação de
// arrastar por essa lib sem alterar o restante do componente (o hook e
// o service não mudam).
//
// IMPORTANTE — troque pelos componentes reais do design system da
// Nexofy antes de mergear:
//   - <Toast .../>              -> shared/Toast.jsx (ou o helper de toast já usado, ex. useToast()/toast.success())
//   - <BotaoPrimario>/<Botao>   -> ui/Button.jsx
//   - <input>/<label> genéricos -> equivalentes de ui/ já usados em ConfiguracoesEspacos.jsx
// Mantive tudo com elementos nativos + classes utilitárias (assumindo
// Tailwind, como no restante do projeto) para o componente já ser
// funcional e testável sem depender de imports que eu não tenho certeza
// do caminho exato.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTabelaColunas } from '../../hooks/useTabelaColunas';
import { TABLE_LABELS } from '../../lib/tabelaColunas';

/**
 * @param {{ tabela: 'alunos' | 'financeiro' }} props
 */
export function ConfiguracaoColunas({ tabela }) {
  const {
    colunas,
    data,
    isLoading,
    isError,
    error,
    hasPending,
    seedIfNeeded,
    updateLabel,
    toggleVisible,
    reorder,
  } = useTabelaColunas(tabela);

  const [toast, setToast] = useState(null); // { type: 'success'|'error', message: string }
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [localOrder, setLocalOrder] = useState([]);
  const dragIndexRef = useRef(null);

  // Colunas pendentes (campo novo em campos_dinamicos / coluna nova no
  // catálogo estático) ainda não têm linha em tabela_colunas_config.
  // Semeia automaticamente ao detectar, sem exigir ação do admin.
  useEffect(() => {
    if (hasPending && !seedIfNeeded.isPending) {
      seedIfNeeded.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPending]);

  // Espelha a ordem vinda do servidor no estado local, exceto durante um
  // drag em andamento (evita a lista "pular" enquanto o usuário arrasta).
  // Depende de query.data (referência estável do cache do TanStack Query,
  // só muda quando o dado realmente muda) e não de `colunas` — `colunas`
  // usa fallback `?? []`, que cria um array novo a cada render enquanto
  // `query.data` é undefined (fase de loading), o que disparava esse
  // efeito em loop infinito antes mesmo da query resolver.
  useEffect(() => {
    setLocalOrder((data ?? []).map((c) => c.id));
  }, [data]);

  const colunasPorId = useMemo(() => {
    const map = new Map(colunas.map((c) => [c.id, c]));
    return map;
  }, [colunas]);

  const colunasOrdenadas = localOrder
    .map((id) => colunasPorId.get(id))
    .filter(Boolean);

  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }

  function iniciarEdicaoLabel(coluna) {
    if (coluna.id.startsWith('pending-')) return; // ainda semeando
    setEditingId(coluna.id);
    setEditingValue(coluna.label);
  }

  async function confirmarEdicaoLabel(coluna) {
    const novoLabel = editingValue.trim();
    setEditingId(null);

    if (!novoLabel || novoLabel === coluna.label) return;

    try {
      await updateLabel.mutateAsync({ id: coluna.id, label: novoLabel });
      showToast('success', 'Nome da coluna atualizado.');
    } catch (e) {
      showToast('error', e.message ?? 'Erro ao atualizar nome da coluna.');
    }
  }

  async function alternarVisibilidade(coluna) {
    if (coluna.id.startsWith('pending-')) return;

    try {
      await toggleVisible.mutateAsync({ id: coluna.id, currentVisible: coluna.is_visible });
    } catch (e) {
      showToast('error', e.message ?? 'Erro ao atualizar visibilidade.');
    }
  }

  function handleDragStart(index) {
    dragIndexRef.current = index;
  }

  function handleDragOver(event, index) {
    event.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === index) return;

    setLocalOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(index, 0, moved);
      dragIndexRef.current = index;
      return next;
    });
  }

  async function handleDragEnd() {
    dragIndexRef.current = null;

    if (localOrder.some((id) => id.startsWith('pending-'))) {
      showToast('error', 'Aguarde a inicialização das colunas para reordenar.');
      setLocalOrder(colunas.map((c) => c.id));
      return;
    }

    try {
      await reorder.mutateAsync(localOrder);
    } catch (e) {
      showToast('error', e.message ?? 'Erro ao reordenar colunas.');
      setLocalOrder(colunas.map((c) => c.id)); // desfaz reorder local em caso de falha
    }
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-500">Carregando configuração de colunas…</div>;
  }

  if (isError) {
    return (
      <div className="p-6 text-sm text-red-600">
        Erro ao carregar configuração de colunas: {error?.message ?? 'erro desconhecido'}
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-semibold mb-1">{TABLE_LABELS[tabela] ?? 'Configuração de colunas'}</h2>
      <p className="text-sm text-gray-500 mb-4">
        Arraste para reordenar, clique no nome para renomear, ou oculte colunas que não usa.
      </p>

      {hasPending && (
        <div className="mb-4 text-sm text-amber-600">Inicializando novas colunas…</div>
      )}

      <ul className="border rounded-md divide-y">
        {colunasOrdenadas.map((coluna, index) => {
          const pendente = coluna.id.startsWith('pending-');
          return (
            <li
              key={coluna.id}
              draggable={!pendente}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 px-3 py-2 ${pendente ? 'opacity-50' : 'cursor-move'}`}
              data-testid={`coluna-${coluna.column_key}`}
            >
              <span className="text-gray-400 select-none" aria-hidden="true">⠿</span>

              <div className="flex-1">
                {editingId === coluna.id ? (
                  <input
                    autoFocus
                    className="border rounded px-2 py-1 text-sm w-full"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={() => confirmarEdicaoLabel(coluna)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmarEdicaoLabel(coluna);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="text-sm text-left hover:underline disabled:no-underline disabled:cursor-default"
                    onClick={() => iniciarEdicaoLabel(coluna)}
                    disabled={pendente}
                  >
                    {coluna.label}
                  </button>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs text-gray-500 select-none">
                <input
                  type="checkbox"
                  checked={coluna.is_visible}
                  onChange={() => alternarVisibilidade(coluna)}
                  disabled={pendente}
                />
                Visível
              </label>
            </li>
          );
        })}
      </ul>

      {toast && (
        <div
          role="status"
          className={`mt-4 text-sm rounded px-3 py-2 ${
            toast.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
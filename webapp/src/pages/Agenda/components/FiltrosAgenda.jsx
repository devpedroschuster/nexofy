import React from 'react';
import { Filter } from 'lucide-react';
import Surface from '../../../components/ui/Surface';
import Input from '../../../components/ui/Input';
import { IconeEspaco } from '../../../lib/iconesEspaco';
import { PALETA_CORES } from '../../../lib/constants';

// espacosDisponiveis: Set<slug> — undefined = mostrar tudo (admin)
export default function FiltrosAgenda({
  filtroEspaco,
  setFiltroEspaco,
  filtroProf,
  setFiltroProf,
  professores,
  isAdmin,
  espacos = [],
  espacosDisponiveis,
}) {
  const espacosVisiveis = espacosDisponiveis
    ? espacos.filter(e => espacosDisponiveis.has(e.slug))
    : espacos;

  // Se o filtro ativo saiu da lista (professor não leciona mais naquele espaço),
  // volta pra 'todos' de forma segura.
  React.useEffect(() => {
    if (filtroEspaco !== 'todos' && !espacosVisiveis.some(e => e.slug === filtroEspaco)) {
      setFiltroEspaco('todos');
    }
  }, [espacosVisiveis, filtroEspaco]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Surface
      variant="card"
      padding="sm"
      className="flex flex-col md:flex-row gap-4 justify-between items-center shrink-0 mb-4"
    >
      <div className="flex flex-wrap bg-muted p-1 rounded-2xl w-full md:w-auto border border-border">
        <button
          onClick={() => setFiltroEspaco('todos')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
            filtroEspaco === 'todos'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Todos
        </button>

        {espacosVisiveis.map((espaco) => {
          const cor = PALETA_CORES.find(c => c.id === espaco.cor) || PALETA_CORES[0];
          const ativo = filtroEspaco === espaco.slug;
          return (
            <button
              key={espaco.id}
              onClick={() => setFiltroEspaco(espaco.slug)}
              className={`px-6 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
                ativo
                  ? `${cor.bg} ${cor.text} shadow-sm border ${cor.border}`
                  : `text-muted-foreground hover:${cor.text}`
              }`}
            >
              <IconeEspaco nome={espaco.icone} size={16} /> {espaco.nome}
            </button>
          );
        })}
      </div>

      {isAdmin && (
        <div className="flex items-center gap-3 pr-2 w-full md:w-auto">
          <span className="text-xs font-bold text-muted-foreground uppercase whitespace-nowrap">
            Professor:
          </span>
          <div className="w-full md:w-56">
            <Input
              as="select"
              leftIcon={<Filter size={16} />}
              value={filtroProf}
              onChange={(e) => setFiltroProf(e.target.value)}
            >
              <option value="todos">Todos</option>
              {professores.map(p => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </Input>
          </div>
        </div>
      )}
    </Surface>
  );
}
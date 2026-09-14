import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, FileSpreadsheet, ChevronDown } from 'lucide-react';
import Button from '../ui/Button';
import { cn } from '../../lib/cn';

/**
 * Botão com dropdown para exportar um relatório de dashboard em PDF ou
 * planilha (.xlsx). Fica dumb de propósito: cada página monta seus próprios
 * dados (ver webapp/src/lib/relatorioExport.js) e passa os callbacks.
 */
export default function ExportarRelatorioMenu({
  onExportarPDF,
  onExportarPlanilha,
  disabled = false,
  className,
}) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    function handleClickFora(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [aberto]);

  function handleAcao(callback) {
    setAberto(false);
    callback?.();
  }

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        rightIcon={<ChevronDown size={14} />}
        onClick={() => setAberto((v) => !v)}
      >
        <Download size={14} /> Exportar
      </Button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-52 rounded-2xl border border-border bg-card p-1.5 shadow-elegant animate-in fade-in duration-150"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAcao(onExportarPDF)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <FileText size={15} className="text-destructive" /> Exportar PDF
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleAcao(onExportarPlanilha)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <FileSpreadsheet size={15} className="text-success" /> Exportar Planilha
          </button>
        </div>
      )}
    </div>
  );
}

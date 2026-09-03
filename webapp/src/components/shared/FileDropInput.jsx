// webapp/src/components/shared/FileDropInput.jsx
//
// Input de arquivo reutilizável: clique OU arrastar-e-soltar. Não existia
// nenhum componente de upload compartilhado no projeto antes deste (só um
// <input type="file"> escondido específico de ConfiguracoesEstudio.jsx) —
// este generaliza o padrão pra qualquer tela que precisar de upload.

import React, { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { cn } from '../../lib/cn';

export default function FileDropInput({ accept, onFileSelected, descricao, disabled }) {
  const inputRef = useRef(null);
  const [arrastando, setArrastando] = useState(false);

  function processarArquivo(arquivo) {
    if (arquivo) onFileSelected(arquivo);
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      className={cn(
        'rounded-2xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        arrastando ? 'border-primary bg-primary-soft' : 'border-border bg-muted/40 hover:bg-muted',
        disabled && 'opacity-50 pointer-events-none'
      )}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        // Div clicável não é alcançável via teclado por padrão — Enter/Espaço
        // replicam o comportamento nativo de um <button> ou <input type=file>
        // (PED-122).
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        processarArquivo(e.dataTransfer.files?.[0]);
      }}
    >
      <UploadCloud size={32} className="mx-auto mb-3 text-muted-foreground" />
      <p className="text-sm font-bold text-foreground">
        Clique para escolher um arquivo ou arraste aqui
      </p>
      {descricao && <p className="text-xs text-muted-foreground mt-1">{descricao}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onClick={(e) => { e.target.value = null; }}
        onChange={(e) => processarArquivo(e.target.files?.[0])}
      />
    </div>
  );
}

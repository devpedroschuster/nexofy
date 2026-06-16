// webapp/src/pages/SuperAdmin/pages/SuperAdminEstudios.jsx
//
// Rota: /super/estudios
// Lista de todos os estúdios com busca, filtro e ações de suspender/reativar.

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import TabelaEstudios from '../components/TabelaEstudios';

export default function SuperAdminEstudios() {
  const [busca, setBusca] = useState('');

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Estúdios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gerencie todos os estúdios cadastrados na plataforma.
          </p>
        </div>
        <Button
          as={Link}
          to="/super/estudios/novo"
          variant="brand"
          leftIcon={<Plus size={18} />}
        >
          Novo estúdio
        </Button>
      </div>

      {/* Campo de busca */}
      <div className="max-w-sm">
        <Input
          leftIcon={<Search size={16} />}
          placeholder="Buscar por nome ou slug…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <TabelaEstudios busca={busca} />
    </div>
  );
}
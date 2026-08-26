import { PageHeader } from "@/components/shell/PageHeader";

const MOCK = [
  { name: "Carlos Mendes", phone: "(11) 98888-1001", points: 120 },
  { name: "João Pedro", phone: "(11) 97777-2202", points: 45 },
  { name: "Ricardo Alves", phone: "(11) 96666-3303", points: 0 },
];

export default function ClientesPage() {
  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Cadastro operacional"
        actions={
          <button type="button" className="btn btn-primary">
            + Novo cliente
          </button>
        }
      />
      <section className="panel">
        <div className="panel-toolbar">
          <input type="search" placeholder="Filtrar por nome ou telefone" style={{ flex: 1, maxWidth: 320, padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 3 }} />
          <button type="button" className="btn btn-outline">
            Ativos
          </button>
          <button type="button" className="btn btn-outline">
            Removidos
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Pontos</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {MOCK.map((c) => (
                <tr key={c.phone}>
                  <td>{c.name}</td>
                  <td>{c.phone}</td>
                  <td>{c.points}</td>
                  <td>
                    <button type="button" className="btn btn-info" style={{ marginRight: 6 }}>
                      WhatsApp
                    </button>
                    <button type="button" className="btn btn-outline">
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

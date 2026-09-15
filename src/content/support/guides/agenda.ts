import type { SupportGuide } from "./types";

export const guideAgenda: SupportGuide = {
  id: "agenda",
  title: "Agenda",
  status: "skeleton",
  href: "/agenda",
  menuPath: "Agenda",
  aliases: ["agenda", "grade", "horário", "agendar", "marcar", "encaixe", "calendário"],
  roles: ["owner", "admin", "reception", "staff"],
  intents: ["onde_fica", "como_fazer", "objecao"],
  summary: "Grade por profissional: marcar, remarcar, encaixe e abrir comanda do horário.",
  steps: [],
  objections: [],
  relatedGuideIds: ["lista-espera", "clientes", "comandas", "servicos"],
  lastVerified: null,
  enrichNotes: [
    "Clique em slot vazio; pensamento rápido (desktop)",
    "Status confirmado / encaixe agora",
    "Abrir comanda a partir do agendamento",
  ],
};

export const guideListaEspera: SupportGuide = {
  id: "lista-espera",
  title: "Lista de espera",
  status: "skeleton",
  href: "/lista-espera",
  menuPath: "Configurações → Lista de espera",
  aliases: ["lista de espera", "espera", "waitlist", "fila"],
  roles: ["owner", "admin", "reception"],
  intents: ["onde_fica", "como_fazer"],
  summary: "Fila de clientes aguardando horário / vaga.",
  steps: [],
  objections: [],
  relatedGuideIds: ["agenda", "conversas-ia"],
  lastVerified: null,
};

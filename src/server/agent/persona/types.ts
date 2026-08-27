/** Persona estruturada — espelha o template YAML de recepção/agendamento. */

export type PersonaPadraoFrase = {
  usar: boolean;
  exemplo: string;
};

export type AgentPersona = {
  cliente: {
    nome_negocio: string;
    segmento: "barbearia" | "salão" | "ambos";
    agente_representa: "recepção";
  };
  persona: {
    essencia: string;
    tom: { tracos: string[] };
    historia_marca: { usar: boolean; episodios: string[] };
    vocabulario: {
      termos_tecnicos: string[];
      termos_proibidos: string[];
    };
    oralidade: {
      saudacao_padrao: string;
      expressoes_tipicas: string[];
      forma_de_tratamento: string;
    };
    padroes_de_frase: {
      repeticao: PersonaPadraoFrase;
      pergunta_resposta: PersonaPadraoFrase;
      contraste: PersonaPadraoFrase;
    };
    tema_emocional_central: string;
    regra_de_ouro: string;
    descaracteriza: string[];
  };
  fluxos: {
    saudacao_inicial: string;
    confirmacao_horario: string;
    horario_indisponivel: string;
    reagendamento: string;
    cancelamento: string;
    sugestao_servico_adicional: string;
    lembrete_horario: string;
    followup_no_show: string;
    encerramento: string;
  };
};

/** Critérios QA — fixos no motor, não editáveis por tenant. */
export const PERSONA_QA_CHECKLIST = [
  "Soa como esta persona ou como um chatbot genérico?",
  "O vocabulário técnico e as expressões típicas aparecem?",
  "O tom se mantém firme em situação de atrito (atraso, reclamação)?",
  "A regra de ouro está sendo respeitada na prática?",
  "Algum termo da lista 'descaracteriza' foi usado?",
  "Dá pra imaginar a recepção do salão falando isso, sem estranhar?",
] as const;

export type PersonaPatch = Partial<{
  cliente: Partial<AgentPersona["cliente"]>;
  persona: Partial<
    Omit<AgentPersona["persona"], "tom" | "historia_marca" | "vocabulario" | "oralidade" | "padroes_de_frase">
  > & {
    tom?: Partial<AgentPersona["persona"]["tom"]>;
    historia_marca?: Partial<AgentPersona["persona"]["historia_marca"]>;
    vocabulario?: Partial<AgentPersona["persona"]["vocabulario"]>;
    oralidade?: Partial<AgentPersona["persona"]["oralidade"]>;
    padroes_de_frase?: Partial<AgentPersona["persona"]["padroes_de_frase"]>;
  };
  fluxos: Partial<AgentPersona["fluxos"]>;
}>;

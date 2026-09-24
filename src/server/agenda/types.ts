export type AgendaStaff = {
  id: string;
  name: string;
  color: string | null;
};

export type AgendaAppointment = {
  id: string;
  staffId: string | null;
  staffName: string | null;
  clientId: string | null;
  clientName: string;
  clientPhone: string | null;
  /** Conta do cliente (centavos). Negativo = fiado. */
  clientAccountBalanceCents: number | null;
  /** Preferência de corte (texto curto). */
  clientHairPreference: string | null;
  clientAvatarUrl: string | null;
  serviceId: string | null;
  serviceName: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  isEncaixe: boolean;
  notes: string | null;
  priceCents: number | null;
  orderId: string | null;
  /** closed = comanda paga/fechada — pinta o card de verde. */
  orderStatus: string | null;
  blockedByName: string | null;
  seriesId: string | null;
  /** Dia da série que não coube na jornada — card vermelho até ela decidir. */
  seriesConflict: string | null;
  /** Datas da série, só no detalhe. */
  seriesUpcoming?: { id: string; startsAt: Date; status: string }[];
  /** Cliente sem preferência de profissional (meta). */
  noPreference: boolean;
  /** Tags livres do horário (meta). */
  tags: string[];
  /** Visita de pacote com mais de um serviço (ex.: Corte + Barba). */
  visitLabel: string | null;
};

export type AgendaDayData = {
  tenantName: string;
  date: string;
  staff: AgendaStaff[];
  appointments: AgendaAppointment[];
  hours: string[];
  /** Turnos do dia por profissional — usado para cinza fora do expediente/almoço. */
  scheduleWindowsByStaffId: Record<string, { startMin: number; endMin: number }[]>;
  waitlistCount: number;
  openOrdersCount: number;
  totalAppointments: number;
};

export type AgendaPickerClient = {
  id: string;
  name: string;
  phone: string | null;
};

export type AgendaPickerService = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
};

export type AgendaPermissions = {
  canWrite: boolean;
  canCancel: boolean;
  canUpdateStatus: boolean;
  canOpenOrder: boolean;
  scopedStaffId: string | null;
};

/** Escopo de edição granular (Tipo AppBarber). */
export type AppointmentEditScope =
  | "time"
  | "service"
  | "staff"
  | "duration"
  | "time_service"
  | "time_staff"
  | "service_staff"
  | "all";

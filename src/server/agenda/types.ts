export type AgendaStaff = {
  id: string;
  name: string;
  color: string | null;
};

export type AgendaAppointment = {
  id: string;
  staffId: string | null;
  clientId: string | null;
  clientName: string;
  serviceId: string | null;
  serviceName: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  isEncaixe: boolean;
  notes: string | null;
  priceCents: number | null;
  orderId: string | null;
};

export type AgendaDayData = {
  tenantName: string;
  date: string;
  staff: AgendaStaff[];
  appointments: AgendaAppointment[];
  hours: string[];
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

export type SupportMessageDto = {
  id: string;
  role: string;
  body: string;
  createdAt: string;
};

export type SupportThreadDto = {
  id: string;
  status: "ai" | "human";
  humanRequestedAt: string | null;
  messages: SupportMessageDto[];
};

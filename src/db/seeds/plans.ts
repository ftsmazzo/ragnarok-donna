import { plans } from "../schema/platform";

/** Seed inicial de planos SaaS (valores de exemplo — ajustar comercialmente). */
export const PLAN_SEEDS: (typeof plans.$inferInsert)[] = [
  {
    code: "trial",
    name: "Trial 30 dias",
    priceCentsMonthly: 0,
    entitlements: {
      max_staff: 5,
      max_branches: 1,
      agent_whatsapp: true,
      ai_credits_monthly: 5000,
      loyalty: true,
      inventory: true,
    },
  },
  {
    code: "starter",
    name: "Starter",
    priceCentsMonthly: 7990,
    entitlements: {
      max_staff: 2,
      max_branches: 1,
      agent_whatsapp: true,
      ai_credits_monthly: 3000,
      loyalty: true,
      inventory: false,
    },
  },
  {
    code: "pro",
    name: "Pro",
    priceCentsMonthly: 14990,
    entitlements: {
      max_staff: 10,
      max_branches: 3,
      agent_whatsapp: true,
      ai_credits_monthly: 15000,
      loyalty: true,
      inventory: true,
    },
  },
  {
    code: "network",
    name: "Rede",
    priceCentsMonthly: 29990,
    entitlements: {
      max_staff: 50,
      max_branches: 20,
      agent_whatsapp: true,
      ai_credits_monthly: 50000,
      loyalty: true,
      inventory: true,
    },
  },
];

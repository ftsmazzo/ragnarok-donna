/** Marca de login por tenant — cada cliente tem rota `/login/{slug}`. */
export type LoginBrand = {
  slug: string;
  name: string;
  tagline: string;
  logoSrc: string;
  accent: string;
  /** Logo clara/transparente — exibir sobre fundo escuro no card branco. */
  logoOnDark?: boolean;
};

export const LOGIN_BRANDS: LoginBrand[] = [
  {
    slug: "ragnaroks",
    name: "Barbearia Ragnarok",
    tagline: "Imagem Masculina · Painel operacional",
    logoSrc: "/branding/ragnarok-logo.png",
    accent: "#735340",
  },
  {
    slug: "donna-elegant",
    name: "Donna Elegant",
    tagline: "Cabelos e unhas · Catanduva-SP",
    logoSrc: "/branding/donna-elegant-logo.png",
    accent: "#3E7454",
    logoOnDark: true,
  },
];

export function getLoginBrand(slug: string): LoginBrand | null {
  return LOGIN_BRANDS.find((b) => b.slug === slug) ?? null;
}

/** Marcas disponíveis no login — cada uma = tenant separado. */
export type LoginBrand = {
  slug: string;
  name: string;
  tagline: string;
  logoSrc: string;
  accent: string;
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
    accent: "#9A7B5A",
  },
];

export function loginBrandForSlug(slug: string | null | undefined): LoginBrand {
  return LOGIN_BRANDS.find((b) => b.slug === slug) ?? LOGIN_BRANDS[0];
}

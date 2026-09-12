/** Country flavour for the demo matrix; falls back to generic street flavour. */
export const COUNTRY_FLAVOUR: Record<string, string> = {
  NL: "canal houses, bicycles everywhere, tram lines overhead",
  FR: "haussmann facades, café terraces, métro signs",
  US: "wide avenues, neon storefront signs, yellow cabs and big sedans",
  GB: "terraced brick, red buses, telephone boxes",
  UK: "terraced brick, red buses, telephone boxes",
  JP: "dense signage, lanterns, narrow shopfronts",
};

export function countryFlavour(countryCode: string): string {
  return COUNTRY_FLAVOUR[countryCode] ?? "period street life and storefronts";
}

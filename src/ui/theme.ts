export const theme = {
  colors: {
    deepInk: "#15121A",
    secondaryInk: "#221E29",
    gothicBurgundy: "#5A2233",
    agedGold: "#9C7A2E",
    smokedMauve: "#6B4A5C",
    darkGreen: "#3F5641",
    inkViolet: "#4B3B66",
    parchment: "#E4D8BE",
  },
  typography: {
    display: 'Georgia, "Times New Roman", serif',
    body: '"Segoe UI", Inter, ui-sans-serif, system-ui, sans-serif',
  },
} as const;

export type NarrativeGenre = "fantasy" | "futuristic" | "steampunk" | "realistic";

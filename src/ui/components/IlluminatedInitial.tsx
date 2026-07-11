import type { NarrativeGenre } from "../theme";

interface IlluminatedInitialProps {
  children: string;
  genre?: NarrativeGenre;
}

const genreClassNames: Record<NarrativeGenre, string> = {
  fantasy: "illuminated-initial--fantasy",
  futuristic: "illuminated-initial--futuristic",
  steampunk: "illuminated-initial--steampunk",
  realistic: "illuminated-initial--realistic",
};

export function IlluminatedInitial({ children, genre = "fantasy" }: IlluminatedInitialProps) {
  const initial = children.trim().charAt(0).toUpperCase() || "L";

  return (
    <span className={`illuminated-initial ${genreClassNames[genre]}`} aria-hidden="true">
      {initial}
    </span>
  );
}

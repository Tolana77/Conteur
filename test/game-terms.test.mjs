import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";

const directory = await mkdtemp(path.join(tmpdir(), "le-conteur-game-terms-"));
const outfile = path.join(directory, "game-terms.mjs");

try {
  await build({
    entryPoints: [path.resolve("src/ui/gameTerms.tsx")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    jsx: "automatic",
    logLevel: "silent",
  });

  const { renderHighlightedGameText } = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  const render = (text, mode = "narrative") => renderToStaticMarkup(
    createElement(Fragment, null, ...renderHighlightedGameText(text, mode)),
  );
  const isHighlighted = (text, mode = "narrative") => render(text, mode).includes("style=");

  assert.equal(isHighlighted("Cet objet dégage une force maléfique."), false);
  assert.equal(isHighlighted("L'histoire du royaume révèle une intelligence inquiétante."), false);
  assert.equal(isHighlighted("Une énergie arcane traverse la nature."), false);
  assert.equal(isHighlighted("Le soudard le traite de con."), false);

  assert.equal(isHighlighted("Effectuez un test de Force."), true);
  assert.equal(isHighlighted("Faites un jet de sauvegarde de Sagesse."), true);
  assert.equal(isHighlighted("Tentez un test d'Athlétisme (FOR)."), true);
  assert.equal(isHighlighted("La difficulté est DD 15 en Arcanes."), true);
  assert.equal(isHighlighted("Le résultat vaut 1d20 + DEX."), true);
  assert.equal(isHighlighted("Force : 16."), true);

  assert.equal(isHighlighted("Histoire", "mechanical"), true);
  assert.equal(isHighlighted("Test de Force", "none"), false);

  console.log("game-terms: ok");
} finally {
  await rm(directory, { recursive: true, force: true });
}
